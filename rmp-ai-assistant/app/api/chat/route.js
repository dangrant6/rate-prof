import { NextResponse } from 'next/server';
import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';
import fetch from 'node-fetch';
globalThis.fetch = fetch;

const systemPrompt = `
You are an AI assistant specializing in providing accurate information about professors. Follow these guidelines:
1. If the exact professor is found, provide their information first, including name, subject, university, rating, and a summary of their review.
2. If the exact professor is not found, clearly state this and then provide information about other professors that were returned in the search, explaining why they might be relevant.
3. Present information in a clear, bullet-point format.
4. If no information is available at all, politely state this and offer to help with other queries.
5. Do not invent or assume any information not provided in the data.
6. If the user asks about a specific aspect (e.g., rating, subject), focus on that in your response.
7. Offer to provide more details or answer follow-up questions about the professors mentioned.
`;

function validateResponse(response, query) {
  console.log('Validating response:', response);
  if (!response || typeof response !== 'string') {
    console.log('Invalid response type:', typeof response);
    return false;
  }
  const isValid = response.length > 0;
  console.log('Response validation result:', isValid);
  return isValid;
}

function postProcessResponse(response) {
  console.log('Post-processing response:', response);
  if (typeof response !== 'string') {
    console.log('Invalid response type in postProcessResponse:', typeof response);
    return 'An error occurred while processing the response.';
  }
  response = response.replace(/(.+?)\1+/g, "$1"); // Remove duplicates
  response = response.replace(/([.,!?])(?=\S)/g, "$1 "); // Fix spacing
  response = response.replace(/(^\w|[.!?]\s*\w)/g, m => m.toUpperCase()); // Capitalize sentences
  return response.trim();
}

function initializePinecone() {
  console.log('Initializing Pinecone');
  try {
    const pc = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY,
    });
    console.log('Pinecone initialized');
    return pc;
  } catch (error) {
    console.error('Failed to initialize Pinecone:', error);
    throw error;
  }
}

async function fetchWithRetry(index, query, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const queryEmbedding = await getQueryEmbedding(query);
      const rawResponse = await index.query({
        vector: queryEmbedding,
        topK: 5,
        includeMetadata: true
      });
      
      if (rawResponse && rawResponse.matches && rawResponse.matches.length > 0) {
        return rawResponse;
      } else {
        console.warn(`Attempt ${attempt}: No valid vector data found.`);
      }
    } catch (error) {
      console.error(`Attempt ${attempt}: Error querying Pinecone:`, error);
    }
  }
  return { matches: [] }; // Return an empty result after all retries
}
async function getQueryEmbedding(query) {
  const openai = new OpenAI();
  const response = await openai.embeddings.create({
    input: query,
    model: "text-embedding-ada-002"
  });
  return response.data[0].embedding;
}
export async function POST(req) {
  console.log('POST request received');
  try {
    const data = await req.json();
    console.log('Received data:', JSON.stringify(data, null, 2));

    const pc = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY,
    });
    const index = pc.index('rag');
    const openai = new OpenAI();

    const text = data[data.length - 1].content;
    console.log('User query text:', text);

    const professorNameMatch = text.match(/Dr\.\s[a-zA-Z\s]+/g);
    const processedQuery = professorNameMatch ? professorNameMatch[0].trim() : text.trim();

    if (!processedQuery) {
      console.error('Processed query is empty');
      throw new Error('Processed query is empty. Please provide a valid input.');
    }

    console.log('Processed query:', processedQuery);

    let results;
    try {
      const fetchResponse = await fetchWithRetry(index, processedQuery);

      console.log('Pinecone query results:', JSON.stringify(fetchResponse.matches, null, 2));

      // Filter for matching professors based on the fetched data
      let matchingProfessors = fetchResponse.matches.filter(prof =>
        prof.metadata.professor.toLowerCase().includes(processedQuery.toLowerCase())
      );

      if (matchingProfessors.length === 0 && fetchResponse.matches.length > 0) {
        matchingProfessors = fetchResponse.matches.slice(0, 3); // Default to top 3 results if no exact match
      }

      console.log('Matching professors:', JSON.stringify(matchingProfessors, null, 2));

      let resultString = '';
      if (matchingProfessors.length > 0) {
        const exactMatch = matchingProfessors[0];
        resultString = `
          Name: ${exactMatch.metadata.professor}
          Subject: ${exactMatch.metadata.subject}
          University: ${exactMatch.metadata.university}
          Rating: ${exactMatch.metadata.stars}/5
          Review: "${exactMatch.metadata.review}"
        `;
      } else {
        resultString = `No information found for "${processedQuery}".`;
      }

      console.log('Final result string:', resultString);

      const lastMessage = data[data.length - 1];
      const lastMessageContent = `${lastMessage.content}\n\nHere is the information I found:\n${resultString}`;
      const lastDataWithoutLastMessage = data.slice(0, data.length - 1);
      
      const completion = await openai.chat.completions.create({
        messages: [
          { role: 'system', content: systemPrompt },
          ...lastDataWithoutLastMessage,
          { role: 'user', content: lastMessageContent },
        ],
        model: 'gpt-3.5-turbo',
        stream: true,
      });

      const stream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          let accumulatedResponse = '';
          try {
            for await (const chunk of completion) {
              const content = chunk.choices[0]?.delta?.content || '';
              accumulatedResponse += content;
              const processedContent = postProcessResponse(accumulatedResponse);
              if (validateResponse(processedContent, text)) {
                const encodedText = encoder.encode(content);
                controller.enqueue(encodedText);
              }
            }
            console.log('Final accumulated response:', accumulatedResponse);
          } catch (err) {
            console.error('Streaming error:', err);
            controller.error('Streaming error occurred. Please try again.');
          } finally {
            controller.close();
          }
        },
      });

      return new NextResponse(stream);
    } catch (error) {
      console.error('Error in POST function:', error);
      return new NextResponse(JSON.stringify({ error: 'An error occurred while processing your request' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  } catch (error) {
    console.error('Error in POST function:', error);
    return new NextResponse(JSON.stringify({ error: 'An error occurred while processing your request' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

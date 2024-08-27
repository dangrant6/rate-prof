import { NextResponse } from 'next/server';
import axios from 'axios';
import cheerio from 'cheerio';
import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';

export async function POST(req) {
  try {
    const { link } = await req.json();
    
    // Fetch the webpage content
    const { data } = await axios.get(link);
    const $ = cheerio.load(data);

    // Extract relevant information (adjust selectors based on actual webpage structure)
    const professorName = $('h1.professor-name').text().trim();
    const overallRating = $('div.overall-rating').text().trim();
    const reviews = $('div.review').map((_, el) => $(el).text().trim()).get();

    // Process and insert data into Pinecone
    const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
    const index = pc.index('rag').namespace('ns1');
    const openai = new OpenAI();

    for (const review of reviews) {
      const embedding = await openai.embeddings.create({
        model: 'text-embedding-ada-002',
        input: review,
      });

      await index.upsert({
        vectors: [{
          id: `${professorName}-${Date.now()}`,
          values: embedding.data[0].embedding,
          metadata: {
            professorName,
            overallRating,
            review,
          },
        }],
      });
    }

    return NextResponse.json({ message: 'Professor data scraped and inserted successfully' });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'An error occurred while processing the link' }, { status: 500 });
  }
}
import time
from dotenv import load_dotenv
load_dotenv()
from pinecone import Pinecone, ServerlessSpec
from openai import OpenAI
import os
import json

# Initialize Pinecone
pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))

# Print Pinecone API key (redacted for security)
print(f"Pinecone API Key: {os.getenv('PINECONE_API_KEY')[:5]}...{os.getenv('PINECONE_API_KEY')[-5:]}")

# List existing indexes
print("Existing indexes:", pc.list_indexes())

# Delete the existing index if it exists
if "rag" in pc.list_indexes():
    print("Deleting existing 'rag' index...")
    pc.delete_index("rag")
    time.sleep(10)  # Wait for deletion to complete

# Create a Pinecone index
print("Creating 'rag' index...")
pc.create_index(
    name="rag",
    dimension=1536,
    metric="cosine",
    spec=ServerlessSpec(cloud="aws", region="us-east-1"),
)

# Wait for index to be created
print("Waiting for index to be created...")
time.sleep(60)

# Load the review data
data = json.load(open("reviews.json"))

processed_data = []
client = OpenAI()

# Create embeddings for each review
for review in data["reviews"]:
    response = client.embeddings.create(
        input=review['review'], model="text-embedding-ada-002"
    )
    embedding = response.data[0].embedding
    processed_data.append({
        "values": embedding,
        "id": review["professor"],
        "metadata": {
            "professor": review["professor"],
            "review": review["review"],
            "subject": review["subject"],
            "stars": review["stars"],
            "university": review["university"]
        }
    })

# Insert the embeddings into the Pinecone index
print("Inserting embeddings into Pinecone index...")
index = pc.Index("rag")

batch_size = 100
for i in range(0, len(processed_data), batch_size):
    batch = processed_data[i:i+batch_size]
    upsert_response = index.upsert(
        vectors=batch,
        namespace="ns1",
    )
    print(f"Batch {i//batch_size + 1} upserted count: {upsert_response['upserted_count']}")

# Wait for indexing to complete
print("Waiting for indexing to complete...")
time.sleep(60)

# Print index statistics
try:
    print("Index statistics:")
    print(index.describe_index_stats())
except Exception as e:
    print(f"Error getting index statistics: {str(e)}")

# Attempt a query to verify data is searchable
try:
    print("\nAttempting a query...")
    query_response = index.query(
        namespace="ns1",
        top_k=1,
        include_metadata=True,
        vector=[0.1]*1536  # dummy vector
    )
    print("Query response:")
    print(query_response)
except Exception as e:
    print(f"Error querying index: {str(e)}")
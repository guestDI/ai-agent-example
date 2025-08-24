import Fastify from "fastify";
import fetch from "node-fetch";
import cors from "@fastify/cors";
import { Pinecone } from "@pinecone-database/pinecone";
import fastifyEnv from "@fastify/env";

const fastify = Fastify();
const PINECONE_INDEX = "docs-index"; 

const schema = {
  type: 'object',
  required: ['OPENAI_API_KEY', 'PINECONE_API_KEY'],
  properties: {
    OPENAI_API_KEY: {
      type: 'string'
    },
    PINECONE_API_KEY: {
      type: 'string'
    }
  }
}

const options = {
  confKey: 'config',
  schema,
  dotenv: true,
  data: process.env
}

await fastify.register(cors, { origin: "*" });
await fastify.register(fastifyEnv, options)

// Init Pinecone
const pc = new Pinecone({ apiKey: fastify.config.PINECONE_API_KEY });
const index = pc.index(PINECONE_INDEX);

async function getEmbedding(text) {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${fastify.config.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: text,
      model: "text-embedding-3-small",
    }),
  });

  const data = await response.json();
  return data.data[0].embedding;
}

// RAG endpoint
fastify.post("/agent", async (req, reply) => {
  const { query } = req.body;
  if (!query) return reply.code(400).send({ error: "query is required" });

  // 1. Get query embeddings
  const queryEmbedding = await getEmbedding(query);

  // 2. Get relevant documents from Pinecone
  const results = await index.query({
    vector: queryEmbedding,
    topK: 3,
    includeMetadata: true,
  });

  const context = results.matches
    .map((m) => m.metadata.text)
    .join("\n---\n");

  // 3. Send to OpenAI with our context
  const systemPrompt = `
    You are a helpful AI assistant with access to context.
    Use the following information to answer the user's question.
    If the context is not enough, say you don't know.
  `;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${fastify.config.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Context:\n${context}\n\nQuestion: ${query}` },
      ],
    }),
  });

  const data = await response.json();
  const answer = data.choices[0].message?.content || "No answer";

  reply.send({ answer, context });
});

fastify.listen({ port: 3001 }, () => {
  console.log("🚀 Server running on http://localhost:3001");
});

import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import { Pinecone } from "@pinecone-database/pinecone";

const OPENAI_API_KEY = "";
const PINECONE_API_KEY = "s";
const PINECONE_INDEX = "docs-index"; // name of Pinecone index
const DOCS_DIR = "./docs"; // folder with text

// Init Pinecone
const pc = new Pinecone({ apiKey: PINECONE_API_KEY });
const index = pc.index(PINECONE_INDEX);

async function getEmbedding(text) {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
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

async function seed() {
  const files = fs.readdirSync(DOCS_DIR);

  let vectors = [];
  let idCounter = 1;

  for (const file of files) {
    const filePath = path.join(DOCS_DIR, file);
    const content = fs.readFileSync(filePath, "utf-8");

    // split text by ~500 chars
    const chunks = content.match(/.{1,500}(\s|$)/g);

    for (const chunk of chunks) {
      const embedding = await getEmbedding(chunk);

      vectors.push({
        id: `doc-${idCounter++}`,
        values: embedding,
        metadata: { text: chunk, source: file },
      });
    }
  }

  // Upload to Pinecone
  console.log("Uploading vectors to Pinecone...");
  await index.upsert(vectors);

  console.log(`✅ Uploaded ${vectors.length} vectors from ${files.length} files`);
}

seed();

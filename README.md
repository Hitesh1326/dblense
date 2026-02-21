# SchemaSight

**Chat with your database. Locally. Instantly.**

SchemaSight is a local-first VS Code extension that helps developers understand complex database schemas and legacy business logic buried in stored procedures — without sending a single byte to the cloud.

Connect to SQL Server, PostgreSQL, or MySQL. SchemaSight crawls your schema, reads your stored procedures, and uses a local AI model to generate plain-English summaries of what your business logic actually does. Then ask it anything.

- *"What does this billing procedure actually do?"*
- *"Which stored procedures touch the orders table?"*
- *"How do these two databases talk to each other?"*

Everything runs on your machine. Your credentials stay in VS Code. Your data never leaves.

## Prerequisites

- [Node.js](https://nodejs.org/) (LTS)
- [Ollama](https://ollama.ai/) (for local LLM)
- VS Code 1.85+

## Setup

```bash
npm install
npm run build
```

## Run (development)

1. Open this folder in VS Code.
2. Press **F5** to launch the Extension Development Host.
3. Click the SchemaSight icon in the activity bar or run **SchemaSight: Open Panel** from the command palette.

## Project structure

- `src/extension.ts` — extension entry point
- `src/db/` — connection management and DB drivers (mssql, pg, mysql2)
- `src/llm/` — Ollama client
- `src/embeddings/` — Transformers.js embeddings
- `src/vectorstore/` — LanceDB index
- `src/webview/` — React UI (Tailwind, ReactFlow)

## Implementation pipeline

1. **Schema crawler** — Reads DB metadata (tables, columns, stored procedure definitions). Produces structured schema for the rest of the pipeline.
2. **OllamaService** — Local LLM: summarizes schema/procedure text; later streams chat replies.
3. **EmbeddingService** — Transformers.js: text → vectors for semantic search.
4. **VectorStoreManager** — LanceDB: store and search chunks by embedding.
5. **Indexer** — Chunk crawl output → summarize (Ollama) → embed → upsert to vector store. **Progress reporting is built in from day one:** while indexing (e.g. 300+ stored procedures), the UI must show live progress such as *"Summarizing SP 47 of 312..."*. The Indexer accepts a progress callback and the MessageRouter streams `CRAWL_PROGRESS` to the webview; do not add progress as an afterthought.
6. **Chat RAG** — Embed question → vector search → build prompt with retrieved chunks → stream answer via Ollama.
7. **SchemaGraph** — Optional: visual map of tables and relationships (ReactFlow).

## License

MIT

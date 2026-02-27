# SchemaSight

**Chat with your database. Locally.**

VS Code extension: connect to SQL Server, PostgreSQL, or MySQL; index your schema and stored procedures; ask questions in plain English. All processing runs on your machine.

## Features

- Add and manage DB connections
- Crawl and index schema + stored procedures (local embeddings + LLM summaries)
- Chat: ask about tables, procedures, relationships (RAG over the index)
- Schema graph view

## Prerequisites

- Node.js (LTS)
- [Ollama](https://ollama.ai/) with a model pulled (e.g. `ollama pull llama3.1:8b`)
- VS Code 1.85+

## Run (development)

```bash
npm install
npm run build
```

Open the repo in VS Code → **F5** → SchemaSight icon in the sidebar or **SchemaSight: Open Panel** from the command palette.

## Architecture

### Project structure

| Path | Role |
|------|------|
| `src/extension.ts` | Entry point |
| `src/db/` | Connections, drivers (mssql, postgres, mysql) |
| `src/llm/` | Ollama client, prompts |
| `src/embeddings/` | Transformers.js (text → vectors) |
| `src/vectorstore/` | LanceDB index, indexer |
| `src/webview/` | React UI, message router |

### Pipeline

1. **Crawl** — DB metadata (tables, columns, views, stored procedures, functions) → structured schema.
2. **Summarize** — Ollama turns each chunk into a short summary.
3. **Embed** — Transformers.js turns summaries into vectors.
4. **Store** — LanceDB holds chunks + vectors (one table per connection). Each chunk has metadata: `type` (table/view/stored_procedure/function), `schema`, `connectionId`, `name`. After bulk upsert we create:
   - **Vector index** (IVF-PQ, cosine) on the embedding column — only when there are ≥256 rows (LanceDB's training minimum).
   - **FTS index** (BM25) on the `content` column — always.
5. **Chat (RAG)** — User question → embed → **hybrid search** (vector similarity + full-text on raw query) → **RRF rerank** → top-k chunks + DB name into system prompt → Ollama streams answer. Optional type filter can restrict search to e.g. only tables or only stored procedures.
6. **Schema graph** — Optional ReactFlow view of tables/relationships.

### Chat data flow

1. User sends a message → webview posts `CHAT` (connectionId, message, history) to the extension.
2. Extension embeds the message and runs **hybrid search**: vector search (cosine) and full-text search (BM25) on the raw message. Results are merged with **Reciprocal Rank Fusion (RRF)** and top-k chunks are taken.
3. System prompt is built from those chunks and the database name; Ollama is called with that prompt + history + user message, streaming on.
4. Extension posts `CHAT_CHUNK` (token) for each token, then `CHAT_DONE` or `CHAT_ERROR`.
5. Webview appends chunks to the assistant message and clears streaming state on done/error.

All embedding and LLM work is local; webview and extension talk via `postMessage`.

## License

MIT

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
   - **Vector index** (IVF-PQ, cosine) on the embedding column — only when there are ≥256 rows (LanceDB’s training minimum).
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

## Implementation plan (to be removed when done)

**Context management and summarization** — avoid unbounded token growth while preserving long-range references (e.g. “explain GetSupplierUpdates” from message 1 still works after many turns).

1. **Show X% context used** — Estimate total tokens (system + history + current message, e.g. chars/4) and the model’s context limit; show a Cursor-style “X% context used” (e.g. next to the input or in the chat header). User sees when they’re near the limit.

2. **Trigger at ~90%** — When estimated usage reaches ~90% of the model’s limit, run **summarization** (no hard cap; we don’t drop messages without summarizing).

3. **First summarization** — Summarize the **older** part of the conversation (all messages except the last N, e.g. last 10). Send to the model: **system + summary + last N full messages + current message**. The summary stays; “last N” is a sliding window of the most recent N messages.

4. **Notify user when summarization runs** — When we switch to summary + last N, show a brief notice in the UI (e.g. banner or inline near the input) so the user knows the conversation was summarized: older messages are now in a summary, and the last N are still sent in full. This avoids confusion about reduced recall and makes it clear that context was intentionally reduced, not lost by error. If the user wants full context again, they can start a new chat (Clear).

5. **Next messages** — For each new user message after that: send **system + same summary + sliding last N full messages + current message**. Do **not** drop the summary; only slide the “last N” window (oldest of the 10 drops, newest turn enters). Summary is kept so long-range references (e.g. proc name from early in the thread) remain in context.

6. **If we hit ~90% again** — Do another summarization round: merge “current summary + oldest part of the last N” into a **new** summary; keep only the **newest** N full messages (e.g. last 5). Then: system + new summary + last N full + current. Repeat as needed.

7. **No cap-only behaviour** — We do not truncate without summarizing; we either send full history (below 90%) or summary + last N full (after summarization). If even that exceeds the limit, then prompt the user to clear the conversation.

Once this is implemented and stable, remove this “Implementation plan” section from the README.

## License

MIT

# DBLens

Chat with your databases using a local AI — no cloud, no data leaving your machine.

A VS Code extension that connects to SQL Server, PostgreSQL, and MySQL, indexes schema and stored procedures with a local Ollama LLM and Transformers.js embeddings, stores them in LanceDB, and lets you ask questions in natural language inside VS Code.

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
3. Click the DBLens icon in the activity bar or run **DBLens: Open Panel** from the command palette.

## Project structure

- `src/extension.ts` — extension entry point
- `src/db/` — connection management and DB drivers (mssql, pg, mysql2)
- `src/llm/` — Ollama client
- `src/embeddings/` — Transformers.js embeddings
- `src/vectorstore/` — LanceDB index
- `src/webview/` — React UI (Tailwind, ReactFlow)

## License

MIT

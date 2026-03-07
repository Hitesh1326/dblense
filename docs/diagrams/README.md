# Architecture diagrams (Mermaid source)

The `.mmd` files in this folder are the Mermaid source for the architecture diagrams used in the main [README](../README.md). The rendered PNGs live in `assets/`:

| Source (`.mmd`)        | Rendered image (`assets/`)      |
|------------------------|----------------------------------|
| `system-architecture.mmd` | `system-architecture.png`   |
| `crawl-index-flow.mmd`    | `crawl-index-flow.png`       |
| `chat-rag-flow.mmd`       | `chat-rag-flow.png`          |

### Regenerating the PNGs

Install the Mermaid CLI (if needed):

```bash
npm install -g @mermaid-js/mermaid-cli
```

From the repo root, run the following to update the diagrams (use `-b transparent` for a transparent background):

```bash
mmdc -i docs/diagrams/system-architecture.mmd -o assets/system-architecture.png -b transparent
mmdc -i docs/diagrams/crawl-index-flow.mmd -o assets/crawl-index-flow.png -b transparent
mmdc -i docs/diagrams/chat-rag-flow.mmd -o assets/chat-rag-flow.png -b transparent
```

import type { CrawlProgress } from "../../shared/types";

export function formatCrawlPhase(progress: CrawlProgress): string {
  if (progress.phase === "connecting") return "Connecting…";
  if (progress.phase === "crawling_tables") {
    return progress.total > 0
      ? `Tables ${progress.current}/${progress.total}${progress.currentObject ? ` — ${progress.currentObject}` : ""}`
      : "Crawling tables…";
  }
  if (progress.phase === "crawling_views") {
    return progress.total > 0
      ? `Views ${progress.current}/${progress.total}${progress.currentObject ? ` — ${progress.currentObject}` : ""}`
      : "Crawling views…";
  }
  if (progress.phase === "crawling_sps") {
    return progress.total > 0
      ? `Stored procedures ${progress.current}/${progress.total}${progress.currentObject ? ` — ${progress.currentObject}` : ""}`
      : "Crawling stored procedures…";
  }
  if (progress.phase === "crawling_functions") {
    return progress.total > 0
      ? `Functions ${progress.current}/${progress.total}${progress.currentObject ? ` — ${progress.currentObject}` : ""}`
      : "Crawling functions…";
  }
  if (progress.phase === "summarizing") {
    return progress.total > 0
      ? `Summarizing ${progress.current}/${progress.total}${progress.currentObject ? ` — ${progress.currentObject}` : ""}`
      : "Summarizing…";
  }
  if (progress.phase === "embedding") {
    return progress.total > 0
      ? `Embedding ${progress.current}/${progress.total}`
      : "Embedding…";
  }
  if (progress.phase === "storing") return "Storing…";
  return `${progress.phase}…`;
}

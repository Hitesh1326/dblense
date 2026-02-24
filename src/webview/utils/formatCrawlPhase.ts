import type { CrawlProgress } from "../../shared/types";

/**
 * Human-readable label for the current crawl phase (e.g. "Tables 3/10 — dbo.Users", "Embedding…").
 * Uses progress.phase, progress.current/total, and progress.currentObject where applicable.
 *
 * @param progress - Current crawl progress from the extension.
 * @returns Short phase string for UI (progress indicators, banners).
 */
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

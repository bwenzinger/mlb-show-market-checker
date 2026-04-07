import dotenv from "dotenv";

dotenv.config();

function readInt(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

export const config = {
  port: readInt("PORT", 3000),
  showApiBase: process.env.SHOW_API_BASE ?? "https://mlb26.theshow.com",
  requestDelayMs: readInt("REQUEST_DELAY_MS", 150),
  listingConcurrency: readInt("LISTING_CONCURRENCY", 4),
  dbPath: process.env.DB_PATH ?? "market.sqlite",
};

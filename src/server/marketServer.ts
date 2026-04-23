import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";

import { calculateRobustAverage } from "../orderStats";
import type {
  CompletedOrder,
  ItemType,
  Listing,
  ListingsResponse,
} from "../showApi";

interface CollectorConfig {
  allowedOrigins: string[];
  apiBaseUrl: string;
  concurrency: number;
  dbPath: string;
  host: string;
  intervalMs: number;
  port: number;
  requestDelayMs: number;
  staticDir: string;
}

interface CollectionOptions {
  limit: number | null;
}

interface CollectionStats {
  cardsSeen: number;
  listingRequests: number;
  ordersSeen: number;
  ordersInserted: number;
  startedAt: string;
  finishedAt: string;
}

interface NormalizedOrder {
  orderTime: string;
  orderTimeText: string;
  price: number;
  duplicateOrdinal: number;
  sourceHash: string;
  rawJson: string;
}

interface OrderPriceRow {
  price: number;
  uuid: string;
}

interface CachedLiquidityRow {
  buyFillRatePerHour: number | null;
  buyMatchCount: number;
  confidence: number;
  computedAt: string;
  recentOrderCount: number;
  sellFillRatePerHour: number | null;
  sellMatchCount: number;
  uuid: string;
  windowHours: number;
}

interface LiquidityAggregateRow {
  buyMatches24h: number | null;
  buyMatches7d: number | null;
  recentOrderCount24h: number | null;
  recentOrderCount7d: number | null;
  sellMatches24h: number | null;
  sellMatches7d: number | null;
  uuid: string;
}

type SqlParams = Record<string, string | number | null>;
const MARKET_ITEM_TYPES: ItemType[] = [
  "mlb_card",
  "stadium",
  "equipment",
  "sponsorship",
  "unlockable",
];
const LIQUIDITY_SHORT_WINDOW_HOURS = 24;
const LIQUIDITY_LONG_WINDOW_HOURS = 7 * 24;
const LIQUIDITY_SHORT_WINDOW_MIN_MATCHES = 3;
const LIQUIDITY_FULL_CONFIDENCE_MATCHES = 5;
const LIQUIDITY_PRICE_BAND_MIN_STUBS = 50;
const LIQUIDITY_PRICE_BAND_PERCENT = 0.02;

if (fs.existsSync(".env")) {
  process.loadEnvFile(".env");
}

const config = readConfig();
const db = new DatabaseSync(config.dbPath);

db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS market_cards (
    uuid TEXT PRIMARY KEY,
    listing_name TEXT,
    name TEXT,
    team TEXT,
    team_short_name TEXT,
    rarity TEXT,
    ovr INTEGER,
    series TEXT,
    display_position TEXT,
    best_sell_price INTEGER,
    best_buy_price INTEGER,
    raw_json TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS stored_completed_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL,
    order_time TEXT NOT NULL,
    order_time_text TEXT NOT NULL,
    price INTEGER NOT NULL,
    duplicate_ordinal INTEGER NOT NULL,
    source_hash TEXT NOT NULL UNIQUE,
    captured_at TEXT NOT NULL,
    raw_json TEXT NOT NULL,
    FOREIGN KEY (uuid) REFERENCES market_cards(uuid)
  );

  CREATE INDEX IF NOT EXISTS idx_stored_completed_orders_uuid_time
    ON stored_completed_orders(uuid, order_time);

  CREATE TABLE IF NOT EXISTS market_card_averages (
    uuid TEXT PRIMARY KEY,
    average_price REAL,
    order_count INTEGER NOT NULL,
    computed_at TEXT NOT NULL,
    FOREIGN KEY (uuid) REFERENCES market_cards(uuid)
  );

  CREATE TABLE IF NOT EXISTS market_card_liquidity (
    uuid TEXT PRIMARY KEY,
    buy_match_count INTEGER NOT NULL,
    sell_match_count INTEGER NOT NULL,
    recent_order_count INTEGER NOT NULL,
    window_hours INTEGER NOT NULL,
    buy_fill_rate_per_hour REAL,
    sell_fill_rate_per_hour REAL,
    confidence REAL NOT NULL,
    computed_at TEXT NOT NULL,
    FOREIGN KEY (uuid) REFERENCES market_cards(uuid)
  );

  CREATE TABLE IF NOT EXISTS collector_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    status TEXT NOT NULL,
    cards_seen INTEGER DEFAULT 0,
    listing_requests INTEGER DEFAULT 0,
    orders_seen INTEGER DEFAULT 0,
    orders_inserted INTEGER DEFAULT 0,
    error TEXT
  );
`);

const upsertCardStmt = db.prepare(`
  INSERT INTO market_cards (
    uuid,
    listing_name,
    name,
    team,
    team_short_name,
    rarity,
    ovr,
    series,
    display_position,
    best_sell_price,
    best_buy_price,
    raw_json,
    updated_at
  ) VALUES (
    @uuid,
    @listing_name,
    @name,
    @team,
    @team_short_name,
    @rarity,
    @ovr,
    @series,
    @display_position,
    @best_sell_price,
    @best_buy_price,
    @raw_json,
    @updated_at
  )
  ON CONFLICT(uuid) DO UPDATE SET
    listing_name = excluded.listing_name,
    name = excluded.name,
    team = excluded.team,
    team_short_name = excluded.team_short_name,
    rarity = excluded.rarity,
    ovr = excluded.ovr,
    series = excluded.series,
    display_position = excluded.display_position,
    best_sell_price = excluded.best_sell_price,
    best_buy_price = excluded.best_buy_price,
    raw_json = excluded.raw_json,
    updated_at = excluded.updated_at
`);

const insertOrderStmt = db.prepare(`
  INSERT OR IGNORE INTO stored_completed_orders (
    uuid,
    order_time,
    order_time_text,
    price,
    duplicate_ordinal,
    source_hash,
    captured_at,
    raw_json
  ) VALUES (
    @uuid,
    @order_time,
    @order_time_text,
    @price,
    @duplicate_ordinal,
    @source_hash,
    @captured_at,
    @raw_json
  )
`);

const insertRunStmt = db.prepare(`
  INSERT INTO collector_runs (started_at, status)
  VALUES (?, 'running')
`);

const finishRunStmt = db.prepare(`
  UPDATE collector_runs
  SET
    finished_at = @finished_at,
    status = @status,
    cards_seen = @cards_seen,
    listing_requests = @listing_requests,
    orders_seen = @orders_seen,
    orders_inserted = @orders_inserted,
    error = @error
  WHERE id = @id
`);

const selectCachedAveragesStmt = db.prepare(`
  SELECT
    uuid,
    average_price AS averagePrice,
    order_count AS orderCount
  FROM market_card_averages
  ORDER BY uuid ASC
`);

const selectCachedAverageStmt = db.prepare(`
  SELECT
    uuid,
    average_price AS averagePrice,
    order_count AS orderCount
  FROM market_card_averages
  WHERE uuid = ?
`);

const selectCachedLiquidityStmt = db.prepare(`
  SELECT
    uuid,
    buy_match_count AS buyMatchCount,
    sell_match_count AS sellMatchCount,
    recent_order_count AS recentOrderCount,
    window_hours AS windowHours,
    buy_fill_rate_per_hour AS buyFillRatePerHour,
    sell_fill_rate_per_hour AS sellFillRatePerHour,
    confidence,
    computed_at AS computedAt
  FROM market_card_liquidity
  WHERE uuid = ?
`);

const selectCachedLiquiditiesStmt = db.prepare(`
  SELECT
    uuid,
    buy_match_count AS buyMatchCount,
    sell_match_count AS sellMatchCount,
    recent_order_count AS recentOrderCount,
    window_hours AS windowHours,
    buy_fill_rate_per_hour AS buyFillRatePerHour,
    sell_fill_rate_per_hour AS sellFillRatePerHour,
    confidence,
    computed_at AS computedAt
  FROM market_card_liquidity
  ORDER BY uuid ASC
`);

const selectAllOrderPricesStmt = db.prepare(`
  SELECT
    uuid,
    price
  FROM stored_completed_orders
  ORDER BY uuid ASC
`);

const selectOrderPricesForUuidStmt = db.prepare(`
  SELECT price
  FROM stored_completed_orders
  WHERE uuid = ?
`);

const upsertCachedAverageStmt = db.prepare(`
  INSERT INTO market_card_averages (
    uuid,
    average_price,
    order_count,
    computed_at
  ) VALUES (
    @uuid,
    @average_price,
    @order_count,
    @computed_at
  )
  ON CONFLICT(uuid) DO UPDATE SET
    average_price = excluded.average_price,
    order_count = excluded.order_count,
    computed_at = excluded.computed_at
`);

const deleteCachedAverageStmt = db.prepare(`
  DELETE FROM market_card_averages
  WHERE uuid = ?
`);

const deleteCachedAveragesStmt = db.prepare(`
  DELETE FROM market_card_averages
`);

const upsertCachedLiquidityStmt = db.prepare(`
  INSERT INTO market_card_liquidity (
    uuid,
    buy_match_count,
    sell_match_count,
    recent_order_count,
    window_hours,
    buy_fill_rate_per_hour,
    sell_fill_rate_per_hour,
    confidence,
    computed_at
  ) VALUES (
    @uuid,
    @buy_match_count,
    @sell_match_count,
    @recent_order_count,
    @window_hours,
    @buy_fill_rate_per_hour,
    @sell_fill_rate_per_hour,
    @confidence,
    @computed_at
  )
  ON CONFLICT(uuid) DO UPDATE SET
    buy_match_count = excluded.buy_match_count,
    sell_match_count = excluded.sell_match_count,
    recent_order_count = excluded.recent_order_count,
    window_hours = excluded.window_hours,
    buy_fill_rate_per_hour = excluded.buy_fill_rate_per_hour,
    sell_fill_rate_per_hour = excluded.sell_fill_rate_per_hour,
    confidence = excluded.confidence,
    computed_at = excluded.computed_at
`);

const deleteCachedLiquiditiesStmt = db.prepare(`
  DELETE FROM market_card_liquidity
`);

const selectLiquidityAggregatesStmt = db.prepare(`
  SELECT
    mc.uuid,
    SUM(
      CASE
        WHEN o.order_time >= @cutoff_24
          AND mc.best_buy_price IS NOT NULL
          AND mc.best_buy_price > 0
          AND o.price BETWEEN
            mc.best_buy_price - MAX(${LIQUIDITY_PRICE_BAND_MIN_STUBS}, CAST(ROUND(mc.best_buy_price * ${LIQUIDITY_PRICE_BAND_PERCENT}, 0) AS INTEGER))
            AND
            mc.best_buy_price + MAX(${LIQUIDITY_PRICE_BAND_MIN_STUBS}, CAST(ROUND(mc.best_buy_price * ${LIQUIDITY_PRICE_BAND_PERCENT}, 0) AS INTEGER))
        THEN 1
        ELSE 0
      END
    ) AS buyMatches24h,
    SUM(
      CASE
        WHEN o.order_time >= @cutoff_24
          AND mc.best_sell_price IS NOT NULL
          AND mc.best_sell_price > 0
          AND o.price BETWEEN
            mc.best_sell_price - MAX(${LIQUIDITY_PRICE_BAND_MIN_STUBS}, CAST(ROUND(mc.best_sell_price * ${LIQUIDITY_PRICE_BAND_PERCENT}, 0) AS INTEGER))
            AND
            mc.best_sell_price + MAX(${LIQUIDITY_PRICE_BAND_MIN_STUBS}, CAST(ROUND(mc.best_sell_price * ${LIQUIDITY_PRICE_BAND_PERCENT}, 0) AS INTEGER))
        THEN 1
        ELSE 0
      END
    ) AS sellMatches24h,
    SUM(
      CASE
        WHEN mc.best_buy_price IS NOT NULL
          AND mc.best_buy_price > 0
          AND o.price BETWEEN
            mc.best_buy_price - MAX(${LIQUIDITY_PRICE_BAND_MIN_STUBS}, CAST(ROUND(mc.best_buy_price * ${LIQUIDITY_PRICE_BAND_PERCENT}, 0) AS INTEGER))
            AND
            mc.best_buy_price + MAX(${LIQUIDITY_PRICE_BAND_MIN_STUBS}, CAST(ROUND(mc.best_buy_price * ${LIQUIDITY_PRICE_BAND_PERCENT}, 0) AS INTEGER))
        THEN 1
        ELSE 0
      END
    ) AS buyMatches7d,
    SUM(
      CASE
        WHEN mc.best_sell_price IS NOT NULL
          AND mc.best_sell_price > 0
          AND o.price BETWEEN
            mc.best_sell_price - MAX(${LIQUIDITY_PRICE_BAND_MIN_STUBS}, CAST(ROUND(mc.best_sell_price * ${LIQUIDITY_PRICE_BAND_PERCENT}, 0) AS INTEGER))
            AND
            mc.best_sell_price + MAX(${LIQUIDITY_PRICE_BAND_MIN_STUBS}, CAST(ROUND(mc.best_sell_price * ${LIQUIDITY_PRICE_BAND_PERCENT}, 0) AS INTEGER))
        THEN 1
        ELSE 0
      END
    ) AS sellMatches7d,
    SUM(CASE WHEN o.order_time >= @cutoff_24 THEN 1 ELSE 0 END) AS recentOrderCount24h,
    COUNT(o.uuid) AS recentOrderCount7d
  FROM market_cards mc
  LEFT JOIN stored_completed_orders o
    ON o.uuid = mc.uuid
   AND o.order_time >= @cutoff_7d
  GROUP BY mc.uuid
  ORDER BY mc.uuid ASC
`);

const selectLiquidityAggregateForUuidStmt = db.prepare(`
  SELECT
    @uuid AS uuid,
    SUM(
      CASE
        WHEN order_time >= @cutoff_24
          AND @best_buy_price IS NOT NULL
          AND @best_buy_price > 0
          AND price BETWEEN @best_buy_price - @buy_band_width
                        AND @best_buy_price + @buy_band_width
        THEN 1
        ELSE 0
      END
    ) AS buyMatches24h,
    SUM(
      CASE
        WHEN order_time >= @cutoff_24
          AND @best_sell_price IS NOT NULL
          AND @best_sell_price > 0
          AND price BETWEEN @best_sell_price - @sell_band_width
                        AND @best_sell_price + @sell_band_width
        THEN 1
        ELSE 0
      END
    ) AS sellMatches24h,
    SUM(
      CASE
        WHEN @best_buy_price IS NOT NULL
          AND @best_buy_price > 0
          AND price BETWEEN @best_buy_price - @buy_band_width
                        AND @best_buy_price + @buy_band_width
        THEN 1
        ELSE 0
      END
    ) AS buyMatches7d,
    SUM(
      CASE
        WHEN @best_sell_price IS NOT NULL
          AND @best_sell_price > 0
          AND price BETWEEN @best_sell_price - @sell_band_width
                        AND @best_sell_price + @sell_band_width
        THEN 1
        ELSE 0
      END
    ) AS sellMatches7d,
    SUM(CASE WHEN order_time >= @cutoff_24 THEN 1 ELSE 0 END) AS recentOrderCount24h,
    COUNT(*) AS recentOrderCount7d
  FROM stored_completed_orders
  WHERE uuid = @uuid
    AND order_time >= @cutoff_7d
`);

let collectionInFlight: Promise<CollectionStats> | null = null;

async function main() {
  const cliOptions = parseCliOptions();

  if (cliOptions.once) {
    const stats = await collectOnce({ limit: cliOptions.limit });
    console.log("Collection complete:", stats);
    return;
  }

  warmAverageCacheIfEmpty();
  warmLiquidityCacheIfEmpty();
  startHttpServer();
  void collectOnce({ limit: cliOptions.limit }).catch((error) => {
    console.error("Initial collection failed:", error);
  });

  windowlessSetInterval(() => {
    void collectOnce({ limit: cliOptions.limit }).catch((error) => {
      console.error("Scheduled collection failed:", error);
    });
  }, config.intervalMs);
}

function startHttpServer() {
  const app = express();

  app.use(cors);
  app.use(express.json());

  app.options(/.*/, (_req, res) => {
    res.sendStatus(204);
  });

  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      collectionInProgress: collectionInFlight !== null,
      counts: getCounts(),
      lastRun: getLastRun(),
    });
  });

  app.get("/api/show/listings.json", async (req, res) => {
    await sendShowApiJson(req, res, "/listings.json");
  });

  app.get("/api/show/items.json", async (req, res) => {
    await sendShowApiJson(req, res, "/items.json");
  });

  app.get("/api/show/listing.json", async (req, res) => {
    await sendShowListingJson(req, res);
  });

  app.get("/api/cards/:uuid/orders", (req, res) => {
    const days = clampInt(req.query.days, 7, 1, 3650);
    const cutoff = toSqlDateTimeUtc(
      new Date(Date.now() - days * 24 * 60 * 60 * 1000),
    );
    const rows = db
      .prepare(
        `
          SELECT
            order_time_text AS date,
            price,
            duplicate_ordinal
          FROM stored_completed_orders
          WHERE uuid = ?
            AND order_time >= ?
          ORDER BY order_time ASC, id ASC
        `,
      )
      .all(req.params.uuid, cutoff);

    res.json({ source: "local-db", days, orders: rows });
  });

  app.get("/api/cards/liquidity", (_req, res) => {
    const rows = selectCachedLiquiditiesStmt.all() as unknown as CachedLiquidityRow[];

    res.json({ source: "local-db-cache", liquidity: rows });
  });

  app.get("/api/cards/:uuid/liquidity", (req, res) => {
    const row = selectCachedLiquidityStmt.get(req.params.uuid) as
      | CachedLiquidityRow
      | undefined;

    res.json({ source: "local-db-cache", liquidity: row ?? null });
  });

  app.get("/api/cards/averages", (_req, res) => {
    const rows = selectCachedAveragesStmt.all() as Array<{
      averagePrice: number | null;
      orderCount: number;
      uuid: string;
    }>;

    res.json({ source: "local-db-cache", averages: rows });
  });

  app.get("/api/cards/:uuid/average", (req, res) => {
    const row = selectCachedAverageStmt.get(req.params.uuid) as
      | {
          averagePrice: number | null;
          orderCount: number;
          uuid: string;
        }
      | undefined;

    res.json({ source: "local-db-cache", average: row ?? null });
  });

  app.post("/api/collect", async (req, res) => {
    try {
      const limit = clampOptionalInt(req.query.limit ?? req.body?.limit);
      const stats = await collectOnce({ limit });
      res.json({ ok: true, stats });
    } catch (error) {
      res.status(500).json({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  serveFrontend(app);

  app.listen(config.port, config.host, () => {
    console.log(`Market history service listening on http://${config.host}:${config.port}`);
    console.log(`Polling every ${Math.round(config.intervalMs / 60000)} minute(s)`);
  });
}

function serveFrontend(app: express.Express) {
  const indexPath = path.join(config.staticDir, "index.html");

  if (!fs.existsSync(indexPath)) {
    console.log(
      `No frontend build found at ${indexPath}; API-only mode is active.`,
    );
    return;
  }

  app.use(express.static(config.staticDir, { index: false }));
  app.get(/^(?!\/api(?:\/|$)).*/, (_req, res) => {
    res.sendFile(indexPath);
  });

  console.log(`Serving frontend from ${config.staticDir}`);
}

function cors(req: Request, res: Response, next: NextFunction) {
  const origin = req.get("origin");

  if (origin && isAllowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  } else if (config.allowedOrigins.includes("*")) {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }

  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    req.get("access-control-request-headers") ?? "Content-Type,Accept",
  );

  next();
}

async function sendShowApiJson(
  req: Request,
  res: Response,
  path: "/items.json" | "/listing.json" | "/listings.json",
) {
  try {
    const json = await requestJson<unknown>(path, toShowSearchParams(req.query));
    res.json(json);
  } catch (error) {
    res.status(502).json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function sendShowListingJson(req: Request, res: Response) {
  try {
    const detail = await requestJson<Listing>(
      "/listing.json",
      toShowSearchParams(req.query),
    );

    try {
        const capturedAt = new Date().toISOString();
        const stats = persistListingDetail(detail, capturedAt);
        refreshAverageCacheAfterPersist(detail, stats.ordersInserted, capturedAt);
        refreshLiquidityCacheAfterPersist(detail, capturedAt);
        res.setHeader("X-Market-Orders-Seen", String(stats.ordersSeen));
        res.setHeader("X-Market-Orders-Inserted", String(stats.ordersInserted));
      } catch (error) {
      console.error(
        "Failed to persist on-demand listing refresh:",
        error instanceof Error ? error.message : String(error),
      );
    }

    res.json(detail);
  } catch (error) {
    res.status(502).json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function toShowSearchParams(
  query: Request["query"],
): Record<string, string | number | undefined> {
  const params: Record<string, string | number | undefined> = {};

  for (const [key, rawValue] of Object.entries(query)) {
    const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;
    if (typeof value === "string" && value.length > 0) {
      params[key] = value;
    }
  }

  return params;
}

function isAllowedOrigin(origin: string): boolean {
  return (
    config.allowedOrigins.includes("*") ||
    config.allowedOrigins.includes(origin)
  );
}

async function collectOnce(options: CollectionOptions): Promise<CollectionStats> {
  if (collectionInFlight) {
    return collectionInFlight;
  }

  collectionInFlight = runCollection(options).finally(() => {
    collectionInFlight = null;
  });

  return collectionInFlight;
}

async function runCollection({ limit }: CollectionOptions): Promise<CollectionStats> {
  const startedAt = new Date().toISOString();
  const run = insertRunStmt.run(startedAt);
  const runId = Number(run.lastInsertRowid);
  const stats: CollectionStats = {
    cardsSeen: 0,
    listingRequests: 0,
    ordersSeen: 0,
    ordersInserted: 0,
    startedAt,
    finishedAt: "",
  };

  try {
    console.log("Collecting market listings...");
    const listings = await fetchAllMarketListings(limit);
    const selectedListings = limit === null ? listings : listings.slice(0, limit);
    stats.cardsSeen = selectedListings.length;

    withTransaction(() => {
      for (const listing of selectedListings) {
        upsertMarketCard(listing, startedAt);
      }
    });

    console.log(`Fetching completed orders for ${selectedListings.length} listing(s)...`);

    await mapConcurrent(selectedListings, config.concurrency, async (listing) => {
      const uuid = listing.item?.uuid;
      if (!uuid) return;

      try {
        const detail = await fetchListingByUuid(uuid);
        stats.listingRequests += 1;

        const capturedAt = new Date().toISOString();
        const listingStats = persistListingDetail(detail, capturedAt);
        refreshAverageCacheAfterPersist(
          detail,
          listingStats.ordersInserted,
          capturedAt,
        );
        refreshLiquidityCacheAfterPersist(detail, capturedAt);
        stats.ordersSeen += listingStats.ordersSeen;
        stats.ordersInserted += listingStats.ordersInserted;
      } catch (error) {
        console.error(
          `Failed to collect listing ${uuid}:`,
          error instanceof Error ? error.message : String(error),
        );
      }
    });

    stats.finishedAt = new Date().toISOString();
    finishRun(runId, "success", stats, null);
    console.log(
      `Collection finished: ${stats.ordersInserted} new order(s), ${stats.ordersSeen} seen`,
    );
    return stats;
  } catch (error) {
    stats.finishedAt = new Date().toISOString();
    const message = error instanceof Error ? error.message : String(error);
    finishRun(runId, "error", stats, message);
    throw error;
  }
}

async function fetchAllMarketListings(limit: number | null): Promise<Listing[]> {
  if (limit !== null) {
    const listings: Listing[] = [];

    for (const type of MARKET_ITEM_TYPES) {
      const typeListings = await fetchAllMarketListingsForType(type, limit);
      listings.push(...typeListings);
      if (listings.length >= limit) {
        break;
      }
    }

    return listings.slice(0, limit);
  }

  const listingsByType = await mapConcurrentResults(
    MARKET_ITEM_TYPES,
    MARKET_ITEM_TYPES.length,
    async (type) => fetchAllMarketListingsForType(type, null),
  );

  return listingsByType.flat();
}

async function fetchAllMarketListingsForType(
  type: ItemType,
  limit: number | null,
): Promise<Listing[]> {
  const listings: Listing[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const response = await requestJson<ListingsResponse>("/listings.json", {
      type,
      page,
      sort: "rank",
      order: "desc",
    });

    listings.push(...(response.listings ?? []));
    totalPages = Number(response.total_pages ?? page);
    console.log(`[${type}] listings page ${page}/${totalPages}`);
    if (limit !== null && listings.length >= limit) {
      break;
    }
    page += 1;
  } while (page <= totalPages);

  return limit === null ? listings : listings.slice(0, limit);
}

async function fetchListingByUuid(uuid: string): Promise<Listing> {
  return requestJson<Listing>("/listing.json", { uuid });
}

function persistListingDetail(
  listing: Listing,
  capturedAt: string,
): { ordersInserted: number; ordersSeen: number } {
  const uuid = listing.item?.uuid;
  if (!uuid) return { ordersInserted: 0, ordersSeen: 0 };

  upsertMarketCard(listing, capturedAt);
  const normalizedOrders = normalizeCompletedOrders(
    uuid,
    listing.completed_orders ?? [],
  );
  let ordersInserted = 0;

  withTransaction(() => {
    for (const order of normalizedOrders) {
      ordersInserted += insertStoredOrder(uuid, order, capturedAt);
    }
  });

  return {
    ordersInserted,
    ordersSeen: normalizedOrders.length,
  };
}

function refreshAverageCacheAfterPersist(
  listing: Listing,
  ordersInserted: number,
  computedAt: string,
) {
  const uuid = listing.item?.uuid;
  if (!uuid) return;

  if (ordersInserted > 0 || !hasCachedAverage(uuid)) {
    refreshCachedAverageForUuid(uuid, computedAt);
  }
}

function refreshLiquidityCacheAfterPersist(
  listing: Listing,
  computedAt: string,
) {
  const uuid = listing.item?.uuid;
  if (!uuid) return;

  refreshCachedLiquidityForListing(listing, computedAt);
}

function warmAverageCacheIfEmpty() {
  if (
    countTable("market_card_averages") > 0 ||
    countTable("stored_completed_orders") === 0
  ) {
    return;
  }

  const startedAt = Date.now();
  console.log("Building cached order averages...");
  const refreshedCount = rebuildAverageCache(new Date().toISOString());
  console.log(
    `Cached ${refreshedCount} order average(s) in ${Math.round(
      (Date.now() - startedAt) / 1000,
    )} second(s).`,
  );
}

function warmLiquidityCacheIfEmpty() {
  if (
    countTable("market_card_liquidity") > 0 ||
    countTable("market_cards") === 0 ||
    countTable("stored_completed_orders") === 0
  ) {
    return;
  }

  const startedAt = Date.now();
  console.log("Building cached liquidity stats...");
  const refreshedCount = rebuildLiquidityCache(new Date().toISOString());
  console.log(
    `Cached ${refreshedCount} liquidity row(s) in ${Math.round(
      (Date.now() - startedAt) / 1000,
    )} second(s).`,
  );
}

function rebuildAverageCache(computedAt: string): number {
  let currentUuid: string | null = null;
  let prices: number[] = [];
  let refreshedCount = 0;

  withTransaction(() => {
    deleteCachedAveragesStmt.run();

    const orderPriceRows =
      selectAllOrderPricesStmt.iterate() as Iterable<OrderPriceRow>;

    for (const row of orderPriceRows) {
      if (currentUuid !== null && row.uuid !== currentUuid) {
        upsertCachedAverage(currentUuid, prices, computedAt);
        refreshedCount += 1;
        prices = [];
      }

      currentUuid = row.uuid;
      prices.push(row.price);
    }

    if (currentUuid !== null) {
      upsertCachedAverage(currentUuid, prices, computedAt);
      refreshedCount += 1;
    }
  });

  return refreshedCount;
}

function refreshCachedAverageForUuid(uuid: string, computedAt: string) {
  const prices = (
    selectOrderPricesForUuidStmt.all(uuid) as Array<{ price: number }>
  ).map((row) => row.price);

  if (prices.length === 0) {
    deleteCachedAverageStmt.run(uuid);
    return;
  }

  upsertCachedAverage(uuid, prices, computedAt);
}

function rebuildLiquidityCache(computedAt: string): number {
  const now = Date.now();
  const cutoff24 = toSqlDateTimeUtc(
    new Date(now - LIQUIDITY_SHORT_WINDOW_HOURS * 60 * 60 * 1000),
  );
  const cutoff7d = toSqlDateTimeUtc(
    new Date(now - LIQUIDITY_LONG_WINDOW_HOURS * 60 * 60 * 1000),
  );
  const rows = selectLiquidityAggregatesStmt.all(
    toSqlParams({
      cutoff_24: cutoff24,
      cutoff_7d: cutoff7d,
    }),
  ) as unknown as LiquidityAggregateRow[];

  withTransaction(() => {
    deleteCachedLiquiditiesStmt.run();

    for (const row of rows) {
      upsertCachedLiquidity(buildCachedLiquidityRow(row, computedAt));
    }
  });

  return rows.length;
}

function refreshCachedLiquidityForListing(listing: Listing, computedAt: string) {
  const uuid = listing.item?.uuid;
  if (!uuid) return;

  const now = Date.now();
  const bestBuyPrice = toInt(listing.best_buy_price);
  const bestSellPrice = toInt(listing.best_sell_price);
  const aggregate = selectLiquidityAggregateForUuidStmt.get(
    toSqlParams({
      uuid,
      cutoff_24: toSqlDateTimeUtc(
        new Date(now - LIQUIDITY_SHORT_WINDOW_HOURS * 60 * 60 * 1000),
      ),
      cutoff_7d: toSqlDateTimeUtc(
        new Date(now - LIQUIDITY_LONG_WINDOW_HOURS * 60 * 60 * 1000),
      ),
      best_buy_price: bestBuyPrice,
      best_sell_price: bestSellPrice,
      buy_band_width: getLiquidityBandWidth(bestBuyPrice),
      sell_band_width: getLiquidityBandWidth(bestSellPrice),
    }),
  ) as LiquidityAggregateRow | undefined;

  upsertCachedLiquidity(
    buildCachedLiquidityRow(
      aggregate ?? {
        buyMatches24h: 0,
        buyMatches7d: 0,
        recentOrderCount24h: 0,
        recentOrderCount7d: 0,
        sellMatches24h: 0,
        sellMatches7d: 0,
        uuid,
      },
      computedAt,
    ),
  );
}

function upsertCachedAverage(
  uuid: string,
  prices: number[],
  computedAt: string,
) {
  upsertCachedAverageStmt.run(
    toSqlParams({
      uuid,
      average_price: calculateRobustAverage(prices),
      order_count: prices.length,
      computed_at: computedAt,
    }),
  );
}

function hasCachedAverage(uuid: string): boolean {
  return selectCachedAverageStmt.get(uuid) !== undefined;
}

function upsertCachedLiquidity(row: CachedLiquidityRow) {
  upsertCachedLiquidityStmt.run(
    toSqlParams({
      uuid: row.uuid,
      buy_match_count: row.buyMatchCount,
      sell_match_count: row.sellMatchCount,
      recent_order_count: row.recentOrderCount,
      window_hours: row.windowHours,
      buy_fill_rate_per_hour: row.buyFillRatePerHour,
      sell_fill_rate_per_hour: row.sellFillRatePerHour,
      confidence: row.confidence,
      computed_at: row.computedAt,
    }),
  );
}

function buildCachedLiquidityRow(
  row: LiquidityAggregateRow,
  computedAt: string,
): CachedLiquidityRow {
  const buyMatches24h = positiveInt(row.buyMatches24h);
  const sellMatches24h = positiveInt(row.sellMatches24h);
  const buyMatches7d = positiveInt(row.buyMatches7d);
  const sellMatches7d = positiveInt(row.sellMatches7d);
  const recentOrderCount24h = positiveInt(row.recentOrderCount24h);
  const recentOrderCount7d = positiveInt(row.recentOrderCount7d);
  const useShortWindow =
    buyMatches24h >= LIQUIDITY_SHORT_WINDOW_MIN_MATCHES &&
    sellMatches24h >= LIQUIDITY_SHORT_WINDOW_MIN_MATCHES;
  const windowHours = useShortWindow
    ? LIQUIDITY_SHORT_WINDOW_HOURS
    : LIQUIDITY_LONG_WINDOW_HOURS;
  const buyMatchCount = useShortWindow ? buyMatches24h : buyMatches7d;
  const sellMatchCount = useShortWindow ? sellMatches24h : sellMatches7d;
  const recentOrderCount = useShortWindow
    ? recentOrderCount24h
    : recentOrderCount7d;
  const minMatchCount = Math.min(buyMatchCount, sellMatchCount);

  return {
    uuid: row.uuid,
    buyMatchCount,
    sellMatchCount,
    recentOrderCount,
    windowHours,
    buyFillRatePerHour:
      buyMatchCount > 0 ? buyMatchCount / windowHours : null,
    sellFillRatePerHour:
      sellMatchCount > 0 ? sellMatchCount / windowHours : null,
    confidence:
      minMatchCount > 0
        ? Math.min(1, minMatchCount / LIQUIDITY_FULL_CONFIDENCE_MATCHES)
        : 0,
    computedAt,
  };
}

function getLiquidityBandWidth(price: number | null): number {
  if (price === null || price <= 0) {
    return LIQUIDITY_PRICE_BAND_MIN_STUBS;
  }

  return Math.max(
    LIQUIDITY_PRICE_BAND_MIN_STUBS,
    Math.round(price * LIQUIDITY_PRICE_BAND_PERCENT),
  );
}

function positiveInt(value: number | null): number {
  return Math.max(Math.trunc(value ?? 0), 0);
}

function upsertMarketCard(listing: Listing, updatedAt: string) {
  const item = listing.item;
  const uuid = item?.uuid;
  if (!uuid) return;

  upsertCardStmt.run(
    toSqlParams({
      uuid,
      listing_name: stringOrNull(listing.listing_name),
      name: stringOrNull(item.name),
      team: stringOrNull(item.team),
      team_short_name: stringOrNull(item.team_short_name),
      rarity: stringOrNull(item.rarity),
      ovr: toInt(item.ovr),
      series: stringOrNull(item.series),
      display_position: stringOrNull(item.display_position),
      best_sell_price: toInt(listing.best_sell_price),
      best_buy_price: toInt(listing.best_buy_price),
      raw_json: JSON.stringify(listing),
      updated_at: updatedAt,
    }),
  );
}

function normalizeCompletedOrders(
  uuid: string,
  orders: CompletedOrder[],
): NormalizedOrder[] {
  const seen = new Map<string, number>();
  const normalized: NormalizedOrder[] = [];

  for (const order of orders) {
    const orderTimeText = stringOrNull(order.date);
    const orderTime = normalizeOrderTime(orderTimeText);
    const price = toInt(order.price);
    if (!orderTimeText || !orderTime || price === null) continue;

    const duplicateKey = `${orderTime}|${price}`;
    const duplicateOrdinal = (seen.get(duplicateKey) ?? 0) + 1;
    seen.set(duplicateKey, duplicateOrdinal);

    const sourceHash = crypto
      .createHash("sha256")
      .update(JSON.stringify({ uuid, orderTime, price, duplicateOrdinal }))
      .digest("hex");

    normalized.push({
      orderTime,
      orderTimeText,
      price,
      duplicateOrdinal,
      sourceHash,
      rawJson: JSON.stringify(order),
    });
  }

  return normalized;
}

function insertStoredOrder(
  uuid: string,
  order: NormalizedOrder,
  capturedAt: string,
): number {
  const result = insertOrderStmt.run(
    toSqlParams({
      uuid,
      order_time: order.orderTime,
      order_time_text: order.orderTimeText,
      price: order.price,
      duplicate_ordinal: order.duplicateOrdinal,
      source_hash: order.sourceHash,
      captured_at: capturedAt,
      raw_json: order.rawJson,
    }),
  );

  return Number(result.changes);
}

async function requestJson<T>(
  path: string,
  searchParams: Record<string, string | number | undefined> = {},
): Promise<T> {
  const url = new URL(`${trimTrailingSlash(config.apiBaseUrl)}${path}`);

  for (const [key, value] of Object.entries(searchParams)) {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "mlb-show-market-checker/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`The Show API returned HTTP ${response.status} for ${url}`);
  }

  const json = (await response.json()) as T;
  await sleep(config.requestDelayMs);
  return json;
}

async function mapConcurrent<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      await worker(items[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, runWorker),
  );
}

async function mapConcurrentResults<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, runWorker),
  );

  return results;
}

function withTransaction<T>(fn: () => T): T {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function finishRun(
  id: number,
  status: "success" | "error",
  stats: CollectionStats,
  error: string | null,
) {
  finishRunStmt.run(
    toSqlParams({
      id,
      status,
      finished_at: stats.finishedAt,
      cards_seen: stats.cardsSeen,
      listing_requests: stats.listingRequests,
      orders_seen: stats.ordersSeen,
      orders_inserted: stats.ordersInserted,
      error,
    }),
  );
}

function getCounts() {
  return {
    averages: countTable("market_card_averages"),
    cards: countTable("market_cards"),
    liquidity: countTable("market_card_liquidity"),
    orders: countTable("stored_completed_orders"),
    runs: countTable("collector_runs"),
  };
}

function getLastRun() {
  return db
    .prepare(
      `
        SELECT *
        FROM collector_runs
        ORDER BY id DESC
        LIMIT 1
      `,
    )
    .get();
}

function countTable(tableName: string): number {
  const row = db
    .prepare(`SELECT COUNT(*) AS count FROM ${tableName}`)
    .get() as { count: number };
  return row.count;
}

function readConfig(): CollectorConfig {
  return {
    allowedOrigins: readList("CORS_ORIGINS", ["*"]),
    apiBaseUrl:
      process.env.SHOW_API_BASE_URL ?? "https://mlb26.theshow.com/apis",
    concurrency: readInt("COLLECTOR_CONCURRENCY", 4),
    dbPath: process.env.MARKET_DB_PATH ?? "market.sqlite",
    host: process.env.MARKET_SERVER_HOST ?? "127.0.0.1",
    intervalMs: readInt("COLLECTOR_INTERVAL_MS", 60 * 60 * 1000),
    port: readInt("MARKET_SERVER_PORT", 4000),
    requestDelayMs: readInt("REQUEST_DELAY_MS", 150),
    staticDir: process.env.STATIC_DIR ?? path.resolve(process.cwd(), "dist"),
  };
}

function parseCliOptions() {
  const args = process.argv.slice(2);
  let limit: number | null = null;

  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--limit") {
      limit = clampOptionalInt(args[index + 1]);
      index += 1;
    }
  }

  return {
    limit,
    once: args.includes("--once"),
  };
}

function clampOptionalInt(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(Math.trunc(parsed), 0) : null;
}

function clampInt(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);
  const int = Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
  return Math.min(Math.max(int, min), max);
}

function readInt(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function readList(name: string, fallback: string[]): string[] {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") return fallback;
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeOrderTime(value: string | null): string | null {
  if (!value) return null;

  const match = value.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/,
  );
  if (!match) return null;

  return `${match[3]}-${pad2(Number(match[1]))}-${pad2(Number(match[2]))} ${pad2(
    Number(match[4]),
  )}:${match[5]}:${match[6]}`;
}

function toSqlDateTimeUtc(value: Date): string {
  return `${value.getUTCFullYear()}-${pad2(value.getUTCMonth() + 1)}-${pad2(
    value.getUTCDate(),
  )} ${pad2(value.getUTCHours())}:${pad2(value.getUTCMinutes())}:${pad2(
    value.getUTCSeconds(),
  )}`;
}

function toInt(value: unknown): number | null {
  if (value === null || value === undefined || value === "" || value === "-") {
    return null;
  }

  const normalized = typeof value === "string" ? value.replace(/,/g, "") : value;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toSqlParams(value: SqlParams): SqlParams {
  return value;
}

function windowlessSetInterval(fn: () => void, ms: number) {
  return setInterval(fn, ms);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

import express from "express";

import { config } from "./config.js";
import { getCounts, getDb, getSyncState } from "./db.js";

const app = express();
const db = getDb();

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, counts: getCounts() });
});

app.get("/sync/status", (_req, res) => {
  res.json({
    counts: getCounts(),
    players_bootstrapped_at: getSyncState("players_bootstrapped_at"),
    market_history_bootstrapped_at: getSyncState(
      "market_history_bootstrapped_at",
    ),
  });
});

app.get("/players", (req, res) => {
  const limit = clampInt(req.query.limit, 50, 1, 500);
  const offset = clampInt(req.query.offset, 0, 0, Number.MAX_SAFE_INTEGER);
  const q = stringQuery(req.query.q);
  const rarity = stringQuery(req.query.rarity);
  const team = stringQuery(req.query.team);
  const sellable = booleanQuery(req.query.sellable);

  const where: string[] = [];
  const params: Array<string | number> = [];

  if (q) {
    where.push("name LIKE ?");
    params.push(`%${q}%`);
  }

  if (rarity) {
    where.push("lower(rarity) = lower(?)");
    params.push(rarity);
  }

  if (team) {
    where.push("(team_short_name = ? OR lower(team) = lower(?))");
    params.push(team.toUpperCase(), team);
  }

  if (sellable !== null) {
    where.push("is_sellable = ?");
    params.push(sellable ? 1 : 0);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  const rows = db
    .prepare(
      `
        SELECT
          uuid,
          name,
          team,
          team_short_name,
          ovr,
          rarity,
          series,
          display_position,
          set_name,
          is_hitter,
          is_sellable,
          img,
          baked_img
        FROM players
        ${whereSql}
        ORDER BY name, uuid
        LIMIT ? OFFSET ?
      `,
    )
    .all(...params, limit, offset);

  res.json(rows);
});

app.get("/players/:uuid", (req, res) => {
  const row = db
    .prepare(
      `
        SELECT
          uuid,
          name,
          team,
          team_short_name,
          ovr,
          rarity,
          series,
          display_position,
          set_name,
          is_hitter,
          is_sellable,
          bats,
          throws,
          img,
          baked_img,
          updated_at
        FROM players
        WHERE uuid = ?
      `,
    )
    .get(req.params.uuid);

  if (!row) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  res.json(row);
});

app.get("/players/:uuid/orders", (req, res) => {
  const limit = clampInt(req.query.limit, 1000, 1, 10000);
  const from = stringQuery(req.query.from);
  const to = stringQuery(req.query.to);
  const where = ["uuid = ?"];
  const params: Array<string | number> = [req.params.uuid];

  if (from) {
    where.push("order_time >= ?");
    params.push(from);
  }

  if (to) {
    where.push("order_time <= ?");
    params.push(to);
  }

  const rows = db
    .prepare(
      `
        SELECT
          uuid,
          order_time,
          order_time_text,
          price,
          quantity,
          duplicate_ordinal
        FROM completed_orders
        WHERE ${where.join(" AND ")}
        ORDER BY order_time ASC, id ASC
        LIMIT ?
      `,
    )
    .all(...params, limit);

  res.json(rows);
});

app.get("/players/:uuid/daily-history", (req, res) => {
  const rows = db
    .prepare(
      `
        SELECT
          uuid,
          history_date,
          best_buy_price,
          best_sell_price,
          captured_at
        FROM price_history
        WHERE uuid = ?
        ORDER BY history_date ASC
      `,
    )
    .all(req.params.uuid);

  res.json(rows);
});

app.get("/players/:uuid/snapshots", (req, res) => {
  const limit = clampInt(req.query.limit, 100, 1, 1000);
  const rows = db
    .prepare(
      `
        SELECT
          uuid,
          listing_name,
          best_buy_price,
          best_sell_price,
          captured_at
        FROM listing_snapshots
        WHERE uuid = ?
        ORDER BY captured_at DESC, id DESC
        LIMIT ?
      `,
    )
    .all(req.params.uuid, limit);

  res.json(rows);
});

app.get("/players/:uuid/trend", (req, res) => {
  const bucket = parseBucket(req.query.bucket);
  const bucketExpression = {
    minute: "substr(order_time, 1, 16) || ':00'",
    hour: "substr(order_time, 1, 13) || ':00:00'",
    day: "substr(order_time, 1, 10)",
  }[bucket];

  const rows = db
    .prepare(
      `
        SELECT
          ${bucketExpression} AS bucket,
          AVG(price) AS avg_price,
          MIN(price) AS min_price,
          MAX(price) AS max_price,
          COUNT(*) AS sale_count
        FROM completed_orders
        WHERE uuid = ?
          AND order_time IS NOT NULL
          AND price IS NOT NULL
        GROUP BY bucket
        ORDER BY bucket ASC
      `,
    )
    .all(req.params.uuid);

  res.json(rows);
});

app.get("/market/daily-history", (req, res) => {
  const limit = clampInt(req.query.limit, 500, 1, 5000);
  const rows = db
    .prepare(
      `
        SELECT
          p.uuid,
          p.name,
          p.team_short_name,
          p.ovr,
          p.rarity,
          h.history_date,
          h.best_buy_price,
          h.best_sell_price
        FROM price_history h
        JOIN players p ON p.uuid = h.uuid
        ORDER BY h.history_date DESC, p.name ASC
        LIMIT ?
      `,
    )
    .all(limit);

  res.json(rows);
});

app.listen(config.port, () => {
  console.log(`Server listening on http://localhost:${config.port}`);
});

type Bucket = "minute" | "hour" | "day";

function stringQuery(value: unknown): string | null {
  if (Array.isArray(value)) return stringQuery(value[0]);
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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

function booleanQuery(value: unknown): boolean | null {
  const raw = stringQuery(value);
  if (raw === null) return null;

  if (["1", "true", "yes"].includes(raw.toLowerCase())) return true;
  if (["0", "false", "no"].includes(raw.toLowerCase())) return false;
  return null;
}

function parseBucket(value: unknown): Bucket {
  const raw = stringQuery(value);
  if (raw === "minute" || raw === "day") return raw;
  return "hour";
}

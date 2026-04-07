import { DatabaseSync } from "node:sqlite";

import { config } from "./config.js";
import type { ShowItem } from "./showApi.js";

export interface ListingSnapshotInput {
  uuid: string;
  listing_name: string | null;
  best_buy_price: number | null;
  best_sell_price: number | null;
  captured_at: string;
  raw_json: string;
}

export interface PriceHistoryInput {
  uuid: string;
  history_date: string;
  best_buy_price: number | null;
  best_sell_price: number | null;
  captured_at: string;
  raw_json: string;
}

export interface CompletedOrderInput {
  uuid: string;
  order_time: string | null;
  order_time_text: string | null;
  price: number | null;
  quantity: number | null;
  duplicate_ordinal: number;
  raw_json: string;
  order_hash: string;
}

export interface PlayerUuidOptions {
  includeUnsellable?: boolean;
}

type NamedSqlParams = Record<string, string | number | null>;

const db = new DatabaseSync(config.dbPath);

db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS players (
    uuid TEXT PRIMARY KEY,
    name TEXT,
    team TEXT,
    team_short_name TEXT,
    ovr INTEGER,
    rarity TEXT,
    series TEXT,
    type TEXT,
    display_position TEXT,
    set_name TEXT,
    is_hitter INTEGER,
    is_sellable INTEGER,
    bats TEXT,
    throws TEXT,
    img TEXT,
    baked_img TEXT,
    raw_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS listing_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL,
    listing_name TEXT,
    best_buy_price INTEGER,
    best_sell_price INTEGER,
    captured_at TEXT NOT NULL,
    raw_json TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_listing_snapshots_uuid_captured_at
    ON listing_snapshots(uuid, captured_at);

  CREATE TABLE IF NOT EXISTS price_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL,
    history_date TEXT NOT NULL,
    best_buy_price INTEGER,
    best_sell_price INTEGER,
    captured_at TEXT NOT NULL,
    raw_json TEXT NOT NULL,
    UNIQUE(uuid, history_date)
  );

  CREATE INDEX IF NOT EXISTS idx_price_history_uuid_history_date
    ON price_history(uuid, history_date);

  CREATE TABLE IF NOT EXISTS completed_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL,
    order_time TEXT,
    order_time_text TEXT,
    price INTEGER,
    quantity INTEGER,
    duplicate_ordinal INTEGER NOT NULL DEFAULT 1,
    raw_json TEXT NOT NULL,
    order_hash TEXT NOT NULL UNIQUE
  );

  CREATE INDEX IF NOT EXISTS idx_completed_orders_uuid_order_time
    ON completed_orders(uuid, order_time);

  CREATE TABLE IF NOT EXISTS sync_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

ensureColumn("players", "team_short_name", "TEXT");
ensureColumn("players", "display_position", "TEXT");
ensureColumn("players", "set_name", "TEXT");
ensureColumn("players", "is_sellable", "INTEGER");
ensureColumn("players", "img", "TEXT");
ensureColumn("players", "baked_img", "TEXT");
ensureColumn("listing_snapshots", "listing_name", "TEXT");
ensureColumn("completed_orders", "order_time_text", "TEXT");
ensureColumn("completed_orders", "duplicate_ordinal", "INTEGER NOT NULL DEFAULT 1");

const upsertPlayerStmt = db.prepare(`
  INSERT INTO players (
    uuid,
    name,
    team,
    team_short_name,
    ovr,
    rarity,
    series,
    type,
    display_position,
    set_name,
    is_hitter,
    is_sellable,
    bats,
    throws,
    img,
    baked_img,
    raw_json,
    updated_at
  ) VALUES (
    @uuid,
    @name,
    @team,
    @team_short_name,
    @ovr,
    @rarity,
    @series,
    @type,
    @display_position,
    @set_name,
    @is_hitter,
    @is_sellable,
    @bats,
    @throws,
    @img,
    @baked_img,
    @raw_json,
    CURRENT_TIMESTAMP
  )
  ON CONFLICT(uuid) DO UPDATE SET
    name = excluded.name,
    team = excluded.team,
    team_short_name = excluded.team_short_name,
    ovr = excluded.ovr,
    rarity = excluded.rarity,
    series = excluded.series,
    type = excluded.type,
    display_position = excluded.display_position,
    set_name = excluded.set_name,
    is_hitter = excluded.is_hitter,
    is_sellable = excluded.is_sellable,
    bats = excluded.bats,
    throws = excluded.throws,
    img = excluded.img,
    baked_img = excluded.baked_img,
    raw_json = excluded.raw_json,
    updated_at = CURRENT_TIMESTAMP
`);

const insertListingSnapshotStmt = db.prepare(`
  INSERT INTO listing_snapshots (
    uuid,
    listing_name,
    best_buy_price,
    best_sell_price,
    captured_at,
    raw_json
  ) VALUES (
    @uuid,
    @listing_name,
    @best_buy_price,
    @best_sell_price,
    @captured_at,
    @raw_json
  )
`);

const upsertPriceHistoryStmt = db.prepare(`
  INSERT INTO price_history (
    uuid,
    history_date,
    best_buy_price,
    best_sell_price,
    captured_at,
    raw_json
  ) VALUES (
    @uuid,
    @history_date,
    @best_buy_price,
    @best_sell_price,
    @captured_at,
    @raw_json
  )
  ON CONFLICT(uuid, history_date) DO UPDATE SET
    best_buy_price = excluded.best_buy_price,
    best_sell_price = excluded.best_sell_price,
    captured_at = excluded.captured_at,
    raw_json = excluded.raw_json
`);

const insertCompletedOrderStmt = db.prepare(`
  INSERT OR IGNORE INTO completed_orders (
    uuid,
    order_time,
    order_time_text,
    price,
    quantity,
    duplicate_ordinal,
    raw_json,
    order_hash
  ) VALUES (
    @uuid,
    @order_time,
    @order_time_text,
    @price,
    @quantity,
    @duplicate_ordinal,
    @raw_json,
    @order_hash
  )
`);

const setSyncStateStmt = db.prepare(`
  INSERT INTO sync_state (key, value)
  VALUES (?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value
`);

function ensureColumn(tableName: string, columnName: string, definition: string) {
  const columns = db
    .prepare(`PRAGMA table_info(${tableName})`)
    .all() as Array<{ name: string }>;

  if (!columns.some((column) => column.name === columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

export function getDb(): DatabaseSync {
  return db;
}

export function withTransaction<T>(fn: () => T): T {
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

export function upsertPlayer(player: ShowItem): void {
  if (!player.uuid) return;

  upsertPlayerStmt.run({
    uuid: player.uuid,
    name: stringOrNull(player.name),
    team: stringOrNull(player.team),
    team_short_name: stringOrNull(player.team_short_name),
    ovr: numberOrNull(player.ovr),
    rarity: stringOrNull(player.rarity),
    series: stringOrNull(player.series),
    type: stringOrNull(player.type),
    display_position: stringOrNull(player.display_position),
    set_name: stringOrNull(player.set_name),
    is_hitter: booleanOrNull(player.is_hitter),
    is_sellable: booleanOrNull(player.is_sellable),
    bats: stringOrNull(player.bat_hand),
    throws: stringOrNull(player.throw_hand),
    img: stringOrNull(player.img),
    baked_img: stringOrNull(player.baked_img),
    raw_json: JSON.stringify(player),
  });
}

export function insertListingSnapshot(snapshot: ListingSnapshotInput): number {
  return Number(
    insertListingSnapshotStmt.run(toNamedParams(snapshot)).changes,
  );
}

export function upsertPriceHistory(point: PriceHistoryInput): number {
  return Number(upsertPriceHistoryStmt.run(toNamedParams(point)).changes);
}

export function insertCompletedOrder(order: CompletedOrderInput): number {
  return Number(insertCompletedOrderStmt.run(toNamedParams(order)).changes);
}

export function setSyncState(key: string, value: string): void {
  setSyncStateStmt.run(key, value);
}

export function getSyncState(key: string): string | null {
  const row = db
    .prepare("SELECT value FROM sync_state WHERE key = ?")
    .get(key) as { value: string } | undefined;

  return row?.value ?? null;
}

export function getAllPlayerUuids({
  includeUnsellable = false,
}: PlayerUuidOptions = {}): string[] {
  const where = includeUnsellable ? "" : "WHERE is_sellable = 1";
  const rows = db
    .prepare(`SELECT uuid FROM players ${where} ORDER BY name, uuid`)
    .all() as Array<{ uuid: string }>;

  return rows.map((row) => row.uuid);
}

export function getCounts(): Record<string, number> {
  const tables = [
    "players",
    "listing_snapshots",
    "price_history",
    "completed_orders",
  ];

  return Object.fromEntries(
    tables.map((table) => {
      const row = db
        .prepare(`SELECT COUNT(*) AS count FROM ${table}`)
        .get() as { count: number };
      return [table, row.count];
    }),
  );
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function booleanOrNull(value: unknown): number | null {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number") return value === 0 ? 0 : 1;
  return null;
}

function toNamedParams(value: object): NamedSqlParams {
  return value as unknown as NamedSqlParams;
}

import crypto from "node:crypto";

import { config } from "./config.js";
import {
  getAllPlayerUuids,
  getCounts,
  getSyncState,
  insertCompletedOrder,
  insertListingSnapshot,
  setSyncState,
  upsertPlayer,
  upsertPriceHistory,
  withTransaction,
} from "./db.js";
import {
  fetchItemsPage,
  fetchListingByUuid,
  type CompletedOrderResponse,
  type ItemsResponse,
  type ListingPriceHistoryPoint,
  type ListingResponse,
  type ShowItem,
} from "./showApi.js";

interface CliOptions {
  includeUnsellable: boolean;
  skipPlayers: boolean;
  onlyUuid: string | null;
  limit: number | null;
}

interface ListingWriteStats {
  snapshots: number;
  dailyPriceRows: number;
  completedOrders: number;
}

async function bootstrapPlayers(): Promise<void> {
  let page = 1;
  let totalProcessed = 0;

  while (true) {
    const payload = await fetchItemsPage({ type: "mlb_card", page });
    const items = extractItems(payload);

    if (items.length === 0) break;

    withTransaction(() => {
      for (const item of items) {
        upsertPlayer(item);
        totalProcessed += 1;
      }
    });

    const totalPages = payload.total_pages ?? "?";
    console.log(`Players page ${page}/${totalPages}: ${items.length} items`);

    if (!hasNextPage(payload, page, items.length)) break;
    page += 1;
  }

  setSyncState("players_bootstrapped_at", new Date().toISOString());
  console.log(`Bootstrapped ${totalProcessed} player cards`);
}

async function bootstrapMarketHistory(options: CliOptions): Promise<void> {
  const uuids = options.onlyUuid
    ? [options.onlyUuid]
    : getAllPlayerUuids({ includeUnsellable: options.includeUnsellable });

  const selectedUuids =
    options.limit === null ? uuids : uuids.slice(0, options.limit);

  console.log(
    `Fetching listing history for ${selectedUuids.length} card(s) with concurrency ${config.listingConcurrency}`,
  );

  if (selectedUuids.length === 0) {
    console.log("No listing history selected; leaving market history timestamp unchanged.");
    return;
  }

  const totals: ListingWriteStats = {
    snapshots: 0,
    dailyPriceRows: 0,
    completedOrders: 0,
  };
  let processed = 0;
  let failed = 0;

  await mapConcurrent(
    selectedUuids,
    Math.max(config.listingConcurrency, 1),
    async (uuid) => {
      try {
        const listing = await fetchListingByUuid(uuid);
        const stats = persistListing(uuid, listing);

        totals.snapshots += stats.snapshots;
        totals.dailyPriceRows += stats.dailyPriceRows;
        totals.completedOrders += stats.completedOrders;
        processed += 1;

        if (processed % 100 === 0 || processed === selectedUuids.length) {
          console.log(`Processed listings: ${processed}/${selectedUuids.length}`);
        }
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Failed for uuid ${uuid}: ${message}`);
      }
    },
  );

  setSyncState("market_history_bootstrapped_at", new Date().toISOString());
  console.log(
    `Market history bootstrap complete: ${processed} succeeded, ${failed} failed`,
  );
  console.log(
    `Inserted/updated ${totals.dailyPriceRows} daily price rows and ${totals.completedOrders} completed orders`,
  );
}

function persistListing(uuid: string, listing: ListingResponse): ListingWriteStats {
  const capturedAt = new Date().toISOString();
  const capturedDate = new Date();
  const priceHistory = Array.isArray(listing.price_history)
    ? listing.price_history
    : [];
  const completedOrders = Array.isArray(listing.completed_orders)
    ? listing.completed_orders
    : [];

  const stats: ListingWriteStats = {
    snapshots: 0,
    dailyPriceRows: 0,
    completedOrders: 0,
  };

  withTransaction(() => {
    stats.snapshots += insertListingSnapshot({
      uuid,
      listing_name: stringOrNull(listing.listing_name),
      best_buy_price: toInt(listing.best_buy_price),
      best_sell_price: toInt(listing.best_sell_price),
      captured_at: capturedAt,
      raw_json: JSON.stringify(listing),
    });

    for (const point of priceHistory) {
      const normalized = normalizePriceHistoryPoint(
        uuid,
        point,
        capturedAt,
        capturedDate,
      );
      if (!normalized) continue;
      stats.dailyPriceRows += upsertPriceHistory(normalized);
    }

    for (const order of normalizeCompletedOrders(uuid, completedOrders)) {
      stats.completedOrders += insertCompletedOrder(order);
    }
  });

  return stats;
}

function normalizePriceHistoryPoint(
  uuid: string,
  point: ListingPriceHistoryPoint,
  capturedAt: string,
  capturedDate: Date,
) {
  const historyDate = normalizeMonthDay(point.date, capturedDate);
  if (!historyDate) return null;

  return {
    uuid,
    history_date: historyDate,
    best_buy_price: toInt(point.best_buy_price),
    best_sell_price: toInt(point.best_sell_price),
    captured_at: capturedAt,
    raw_json: JSON.stringify(point),
  };
}

function normalizeCompletedOrders(
  uuid: string,
  orders: CompletedOrderResponse[],
) {
  const seen = new Map<string, number>();

  return orders.map((order) => {
    const orderTimeText = stringOrNull(
      order.date ?? order.created_at ?? order.completed_at ?? order.timestamp,
    );
    const orderTime = normalizeDateTime(orderTimeText);
    const price = toInt(order.price ?? order.cost ?? order.listing_price);
    const quantity = toInt(order.quantity ?? order.qty) ?? 1;
    const duplicateKey = `${orderTime ?? orderTimeText ?? ""}|${price ?? ""}|${quantity}`;
    const duplicateOrdinal = (seen.get(duplicateKey) ?? 0) + 1;

    seen.set(duplicateKey, duplicateOrdinal);

    const orderHash = crypto
      .createHash("sha256")
      .update(
        JSON.stringify({
          uuid,
          orderTime,
          orderTimeText,
          price,
          quantity,
          duplicateOrdinal,
        }),
      )
      .digest("hex");

    return {
      uuid,
      order_time: orderTime,
      order_time_text: orderTimeText,
      price,
      quantity,
      duplicate_ordinal: duplicateOrdinal,
      raw_json: JSON.stringify(order),
      order_hash: orderHash,
    };
  });
}

function extractItems(payload: ItemsResponse): ShowItem[] {
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.data)) return payload.data;
  return [];
}

function hasNextPage(
  payload: ItemsResponse,
  currentPage: number,
  currentLength: number,
): boolean {
  if (payload.total_pages !== undefined) {
    return currentPage < Number(payload.total_pages);
  }

  return currentLength > 0;
}

function normalizeMonthDay(value: unknown, referenceDate: Date): string | null {
  const raw = stringOrNull(value);
  if (!raw) return null;

  const match = raw.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);
  if (!match) return raw;

  const month = Number(match[1]);
  const day = Number(match[2]);
  let year = match[3] ? Number(match[3]) : referenceDate.getFullYear();

  const candidate = new Date(year, month - 1, day);
  const referenceDay = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate(),
  );

  if (
    !match[3] &&
    candidate.getTime() - referenceDay.getTime() > 24 * 60 * 60 * 1000
  ) {
    year -= 1;
  }

  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function normalizeDateTime(value: unknown): string | null {
  const raw = stringOrNull(value);
  if (!raw) return null;

  const match = raw.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/,
  );

  if (match) {
    return `${match[3]}-${pad2(Number(match[1]))}-${pad2(
      Number(match[2]),
    )} ${pad2(Number(match[4]))}:${match[5]}:${match[6]}`;
  }

  return raw;
}

function toInt(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

async function mapConcurrent<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;

  async function runWorker(): Promise<void> {
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

function parseCliOptions(): CliOptions {
  const args = process.argv.slice(2);
  const options: CliOptions = {
    includeUnsellable: false,
    skipPlayers: false,
    onlyUuid: null,
    limit: null,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--include-unsellable") {
      options.includeUnsellable = true;
    } else if (arg === "--skip-players") {
      options.skipPlayers = true;
    } else if (arg === "--uuid") {
      options.onlyUuid = args[index + 1] ?? null;
      index += 1;
    } else if (arg === "--limit") {
      const parsed = Number(args[index + 1]);
      options.limit = Number.isFinite(parsed)
        ? Math.max(Math.trunc(parsed), 0)
        : null;
      index += 1;
    }
  }

  return options;
}

async function main(): Promise<void> {
  const options = parseCliOptions();

  if (!options.skipPlayers) {
    console.log("Starting player bootstrap...");
    await bootstrapPlayers();
  }

  console.log("Starting market history bootstrap...");
  await bootstrapMarketHistory(options);

  console.log("Done.");
  console.log("Counts:", getCounts());
  console.log("players_bootstrapped_at:", getSyncState("players_bootstrapped_at"));
  console.log(
    "market_history_bootstrapped_at:",
    getSyncState("market_history_bootstrapped_at"),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

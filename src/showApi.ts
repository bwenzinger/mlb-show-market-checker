export type ItemType =
  | "mlb_card"
  | "stadium"
  | "equipment"
  | "sponsorship"
  | "unlockable";

export const MARKET_ITEM_TYPES: ItemType[] = [
  "mlb_card",
  "stadium",
  "equipment",
  "sponsorship",
  "unlockable",
];

export type ApiSortKey = "rank" | "best_sell_price" | "best_buy_price";
export type SortKey =
  | ApiSortKey
  | "buy_now_vs_all_time_average_diff"
  | "spread_number"
  | "spread_percentage"
  | "profit"
  | "profit_percentage";
export type SortOrder = "asc" | "desc";

export interface ShowItem {
  uuid: string;
  type?: string;
  img?: string | null;
  baked_img?: string | null;
  baked_img_lg?: string | null;
  name?: string | null;
  rarity?: string | null;
  team?: string | null;
  team_short_name?: string | null;
  ovr?: number | null;
  series?: string | null;
  display_position?: string | null;
  display_secondary_positions?: string | null;
  is_hitter?: boolean | null;
  is_sellable?: boolean | null;
  bat_hand?: string | null;
  throw_hand?: string | null;
  set_name?: string | null;
  [key: string]: unknown;
}

export interface ListingPriceHistoryPoint {
  date?: string | null;
  best_buy_price?: number | string | null;
  best_sell_price?: number | string | null;
}

export interface CompletedOrder {
  date?: string | null;
  price?: number | string | null;
}

export interface Listing {
  allTimeAverage?: number | null;
  buyNowVsAllTimeAverageDiff?: number | null;
  listing_name?: string | null;
  best_sell_price?: number | string | null;
  best_buy_price?: number | string | null;
  item?: ShowItem | null;
  price_history?: ListingPriceHistoryPoint[];
  completed_orders?: CompletedOrder[];
}

export interface StoredOrderAverage {
  averagePrice: number | null;
  orderCount: number;
  uuid: string;
}

export interface ListingsResponse {
  page: number;
  per_page: number;
  total_pages: number;
  listings: Listing[];
}

const BACKEND_API_BASE = import.meta.env.VITE_BACKEND_API_BASE as
  | string
  | undefined;
const API_BASE =
  import.meta.env.VITE_SHOW_API_BASE ??
  (BACKEND_API_BASE
    ? `${trimTrailingSlash(BACKEND_API_BASE)}/api/show`
    : "/api/show");
const HISTORY_API_BASE =
  import.meta.env.VITE_HISTORY_API_BASE ??
  (BACKEND_API_BASE
    ? `${trimTrailingSlash(BACKEND_API_BASE)}/api`
    : "/api");
const HISTORY_API_ENABLED = import.meta.env.VITE_HISTORY_API_ENABLED !== "false";
const STORED_ORDER_AVERAGES_CACHE_MS = 60_000;
let storedOrderAveragesCache: {
  expiresAt: number;
  promise: Promise<Map<string, StoredOrderAverage>>;
} | null = null;

export async function fetchListings({
  page = 1,
  name,
  rarity,
  sort = "rank",
  order = "desc",
  type = "mlb_card",
}: {
  page?: number;
  name?: string;
  rarity?: string;
  sort?: ApiSortKey;
  order?: SortOrder;
  type?: ItemType;
} = {}): Promise<ListingsResponse> {
  return requestJson<ListingsResponse>("/listings.json", {
    type,
    page,
    name,
    rarity,
    sort,
    order,
  });
}

export async function fetchListingByUuid(uuid: string): Promise<Listing> {
  return requestJson<Listing>("/listing.json", { uuid });
}

export async function fetchStoredCompletedOrders({
  days = 7,
  uuid,
}: {
  days?: number;
  uuid: string;
}): Promise<CompletedOrder[]> {
  if (!HISTORY_API_ENABLED) {
    return [];
  }

  const url = new URL(
    `${trimTrailingSlash(HISTORY_API_BASE)}/cards/${encodeURIComponent(
      uuid,
    )}/orders`,
    window.location.href,
  );
  url.searchParams.set("days", String(days));

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Local history API returned HTTP ${response.status}`);
  }

  const json = (await response.json()) as { orders?: CompletedOrder[] };
  return json.orders ?? [];
}

export async function fetchStoredOrderAverages({
  forceRefresh = false,
}: {
  forceRefresh?: boolean;
} = {}): Promise<Map<string, StoredOrderAverage>> {
  if (!HISTORY_API_ENABLED) {
    return new Map();
  }

  const now = Date.now();
  if (
    !forceRefresh &&
    storedOrderAveragesCache &&
    storedOrderAveragesCache.expiresAt > now
  ) {
    return storedOrderAveragesCache.promise;
  }

  const promise = (async () => {
    const url = new URL(
      `${trimTrailingSlash(HISTORY_API_BASE)}/cards/averages`,
      window.location.href
    );

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Local history API returned HTTP ${response.status}`);
    }

    const json = (await response.json()) as {
      averages?: StoredOrderAverage[];
    };

    return new Map(
      (json.averages ?? []).map((average) => [average.uuid, average])
    );
  })();

  storedOrderAveragesCache = {
    expiresAt: now + STORED_ORDER_AVERAGES_CACHE_MS,
    promise,
  };

  return promise;
}

async function requestJson<T>(
  path: string,
  searchParams: Record<string, string | number | undefined> = {},
): Promise<T> {
  const url = new URL(`${trimTrailingSlash(API_BASE)}${path}`, window.location.href);

  for (const [key, value] of Object.entries(searchParams)) {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`The Show API returned HTTP ${response.status}`);
  }

  return (await response.json()) as T;
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

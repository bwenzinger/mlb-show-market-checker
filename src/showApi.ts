import { config } from "./config.js";

export type ItemType =
  | "mlb_card"
  | "stadium"
  | "equipment"
  | "sponsorship"
  | "unlockable";

export type SearchParamValue = string | number | boolean | null | undefined;

export interface ShowItem {
  uuid?: string;
  type?: string;
  img?: string | null;
  baked_img?: string | null;
  name?: string | null;
  rarity?: string | null;
  team?: string | null;
  team_short_name?: string | null;
  ovr?: number | null;
  series?: string | null;
  display_position?: string | null;
  is_hitter?: boolean | null;
  is_sellable?: boolean | null;
  bat_hand?: string | null;
  throw_hand?: string | null;
  set_name?: string | null;
  [key: string]: unknown;
}

export interface ItemsResponse {
  page?: number;
  per_page?: number;
  total_pages?: number;
  items?: ShowItem[];
  data?: ShowItem[];
  [key: string]: unknown;
}

export interface ListingPriceHistoryPoint {
  date?: string | null;
  best_buy_price?: number | string | null;
  best_sell_price?: number | string | null;
  [key: string]: unknown;
}

export interface CompletedOrderResponse {
  date?: string | null;
  price?: number | string | null;
  quantity?: number | string | null;
  qty?: number | string | null;
  [key: string]: unknown;
}

export interface ListingResponse {
  listing_name?: string | null;
  best_sell_price?: number | string | null;
  best_buy_price?: number | string | null;
  item?: ShowItem | null;
  price_history?: ListingPriceHistoryPoint[];
  completed_orders?: CompletedOrderResponse[];
  [key: string]: unknown;
}

export interface ListingsResponse {
  page?: number;
  per_page?: number;
  total_pages?: number;
  listings?: ListingResponse[];
  [key: string]: unknown;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function requestJson<T>(
  path: string,
  searchParams: Record<string, SearchParamValue> = {},
): Promise<T> {
  const url = new URL(path, config.showApiBase);

  for (const [key, value] of Object.entries(searchParams)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    headers: {
      "User-Agent": "mlb-show-market-checker/1.0",
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `HTTP ${response.status} for ${url.toString()} - ${text.slice(0, 300)}`,
    );
  }

  const json = (await response.json()) as T;
  await sleep(config.requestDelayMs);
  return json;
}

export async function fetchItemsPage({
  type = "mlb_card",
  page = 1,
}: {
  type?: ItemType;
  page?: number;
} = {}): Promise<ItemsResponse> {
  return requestJson<ItemsResponse>("/apis/items.json", { type, page });
}

export async function fetchListingByUuid(
  uuid: string,
): Promise<ListingResponse> {
  return requestJson<ListingResponse>("/apis/listing.json", { uuid });
}

export async function fetchListingsPage({
  type = "mlb_card",
  page = 1,
  sort = "rank",
  order = "desc",
}: {
  type?: ItemType;
  page?: number;
  sort?: "rank" | "best_sell_price" | "best_buy_price";
  order?: "asc" | "desc";
} = {}): Promise<ListingsResponse> {
  return requestJson<ListingsResponse>("/apis/listings.json", {
    type,
    page,
    sort,
    order,
  });
}

export type ItemType =
  | "mlb_card"
  | "stadium"
  | "equipment"
  | "sponsorship"
  | "unlockable";

export type SortKey = "rank" | "best_sell_price" | "best_buy_price";
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
  listing_name?: string | null;
  best_sell_price?: number | string | null;
  best_buy_price?: number | string | null;
  item?: ShowItem | null;
  price_history?: ListingPriceHistoryPoint[];
  completed_orders?: CompletedOrder[];
}

export interface ListingsResponse {
  page: number;
  per_page: number;
  total_pages: number;
  listings: Listing[];
}

const API_BASE = import.meta.env.VITE_SHOW_API_BASE ?? "/show-api";

export async function fetchListings({
  page = 1,
  name,
  rarity,
  sort = "rank",
  order = "desc",
}: {
  page?: number;
  name?: string;
  rarity?: string;
  sort?: SortKey;
  order?: SortOrder;
} = {}): Promise<ListingsResponse> {
  return requestJson<ListingsResponse>("/listings.json", {
    type: "mlb_card",
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

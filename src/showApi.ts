export type ItemType =
  | 'mlb_card'
  | 'stadium'
  | 'equipment'
  | 'sponsorship'
  | 'unlockable';

export const MARKET_ITEM_TYPES: ItemType[] = [
  'mlb_card',
  'stadium',
  'equipment',
  'sponsorship',
  'unlockable',
];

export type ApiSortKey = 'rank' | 'best_sell_price' | 'best_buy_price';
export type SortKey =
  | ApiSortKey
  | 'buy_now_vs_all_time_average_diff'
  | 'profit_per_hour'
  | 'spread_number'
  | 'spread_percentage'
  | 'profit'
  | 'profit_percentage';
export type SortOrder = 'asc' | 'desc';

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
  storedOrderLiquidity?: StoredOrderLiquidity | null;
}

export interface StoredOrderAverage {
  averagePrice: number | null;
  orderCount: number;
  uuid: string;
}

export interface StoredOrderLiquidity {
  buyFillRatePerHour: number | null;
  buyMatchCount: number;
  buyMatches3m?: number;
  buyMatches10m?: number;
  buyMatches30m?: number;
  confidence: number;
  computedAt: string;
  lastBuyMatchAt?: string | null;
  lastOrderAt?: string | null;
  lastSellMatchAt?: string | null;
  recentOrderCount3m?: number;
  recentOrderCount10m?: number;
  recentOrderCount30m?: number;
  recentOrderCount60m?: number;
  recentOrderCount: number;
  sellFillRatePerHour: number | null;
  sellMatchCount: number;
  sellMatches3m?: number;
  sellMatches10m?: number;
  sellMatches30m?: number;
  uuid: string;
  windowHours: number;
}

export interface ListingsResponse {
  page: number;
  per_page: number;
  total_pages: number;
  listings: Listing[];
}

export interface ItemsResponse {
  page: number;
  per_page: number;
  total_pages: number;
  items: ShowItem[];
}

interface RequestOptions {
  signal?: AbortSignal;
}

const SHOW_API_BASE = '/api/show';
const HISTORY_API_BASE = '/api';

export async function fetchListings({
  appSort,
  page = 1,
  name,
  rarity,
  sort = 'rank',
  order = 'desc',
  type = 'mlb_card',
}: {
  appSort?: SortKey;
  page?: number;
  name?: string;
  rarity?: string;
  sort?: ApiSortKey;
  order?: SortOrder;
  type?: ItemType;
} = {}): Promise<ListingsResponse> {
  return requestJson<ListingsResponse>('/listings.json', {
    type,
    page,
    name,
    rarity,
    sort,
    app_sort: appSort,
    order,
  });
}

export async function fetchItems({
  page = 1,
  type = 'mlb_card',
}: {
  page?: number;
  type?: ItemType;
} = {}): Promise<ItemsResponse> {
  return requestJson<ItemsResponse>('/items.json', {
    type,
    page,
  });
}

export async function fetchListingByUuid(
  uuid: string,
  options: RequestOptions = {}
): Promise<Listing> {
  return requestJson<Listing>('/listing.json', { uuid }, options);
}

export async function fetchStoredCompletedOrders({
  days = 7,
  signal,
  uuid,
}: {
  days?: number;
  signal?: AbortSignal;
  uuid: string;
}): Promise<CompletedOrder[]> {
  const url = new URL(
    `${HISTORY_API_BASE}/cards/${encodeURIComponent(uuid)}/orders`,
    window.location.href
  );
  url.searchParams.set('days', String(days));

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Local history API returned HTTP ${response.status}`);
  }

  const json = (await response.json()) as { orders?: CompletedOrder[] };
  return json.orders ?? [];
}

export async function fetchStoredOrderAverages(): Promise<
  Map<string, StoredOrderAverage>
> {
  const url = new URL(`${HISTORY_API_BASE}/cards/averages`, window.location.href);

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
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
}

export async function fetchStoredOrderLiquidities(): Promise<
  Map<string, StoredOrderLiquidity>
> {
  const url = new URL(
    `${HISTORY_API_BASE}/cards/liquidity`,
    window.location.href
  );

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Local history API returned HTTP ${response.status}`);
  }

  const json = (await response.json()) as {
    liquidity?: StoredOrderLiquidity[];
  };

  return new Map((json.liquidity ?? []).map((entry) => [entry.uuid, entry]));
}

export async function fetchStoredOrderLiquidity({
  signal,
  uuid,
}: {
  signal?: AbortSignal;
  uuid: string;
}): Promise<StoredOrderLiquidity | null> {
  const url = new URL(
    `${HISTORY_API_BASE}/cards/${encodeURIComponent(uuid)}/liquidity`,
    window.location.href
  );

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Local history API returned HTTP ${response.status}`);
  }

  const json = (await response.json()) as {
    liquidity?: StoredOrderLiquidity | null;
  };

  return json.liquidity ?? null;
}

export async function fetchStoredOrderAverage({
  signal,
  uuid,
}: {
  signal?: AbortSignal;
  uuid: string;
}): Promise<StoredOrderAverage | null> {
  const url = new URL(
    `${HISTORY_API_BASE}/cards/${encodeURIComponent(uuid)}/average`,
    window.location.href
  );

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Local history API returned HTTP ${response.status}`);
  }

  const json = (await response.json()) as {
    average?: StoredOrderAverage | null;
  };

  return json.average ?? null;
}

async function requestJson<T>(
  path: string,
  searchParams: Record<string, string | number | undefined> = {},
  options: RequestOptions = {}
): Promise<T> {
  const url = new URL(
    `${SHOW_API_BASE}${path}`,
    window.location.href
  );

  for (const [key, value] of Object.entries(searchParams)) {
    if (value !== undefined && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
    signal: options.signal,
  });

  if (!response.ok) {
    throw new Error(`The Show API returned HTTP ${response.status}`);
  }

  return (await response.json()) as T;
}

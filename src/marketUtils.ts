import {
  fetchListings,
  type ApiSortKey,
  type CompletedOrder,
  type ItemType,
  MARKET_ITEM_TYPES,
  type Listing,
  type ListingPriceHistoryPoint,
  type SortKey,
  type SortOrder,
} from './showApi';

export type LoadState = 'idle' | 'loading' | 'ready' | 'error';

export interface PricePoint {
  date: Date;
  label: string;
  buy: number | null;
  sell: number | null;
}

export interface OrderPoint {
  date: Date;
  label: string;
  price: number;
}

export interface OrderBucket {
  label: string;
  averagePrice: number;
  saleCount: number;
}

export interface FilterState {
  itemType: ItemType | '';
  minSpreadForPercent: number;
  rarity: string;
  searchText: string;
  selectedUuid: string | null;
  sort: SortKey;
}

export const rarityOptions = [
  '',
  'diamond',
  'gold',
  'silver',
  'bronze',
  'common',
];
export const itemTypeOptions: Array<{ label: string; value: ItemType | '' }> = [
  { label: 'All', value: '' },
  { label: 'Players', value: 'mlb_card' },
  { label: 'Stadiums', value: 'stadium' },
  { label: 'Equipment', value: 'equipment' },
  { label: 'Sponsorships', value: 'sponsorship' },
  { label: 'Unlockables', value: 'unlockable' },
];
export const sortOptions: Array<{ label: string; value: SortKey }> = [
  { label: 'Buy now', value: 'best_sell_price' },
  { label: 'Sell now', value: 'best_buy_price' },
  { label: 'Buy now vs avg', value: 'buy_now_vs_all_time_average_diff' },
  { label: 'Spread', value: 'spread_number' },
  { label: 'Spread %', value: 'spread_percentage' },
  { label: 'Profit', value: 'profit' },
  { label: 'Profit %', value: 'profit_percentage' },
  { label: 'Overall', value: 'rank' },
];
export const RECENT_ORDER_LOOKBACK_DAYS = 7;
export const ALL_ORDER_LOOKBACK_DAYS = 3650;
export const DEFAULT_TIMELINE_WINDOW_MS = 6 * 60 * 60 * 1000;
export const DEFAULT_MIN_SPREAD_FOR_PERCENT = 40;
export const DEFAULT_SORT: SortKey = 'spread_percentage';
export const DEFAULT_LIST_SORT: SortKey = 'rank';

const LISTING_CACHE_MS = 5 * 60_000;
const LISTING_CACHE_STORAGE_KEY = 'mlb-show-market-catalog-v2';
const SALE_TAX_RATE = 0.1;
const PLAYER_CARD_QUICK_SELL_VALUES = [
  { maxOvr: 64, live: 5, nonLive: 2 },
  { maxOvr: 74, live: 25, nonLive: 12 },
  { maxOvr: 75, live: 50, nonLive: 25 },
  { maxOvr: 76, live: 75, nonLive: 37 },
  { maxOvr: 77, live: 100, nonLive: 50 },
  { maxOvr: 78, live: 125, nonLive: 62 },
  { maxOvr: 79, live: 150, nonLive: 75 },
  { maxOvr: 80, live: 400, nonLive: 200 },
  { maxOvr: 81, live: 600, nonLive: 300 },
  { maxOvr: 82, live: 900, nonLive: 450 },
  { maxOvr: 83, live: 1200, nonLive: 600 },
  { maxOvr: 84, live: 1500, nonLive: 750 },
  { maxOvr: 85, live: 3000, nonLive: 1500 },
  { maxOvr: 86, live: 3750, nonLive: 1875 },
  { maxOvr: 87, live: 4500, nonLive: 2250 },
  { maxOvr: 88, live: 5500, nonLive: 2750 },
  { maxOvr: 89, live: 7000, nonLive: 3500 },
  { maxOvr: 90, live: 8000, nonLive: 4000 },
  { maxOvr: 91, live: 9000, nonLive: 4500 },
  { maxOvr: Infinity, live: 10000, nonLive: 5000 },
] as const;
const GENERIC_PLAYER_CARD_QUICK_SELL_BY_RARITY = {
  common: { live: 5, nonLive: 2 },
  bronze: { live: 25, nonLive: 12 },
  silver: { live: 50, nonLive: 25 },
  gold: { live: 400, nonLive: 200 },
  diamond: { live: 3000, nonLive: 1500 },
} as const;
const ITEM_QUICK_SELL_BY_TYPE_AND_RARITY: Partial<
  Record<ItemType, Partial<Record<string, number>>>
> = {
  equipment: {
    silver: 25,
    gold: 100,
    diamond: 1000,
  },
  sponsorship: {
    silver: 25,
    gold: 100,
    diamond: 1000,
  },
  stadium: {
    gold: 100,
    diamond: 1000,
  },
  unlockable: {
    silver: 100,
    gold: 500,
    diamond: 1000,
  },
};

type PlayerCardQuickSellRarity =
  keyof typeof GENERIC_PLAYER_CARD_QUICK_SELL_BY_RARITY;

const fullListingsCache = new Map<
  string,
  { expiresAt: number; promise: Promise<Listing[]> }
>();
let listingsRefreshPromise: Promise<Listing[]> | null = null;

export function normalizePriceHistory(
  points: ListingPriceHistoryPoint[]
): PricePoint[] {
  return points
    .map((point) => {
      const date = parseMonthDay(point.date);
      if (!date) return null;

      return {
        date,
        label: formatDate(date),
        buy: toNumber(point.best_buy_price),
        sell: toNumber(point.best_sell_price),
      };
    })
    .filter((point): point is PricePoint => point !== null)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

export function normalizeOrders(orders: CompletedOrder[]): OrderPoint[] {
  return orders
    .map((order) => {
      const date = parseOrderDate(order.date);
      const price = toNumber(order.price);
      if (!date || price === null) return null;

      return {
        date,
        label: formatDateTime(date),
        price,
      };
    })
    .filter((order): order is OrderPoint => order !== null)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

export function bucketOrdersByHour(orders: OrderPoint[]): OrderBucket[] {
  const buckets = new Map<string, { label: string; prices: number[] }>();

  for (const order of orders) {
    const bucketDate = new Date(order.date);
    bucketDate.setMinutes(0, 0, 0);
    const key = bucketDate.toISOString();
    const label = formatDateTime(bucketDate);
    const bucket = buckets.get(key) ?? { label, prices: [] };
    bucket.prices.push(order.price);
    buckets.set(key, bucket);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, bucket]) => ({
      label: bucket.label,
      saleCount: bucket.prices.length,
      averagePrice: average(bucket.prices) ?? 0,
    }));
}

export function formatStubs(value: number | null): string {
  if (value === null) return '-';
  return Math.round(value).toLocaleString('en-US');
}

export function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(value);
}

export function formatPercent(value: number | null): string {
  if (value === null) return '-';
  return `${value.toLocaleString('en-US', {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  })}%`;
}

export function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function getListingTypeLabel(
  listing: Listing | null | undefined
): string {
  const type = listing?.item?.type;
  if (!type) return 'Item';
  if (type === 'mlb_card') return 'MLB Card';
  return type
    .split('_')
    .map((part) => titleCase(part))
    .join(' ');
}

export function getListingEyebrow(listing: Listing | null | undefined): string {
  return (
    listing?.item?.team_short_name ??
    listing?.item?.team ??
    listing?.item?.series ??
    getListingTypeLabel(listing)
  );
}

export function getListingListSummary(listing: Listing): string {
  const parts = [
    listing.item?.team_short_name ?? listing.item?.team ?? null,
    listing.item?.rarity ?? null,
    listing.item?.ovr ? `OVR ${listing.item.ovr}` : null,
    listing.item?.display_position ?? null,
    !listing.item?.team && !listing.item?.ovr && !listing.item?.display_position
      ? getListingTypeLabel(listing)
      : null,
  ].filter((part): part is string => Boolean(part));

  return parts.join(' - ') || getListingTypeLabel(listing);
}

export function getListingDetailSummary(
  listing: Listing | null | undefined
): string {
  const parts = [
    listing?.item?.rarity ?? null,
    listing?.item?.series ?? null,
    listing?.item?.display_position ?? null,
    listing?.item?.set_name ?? null,
    !listing?.item?.series && !listing?.item?.display_position
      ? getListingTypeLabel(listing)
      : null,
  ].filter((part): part is string => Boolean(part));

  return parts.join(' - ') || 'Market item';
}

export function readFiltersFromUrl(): FilterState {
  if (typeof window === 'undefined') {
    return defaultFilters();
  }

  const searchParams = new URLSearchParams(window.location.search);
  const searchText = searchParams.get('q') ?? '';
  const itemType = parseItemType(searchParams.get('type'));
  const rarity = parseRarity(searchParams.get('rarity'));
  const sort = parseSort(searchParams.get('sort'));
  const selectedUuid = parseSelectedUuid(
    searchParams.get('uuid') ??
      searchParams.get('item') ??
      searchParams.get('card')
  );
  const minSpreadForPercent = parseMinSpread(
    searchParams.get('minSpread') ?? searchParams.get('min_spread')
  );

  return {
    itemType,
    minSpreadForPercent,
    rarity,
    searchText,
    selectedUuid,
    sort,
  };
}

export function writeFiltersToUrl({
  itemType,
  minSpreadForPercent,
  rarity,
  searchText,
  selectedUuid,
  sort,
}: FilterState) {
  if (typeof window === 'undefined') return;

  const url = new URL(window.location.href);
  setSearchParam(url.searchParams, 'q', searchText.trim());
  setSearchParam(url.searchParams, 'type', itemType);
  setSearchParam(url.searchParams, 'rarity', rarity);
  setSearchParam(url.searchParams, 'uuid', selectedUuid ?? '');
  url.searchParams.set('sort', sort);
  url.searchParams.set('minSpread', String(Math.max(minSpreadForPercent, 0)));
  url.searchParams.delete('item');
  url.searchParams.delete('card');
  url.searchParams.delete('minProfit');
  url.searchParams.delete('min_profit');
  url.searchParams.delete('minProfitPercent');
  url.searchParams.delete('minProfitPercentage');
  url.searchParams.delete('min_profit_percent');

  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (nextUrl !== currentUrl) {
    window.history.replaceState(window.history.state, '', nextUrl);
  }
}

export async function fetchListingsByTypeAndRarity({
  itemType,
  name,
  rarity,
}: {
  itemType?: ItemType | '';
  minSpreadForPercent?: number;
  name?: string;
  rarity?: string;
  sort?: SortKey;
}): Promise<Listing[]> {
  const normalizedName = normalizeSearchText(name ?? '');
  const allListings = await fetchAllListings({
    itemType,
    rarity,
  });
  const matchingListings = allListings.filter(
    (listing) =>
      listingMatchesItemType(listing, itemType) &&
      listingMatchesRarity(listing, rarity) &&
      (!normalizedName ||
        listingMatchesNormalizedSearch(listing, normalizedName))
  );

  return matchingListings;
}

export function isSpreadSort(
  sort?: SortKey
): sort is
  | 'spread_number'
  | 'spread_percentage'
  | 'profit'
  | 'profit_percentage' {
  return (
    sort === 'spread_number' ||
    sort === 'spread_percentage' ||
    sort === 'profit' ||
    sort === 'profit_percentage'
  );
}

export function doesSortMetricUseQuickSell(sort?: SortKey): boolean {
  return sort === 'best_buy_price' || isSpreadSort(sort);
}

export function normalizeSort(value: string | undefined): SortKey {
  return sortOptions.some((option) => option.value === value)
    ? (value as SortKey)
    : DEFAULT_LIST_SORT;
}

export function getListingSortMetric(
  listing: Listing,
  sort?: SortKey
): { label: string; value: string } {
  const prices = getListingPrices(listing);

  if (sort === 'buy_now_vs_all_time_average_diff') {
    const diff = listing.buyNowVsAllTimeAverageDiff ?? null;

    return {
      label: 'vs avg',
      value:
        diff === null
          ? formatStubs(null)
          : `${diff > 0 ? '+' : ''}${formatStubs(diff)}`,
    };
  }

  if (sort === 'best_buy_price') {
    return { label: 'Sell now', value: formatStubs(prices.sellNow) };
  }

  if (sort === 'spread_number') {
    return {
      label: 'Spread',
      value: formatStubs(listingSpreadNumber(listing)),
    };
  }

  if (sort === 'spread_percentage') {
    return {
      label: 'Spread',
      value: formatPercent(listingSpreadPercentage(listing)),
    };
  }

  if (sort === 'profit') {
    return {
      label: 'Profit',
      value: formatStubs(listingProfit(listing)),
    };
  }

  if (sort === 'profit_percentage') {
    return {
      label: 'Profit %',
      value: formatPercent(listingProfitPercentage(listing)),
    };
  }

  return { label: 'Buy now', value: formatStubs(prices.buyNow) };
}

export function getListingPrices(listing: Listing): {
  buyNow: number | null;
  sellNow: number | null;
} {
  const marketSellNow = toNumber(listing.best_buy_price);

  return {
    buyNow: toNumber(listing.best_sell_price),
    sellNow:
      marketSellNow !== null && marketSellNow > 0
        ? marketSellNow
        : getQuickSellValue(listing),
  };
}

export function isUsingQuickSellFallback(listing: Listing): boolean {
  const marketSellNow = toNumber(listing.best_buy_price);
  return (
    (marketSellNow === null || marketSellNow <= 0) &&
    getQuickSellValue(listing) !== null
  );
}

export function calculateProfit({
  buyNow,
  sellNow,
}: {
  buyNow: number | null;
  sellNow: number | null;
}): number | null {
  const spread = calculateSpread({ buyNow, sellNow });
  if (spread === null || buyNow === null) return null;
  return Math.floor(spread - buyNow * SALE_TAX_RATE);
}

export function calculateProfitPercentage({
  buyNow,
  sellNow,
}: {
  buyNow: number | null;
  sellNow: number | null;
}): number | null {
  const profit = calculateProfit({ buyNow, sellNow });
  if (profit === null || sellNow === null || sellNow <= 0) return null;
  return (profit / sellNow) * 100;
}

export function calculateSpread({
  buyNow,
  sellNow,
}: {
  buyNow: number | null;
  sellNow: number | null;
}): number | null {
  if (buyNow === null || sellNow === null || sellNow <= 0) return null;
  return Math.max(buyNow - sellNow, 0);
}

function parseMonthDay(value: string | null | undefined): Date | null {
  if (!value) return null;

  const match = value.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);
  if (!match) return null;

  const month = Number(match[1]);
  const day = Number(match[2]);
  let year = match[3] ? Number(match[3]) : new Date().getFullYear();
  const candidate = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (
    !match[3] &&
    candidate.getTime() - today.getTime() > 24 * 60 * 60 * 1000
  ) {
    year -= 1;
  }

  return new Date(year, month - 1, day);
}

function parseOrderDate(value: string | null | undefined): Date | null {
  if (!value) return null;

  const isoDate = new Date(value);
  if (
    Number.isFinite(isoDate.getTime()) &&
    /(?:[zZ]|[+-]\d{2}:\d{2})$/.test(value)
  ) {
    return isoDate;
  }

  const slashMatch = value.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/
  );
  if (slashMatch) {
    return new Date(
      Date.UTC(
        Number(slashMatch[3]),
        Number(slashMatch[1]) - 1,
        Number(slashMatch[2]),
        Number(slashMatch[4]),
        Number(slashMatch[5]),
        Number(slashMatch[6])
      )
    );
  }

  const sqlMatch = value.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/
  );
  if (sqlMatch) {
    return new Date(
      Date.UTC(
        Number(sqlMatch[1]),
        Number(sqlMatch[2]) - 1,
        Number(sqlMatch[3]),
        Number(sqlMatch[4]),
        Number(sqlMatch[5]),
        Number(sqlMatch[6])
      )
    );
  }

  return Number.isFinite(isoDate.getTime()) ? isoDate : null;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '' || value === '-') {
    return null;
  }

  const normalized =
    typeof value === 'string' ? value.replace(/,/g, '') : value;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(value);
}

function defaultFilters(): FilterState {
  return {
    itemType: '',
    minSpreadForPercent: DEFAULT_MIN_SPREAD_FOR_PERCENT,
    rarity: '',
    searchText: '',
    selectedUuid: null,
    sort: DEFAULT_SORT,
  };
}

function parseItemType(value: string | null): ItemType | '' {
  if (!value) return '';

  return MARKET_ITEM_TYPES.includes(value as ItemType)
    ? (value as ItemType)
    : '';
}

function parseRarity(value: string | null): string {
  if (!value) return '';

  const normalized = value.toLowerCase();
  return rarityOptions.includes(normalized) ? normalized : '';
}

function parseSort(value: string | null): SortKey {
  return sortOptions.some((option) => option.value === value)
    ? (value as SortKey)
    : DEFAULT_SORT;
}

function parseMinSpread(value: string | null): number {
  if (value === null || value.trim() === '') {
    return DEFAULT_MIN_SPREAD_FOR_PERCENT;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.max(Math.trunc(parsed), 0)
    : DEFAULT_MIN_SPREAD_FOR_PERCENT;
}

function parseSelectedUuid(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function updateUrlParam(key: string, value: string | null) {
  const url = new URL(window.location.href);

  if (value === null || value === '') {
    url.searchParams.delete(key);
  } else {
    url.searchParams.set(key, value);
  }

  window.history.replaceState({}, '', url);
}

function setSearchParam(
  searchParams: URLSearchParams,
  key: string,
  value: string
) {
  if (value) {
    searchParams.set(key, value);
  } else {
    searchParams.delete(key);
  }
}

export function sortListingsByStandardMetric(
  listings: Listing[],
  sort?: Exclude<
    SortKey,
    'spread_number' | 'spread_percentage' | 'profit' | 'profit_percentage'
  >,
  sortDirection?: SortOrder
): Listing[] {
  const direction = resolveSortDirection(sort, sortDirection) === 'asc' ? 1 : -1;

  return listings.slice().sort((a, b) => {
    const aValue = listingStandardSortValue(a, sort);
    const bValue = listingStandardSortValue(b, sort);

    if (aValue === null && bValue === null) return compareListingNames(a, b);
    if (aValue === null) return 1;
    if (bValue === null) return -1;
    if (aValue !== bValue) {
      return (aValue - bValue) * direction;
    }

    return compareListingNames(a, b);
  });
}

function compareListingNames(a: Listing, b: Listing): number {
  return (a.listing_name ?? a.item?.name ?? '').localeCompare(
    b.listing_name ?? b.item?.name ?? ''
  );
}

function listingStandardSortValue(
  listing: Listing,
  sort?: Exclude<
    SortKey,
    'spread_number' | 'spread_percentage' | 'profit' | 'profit_percentage'
  >
): number | null {
  if (sort === 'buy_now_vs_all_time_average_diff') {
    return listing.buyNowVsAllTimeAverageDiff ?? null;
  }

  if (sort === 'best_sell_price') {
    return getListingPrices(listing).buyNow;
  }

  if (sort === 'best_buy_price') {
    return getListingPrices(listing).sellNow;
  }

  return toNumber(listing.item?.['new_rank'] ?? listing.item?.ovr);
}

async function fetchAllListings({
  itemType,
  rarity,
}: {
  itemType?: ItemType | '';
  rarity?: string;
} = {}): Promise<Listing[]> {
  const listingTypes: ItemType[] = itemType ? [itemType] : MARKET_ITEM_TYPES;
  const allListings = await mapWithConcurrency(
    listingTypes,
    listingTypes.length,
    (type) =>
      fetchAllListingsForType(type, {
        rarity,
      })
  );

  return allListings.flat();
}

async function fetchAllListingsForType(
  type: (typeof MARKET_ITEM_TYPES)[number],
  {
    rarity,
  }: {
    rarity?: string;
  } = {}
): Promise<Listing[]> {
  const firstResponse = await fetchListings({
    page: 1,
    rarity,
    sort: 'rank',
    order: 'desc',
    type,
  });

  if (firstResponse.total_pages <= 1) {
    return firstResponse.listings ?? [];
  }

  const totalPages = Math.max(Number(firstResponse.total_pages) || 1, 1);
  const remainingPages = Array.from(
    { length: totalPages - 1 },
    (_, index) => index + 2
  );
  const remainingListings = await mapWithConcurrency(
    remainingPages,
    6,
    async (page) => {
      const response = await fetchListings({
        page,
        rarity,
        sort: 'rank',
        order: 'desc',
        type,
      });

      return response.listings ?? [];
    }
  );

  return [...(firstResponse.listings ?? []), ...remainingListings.flat()];
}

function listingMatchesItemType(
  listing: Listing,
  itemType?: ItemType | ''
): boolean {
  if (!itemType) return true;

  return listing.item?.type === itemType;
}

function listingMatchesRarity(
  listing: Listing,
  rarity: string | undefined
): boolean {
  if (!rarity) return true;

  return listing.item?.rarity?.toLowerCase() === rarity.toLowerCase();
}

function listingMatchesNormalizedSearch(
  listing: Listing,
  normalizedNeedle: string
): boolean {
  const normalizedName = normalizeSearchText(
    [listing.listing_name, listing.item?.name].filter(Boolean).join(' ')
  );

  return (
    normalizedName.includes(normalizedNeedle) ||
    compactSearchText(normalizedName).includes(
      compactSearchText(normalizedNeedle)
    )
  );
}

function filterListingsByPriceRange(
  listings: Listing[],
  {
    maxBuyNow,
    maxSellNow,
    minBuyNow,
    minSellNow,
  }: {
    maxBuyNow?: number;
    maxSellNow?: number;
    minBuyNow?: number;
    minSellNow?: number;
  }
): Listing[] {
  return listings.filter((listing) => {
    const prices = getListingPrices(listing);

    return (
      isWithinRange(prices.buyNow, minBuyNow, maxBuyNow) &&
      isWithinRange(prices.sellNow, minSellNow, maxSellNow)
    );
  });
}

function isWithinRange(
  value: number | null,
  min?: number,
  max?: number
): boolean {
  if (min === undefined && max === undefined) return true;
  if (value === null) return false;
  if (min !== undefined && value < min) return false;
  if (max !== undefined && value > max) return false;
  return true;
}

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function compactSearchText(value: string): string {
  return value.replace(/\s+/g, '');
}

export function filterListingsForSpreadSort(
  listings: Listing[],
  sort: SortKey,
  minSpreadForPercent?: number
): Listing[] {
  return listings.filter((listing) => {
    if (!hasNonZeroSellNow(listing)) return false;
    if (sort !== 'spread_percentage') return true;

    const spread = listingSpreadNumber(listing);
    return spread !== null && spread >= (minSpreadForPercent ?? 0);
  });
}

export function sortListingsBySpread(
  listings: Listing[],
  sort: SortKey,
  sortDirection?: SortOrder
): Listing[] {
  const direction =
    resolveSortDirection(sort, sortDirection) === 'asc' ? 1 : -1;

  return listings.slice().sort((a, b) => {
    const aValue = listingSpreadSortValue(a, sort);
    const bValue = listingSpreadSortValue(b, sort);

    if (aValue === null && bValue === null) return 0;
    if (aValue === null) return 1;
    if (bValue === null) return -1;

    return (
      (aValue - bValue) * direction ||
      ((getListingPrices(a).buyNow ?? 0) - (getListingPrices(b).buyNow ?? 0)) *
        direction ||
      (a.listing_name ?? '').localeCompare(b.listing_name ?? '')
    );
  });
}

function listingSpreadSortValue(
  listing: Listing,
  sort: SortKey
): number | null {
  if (sort === 'profit') {
    return listingProfit(listing);
  }

  if (sort === 'profit_percentage') {
    return listingProfitPercentage(listing);
  }

  return sort === 'spread_percentage'
    ? listingSpreadPercentage(listing)
    : listingSpreadNumber(listing);
}

function getQuickSellValue(listing: Listing): number | null {
  const itemType = listing.item?.type as ItemType | undefined;

  if (itemType === 'mlb_card') {
    return getPlayerCardQuickSellValue(listing);
  }

  const rarity = normalizeItemRarity(listing.item?.rarity);
  if (!itemType || !rarity) return null;

  return ITEM_QUICK_SELL_BY_TYPE_AND_RARITY[itemType]?.[rarity] ?? null;
}

function getPlayerCardQuickSellValue(listing: Listing): number | null {
  const ovr = toNumber(listing.item?.ovr);
  const isLiveCard = isLivePlayerCard(listing);

  if (ovr !== null) {
    const matchingTier = PLAYER_CARD_QUICK_SELL_VALUES.find(
      (tier) => ovr <= tier.maxOvr
    );
    if (matchingTier) {
      return isLiveCard ? matchingTier.live : matchingTier.nonLive;
    }
  }

  const rarity = normalizeItemRarity(listing.item?.rarity);
  if (!isPlayerCardQuickSellRarity(rarity)) return null;

  const fallback = GENERIC_PLAYER_CARD_QUICK_SELL_BY_RARITY[rarity];
  return isLiveCard ? fallback.live : fallback.nonLive;
}

function isLivePlayerCard(listing: Listing): boolean {
  return listing.item?.series?.toLowerCase() === 'live';
}

function isPlayerCardQuickSellRarity(
  value: string | null
): value is PlayerCardQuickSellRarity {
  return value !== null && value in GENERIC_PLAYER_CARD_QUICK_SELL_BY_RARITY;
}

function normalizeItemRarity(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

function listingSpreadNumber(listing: Listing): number | null {
  return calculateSpread(getListingPrices(listing));
}

function listingSpreadPercentage(listing: Listing): number | null {
  const spread = listingSpreadNumber(listing);
  const { buyNow } = getListingPrices(listing);
  if (spread === null || buyNow === null || buyNow <= 0) return null;
  return (spread / buyNow) * 100;
}

function listingProfit(listing: Listing): number | null {
  return calculateProfit(getListingPrices(listing));
}

function listingProfitPercentage(listing: Listing): number | null {
  return calculateProfitPercentage(getListingPrices(listing));
}

function hasNonZeroSellNow(listing: Listing): boolean {
  const { sellNow } = getListingPrices(listing);
  return sellNow !== null && sellNow > 0;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  let nextIndex = 0;
  const workerCount = Math.min(concurrency, items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await mapper(items[currentIndex]);
      }
    })
  );

  return results;
}

export function getDefaultSortDirection(sort?: SortKey): SortOrder {
  if (sort === 'best_sell_price') return 'asc';
  return 'desc';
}

export function resolveSortDirection(
  sort?: SortKey,
  sortDirection?: SortOrder
): SortOrder {
  return sortDirection ?? getDefaultSortDirection(sort);
}

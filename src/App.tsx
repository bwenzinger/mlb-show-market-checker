import { useEffect, useMemo, useState } from "react";

import {
  fetchListingByUuid,
  fetchListings,
  type CompletedOrder,
  type Listing,
  type ListingPriceHistoryPoint,
  type SortKey,
} from "./showApi";

type LoadState = "idle" | "loading" | "ready" | "error";

interface PricePoint {
  date: Date;
  label: string;
  buy: number | null;
  sell: number | null;
}

interface OrderPoint {
  date: Date;
  label: string;
  price: number;
}

interface OrderBucket {
  label: string;
  averagePrice: number;
  saleCount: number;
}

const rarityOptions = ["", "diamond", "gold", "silver", "bronze", "common"];

export default function App() {
  const [searchText, setSearchText] = useState("");
  const [query, setQuery] = useState("");
  const [rarity, setRarity] = useState("");
  const [sort, setSort] = useState<SortKey>("best_sell_price");
  const [listings, setListings] = useState<Listing[]>([]);
  const [listingState, setListingState] = useState<LoadState>("idle");
  const [listingError, setListingError] = useState("");
  const [selectedUuid, setSelectedUuid] = useState<string | null>(null);
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [detailState, setDetailState] = useState<LoadState>("idle");
  const [detailError, setDetailError] = useState("");

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setQuery(searchText.trim());
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [searchText]);

  useEffect(() => {
    let active = true;

    async function loadListings() {
      setListingState("loading");
      setListingError("");

      try {
        const response = await fetchListings({
          page: 1,
          name: query || undefined,
          rarity: rarity || undefined,
          sort,
          order: sortOrderFor(sort),
        });

        if (!active) return;

        const nextListings = response.listings ?? [];
        setListings(nextListings);
        setListingState("ready");

        const firstUuid = nextListings[0]?.item?.uuid;
        const selectedUuidStillVisible = nextListings.some(
          (listing) => listing.item?.uuid === selectedUuid,
        );

        if (firstUuid && (!selectedUuid || !selectedUuidStillVisible)) {
          setSelectedUuid(firstUuid);
        }
      } catch (error) {
        if (!active) return;
        setListings([]);
        setListingState("error");
        setListingError(error instanceof Error ? error.message : String(error));
      }
    }

    void loadListings();

    return () => {
      active = false;
    };
  }, [query, rarity, sort, selectedUuid]);

  useEffect(() => {
    if (!selectedUuid) return;

    let active = true;
    const uuid = selectedUuid;

    async function loadDetail() {
      setDetailState("loading");
      setDetailError("");

      try {
        const listing = await fetchListingByUuid(uuid);
        if (!active) return;
        setSelectedListing(listing);
        setDetailState("ready");
      } catch (error) {
        if (!active) return;
        setDetailState("error");
        setDetailError(error instanceof Error ? error.message : String(error));
      }
    }

    void loadDetail();

    return () => {
      active = false;
    };
  }, [selectedUuid]);

  const priceHistory = useMemo(
    () => normalizePriceHistory(selectedListing?.price_history ?? []),
    [selectedListing],
  );
  const completedOrders = useMemo(
    () => normalizeOrders(selectedListing?.completed_orders ?? []),
    [selectedListing],
  );
  const orderBuckets = useMemo(
    () => bucketOrdersByHour(completedOrders),
    [completedOrders],
  );

  const selectedName =
    selectedListing?.listing_name ??
    selectedListing?.item?.name ??
    listings.find((listing) => listing.item?.uuid === selectedUuid)?.listing_name ??
    "Select a player";
  const bestBuy = toNumber(selectedListing?.best_buy_price);
  const bestSell = toNumber(selectedListing?.best_sell_price);
  const earliestDaily = priceHistory[0]?.label ?? "Not returned";
  const earliestOrder = completedOrders[0]?.label ?? "Not returned";
  const latestOrder =
    completedOrders[completedOrders.length - 1]?.label ?? "Not returned";
  const currentSpread =
    bestBuy !== null && bestSell !== null ? Math.max(bestSell - bestBuy, 0) : null;
  const averageOrderPrice = average(completedOrders.map((order) => order.price));

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">MLB The Show 26 Market</p>
          <h1>Live card market</h1>
        </div>
        <div className="header-stat">
          <span>Source</span>
          <strong>mlb26.theshow.com</strong>
        </div>
      </header>

      <section className="workspace" aria-label="Market workspace">
        <aside className="search-panel">
          <div className="control-group">
            <label htmlFor="player-search">Player</label>
            <input
              id="player-search"
              type="search"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Search names"
            />
          </div>

          <div className="filter-row">
            <div className="control-group">
              <label htmlFor="rarity">Rarity</label>
              <select
                id="rarity"
                value={rarity}
                onChange={(event) => setRarity(event.target.value)}
              >
                {rarityOptions.map((option) => (
                  <option key={option || "all"} value={option}>
                    {option ? titleCase(option) : "All"}
                  </option>
                ))}
              </select>
            </div>

            <div className="control-group">
              <label htmlFor="sort">Sort</label>
              <select
                id="sort"
                value={sort}
                onChange={(event) => setSort(event.target.value as SortKey)}
              >
                <option value="best_sell_price">Buy now</option>
                <option value="best_buy_price">Sell now</option>
                <option value="rank">Overall</option>
              </select>
            </div>
          </div>

          {listingState === "error" ? (
            <p className="error-text">{listingError}</p>
          ) : null}

          <div className="result-list" aria-label="Player listings">
            {listingState === "loading" ? (
              <p className="muted">Loading market cards...</p>
            ) : null}

            {listings.map((listing, index) => {
              const uuid = listing.item?.uuid;
              const active = uuid === selectedUuid;

              return (
                <button
                  className={`result-item ${active ? "active" : ""}`}
                  key={uuid ?? `${listing.listing_name ?? "listing"}-${index}`}
                  type="button"
                  onClick={() => uuid && setSelectedUuid(uuid)}
                  disabled={!uuid}
                >
                  <img
                    src={listing.item?.baked_img ?? listing.item?.img ?? ""}
                    alt=""
                    loading="lazy"
                  />
                  <span>
                    <strong>{listing.listing_name ?? listing.item?.name}</strong>
                    <small>
                      {listing.item?.team_short_name ?? listing.item?.team ?? "FA"} -{" "}
                      {listing.item?.rarity ?? "Unknown"} - {listing.item?.ovr ?? "?"}
                    </small>
                  </span>
                  <em>{formatStubs(toNumber(listing.best_sell_price))}</em>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="analysis-panel" aria-label="Market analysis">
          {detailState === "error" ? (
            <p className="error-text">{detailError}</p>
          ) : null}

          <div className="player-summary">
            <div className="player-title">
              {selectedListing?.item?.baked_img_lg ||
              selectedListing?.item?.baked_img ||
              selectedListing?.item?.img ? (
                <img
                  src={
                    selectedListing.item.baked_img_lg ??
                    selectedListing.item.baked_img ??
                    selectedListing.item.img ??
                    ""
                  }
                  alt=""
                />
              ) : null}
              <div>
                <p className="eyebrow">
                  {selectedListing?.item?.team_short_name ??
                    selectedListing?.item?.team ??
                    "Market"}
                </p>
                <h2>{selectedName}</h2>
                <p className="muted">
                  {selectedListing?.item?.rarity ?? "Unknown rarity"} -{" "}
                  {selectedListing?.item?.series ?? "Unknown series"} -{" "}
                  {selectedListing?.item?.display_position ?? "Position"}
                </p>
              </div>
            </div>
            <div className="detail-state">
              {detailState === "loading" ? "Refreshing..." : "Live API"}
            </div>
          </div>

          <div className="metric-grid">
            <Metric label="Buy now" value={formatStubs(bestSell)} />
            <Metric label="Sell now" value={formatStubs(bestBuy)} />
            <Metric label="Spread" value={formatStubs(currentSpread)} />
            <Metric label="Average order" value={formatStubs(averageOrderPrice)} />
            <Metric label="Daily history starts" value={earliestDaily} />
            <Metric label="Granular orders start" value={earliestOrder} />
          </div>

          <div className="chart-grid">
            <section className="chart-section">
              <div className="section-heading">
                <h3>Daily price history</h3>
                <span>{priceHistory.length} points</span>
              </div>
              <PriceChart points={priceHistory} />
            </section>

            <section className="chart-section">
              <div className="section-heading">
                <h3>Completed orders by hour</h3>
                <span>{completedOrders.length} orders</span>
              </div>
              <OrderChart buckets={orderBuckets} />
            </section>
          </div>

          <section className="orders-section">
            <div className="section-heading">
              <h3>Recent completed orders</h3>
              <span>{earliestOrder} to {latestOrder}</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Price</th>
                  </tr>
                </thead>
                <tbody>
                  {completedOrders
                    .slice()
                    .reverse()
                    .slice(0, 40)
                    .map((order, index) => (
                      <tr key={`${order.label}-${order.price}-${index}`}>
                        <td>{order.label}</td>
                        <td>{formatStubs(order.price)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
        </section>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PriceChart({ points }: { points: PricePoint[] }) {
  if (points.length === 0) {
    return <p className="empty-chart">No daily prices returned.</p>;
  }

  return (
    <LineChart
      points={points.map((point) => ({
        label: point.label,
        primary: point.sell,
        secondary: point.buy,
      }))}
      primaryLabel="Buy now"
      secondaryLabel="Sell now"
    />
  );
}

function OrderChart({ buckets }: { buckets: OrderBucket[] }) {
  if (buckets.length === 0) {
    return <p className="empty-chart">No completed orders returned.</p>;
  }

  return (
    <LineChart
      points={buckets.map((bucket) => ({
        label: bucket.label,
        primary: bucket.averagePrice,
        secondary: bucket.saleCount,
      }))}
      primaryLabel="Average"
      secondaryLabel="Sales"
    />
  );
}

function LineChart({
  points,
  primaryLabel,
  secondaryLabel,
}: {
  points: Array<{ label: string; primary: number | null; secondary: number | null }>;
  primaryLabel: string;
  secondaryLabel: string;
}) {
  const width = 720;
  const height = 260;
  const padding = 28;
  const primaryValues = points
    .map((point) => point.primary)
    .filter((value): value is number => value !== null);
  const secondaryValues = points
    .map((point) => point.secondary)
    .filter((value): value is number => value !== null);
  const allValues = [...primaryValues, ...secondaryValues];
  if (allValues.length === 0) {
    return <p className="empty-chart">No prices returned.</p>;
  }

  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const range = max - min || 1;

  const xFor = (index: number) =>
    padding + (index / Math.max(points.length - 1, 1)) * (width - padding * 2);
  const yFor = (value: number) =>
    height - padding - ((value - min) / range) * (height - padding * 2);

  const pathFor = (key: "primary" | "secondary") => {
    let started = false;

    return points
      .map((point, index) => {
        const value = point[key];
        if (value === null) return null;

        const command = started ? "L" : "M";
        started = true;

        return `${command} ${xFor(index).toFixed(2)} ${yFor(value).toFixed(2)}`;
      })
      .filter(Boolean)
      .join(" ");
  };

  return (
    <div>
      <svg
        className="line-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${primaryLabel} and ${secondaryLabel} trend`}
      >
        <line x1={padding} x2={width - padding} y1={height - padding} y2={height - padding} />
        <line x1={padding} x2={padding} y1={padding} y2={height - padding} />
        <path className="primary-line" d={pathFor("primary")} />
        <path className="secondary-line" d={pathFor("secondary")} />
        {points.map((point, index) => {
          if (point.primary === null) return null;
          return (
            <circle
              className="primary-dot"
              cx={xFor(index)}
              cy={yFor(point.primary)}
              key={`${point.label}-primary`}
              r="3"
            />
          );
        })}
      </svg>
      <div className="legend">
        <span><i className="primary-swatch" />{primaryLabel}</span>
        <span><i className="secondary-swatch" />{secondaryLabel}</span>
      </div>
    </div>
  );
}

function normalizePriceHistory(points: ListingPriceHistoryPoint[]): PricePoint[] {
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

function normalizeOrders(orders: CompletedOrder[]): OrderPoint[] {
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

function bucketOrdersByHour(orders: OrderPoint[]): OrderBucket[] {
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

  if (!match[3] && candidate.getTime() - today.getTime() > 24 * 60 * 60 * 1000) {
    year -= 1;
  }

  return new Date(year, month - 1, day);
}

function parseOrderDate(value: string | null | undefined): Date | null {
  if (!value) return null;

  const match = value.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/,
  );
  if (!match) return null;

  return new Date(
    Number(match[3]),
    Number(match[1]) - 1,
    Number(match[2]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6]),
  );
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "" || value === "-") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatStubs(value: number | null): string {
  if (value === null) return "-";
  return Math.round(value).toLocaleString("en-US");
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(value);
}

function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function sortOrderFor(sort: SortKey) {
  if (sort === "best_sell_price") return "asc";
  return "desc";
}

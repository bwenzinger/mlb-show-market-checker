import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Avatar,
  Box,
  Chip,
  CircularProgress,
  Container,
  FormControl,
  InputLabel,
  List,
  ListItemAvatar,
  ListItemButton,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  type SelectChangeEvent,
} from "@mui/material";

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
  const cardImage =
    selectedListing?.item?.baked_img_lg ??
    selectedListing?.item?.baked_img ??
    selectedListing?.item?.img;

  return (
    <Container maxWidth={false} sx={{ maxWidth: 1440, py: 3 }}>
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={2}
        sx={{ alignItems: { xs: "stretch", md: "flex-end" }, mb: 2.5 }}
      >
        <Box sx={{ flex: 1 }}>
          <Typography
            color="primary"
            fontSize={12}
            fontWeight={800}
            letterSpacing="0.08em"
            textTransform="uppercase"
          >
            MLB The Show 26 Market
          </Typography>
          <Typography component="h1" variant="h4" fontWeight={800}>
            Live card market
          </Typography>
        </Box>
        <Paper variant="outlined" sx={{ minWidth: { md: 240 }, p: 1.5 }}>
          <Typography variant="caption" color="text.secondary">
            Source
          </Typography>
          <Typography fontWeight={800}>mlb26.theshow.com</Typography>
        </Paper>
      </Stack>

      <Box
        component="section"
        aria-label="Market workspace"
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", lg: "370px minmax(0, 1fr)" },
          gap: 2.5,
        }}
      >
        <SearchPanel
          listings={listings}
          listingError={listingError}
          listingState={listingState}
          rarity={rarity}
          searchText={searchText}
          selectedUuid={selectedUuid}
          setRarity={setRarity}
          setSearchText={setSearchText}
          setSelectedUuid={setSelectedUuid}
          setSort={setSort}
          sort={sort}
        />

        <Paper
          component="section"
          aria-label="Market analysis"
          variant="outlined"
          sx={{ minWidth: 0, p: { xs: 2, md: 2.25 } }}
        >
          <Stack spacing={2.25}>
            {detailState === "error" ? (
              <Alert severity="error">{detailError}</Alert>
            ) : null}

            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={2}
              sx={{ alignItems: { xs: "flex-start", sm: "center" } }}
            >
              {cardImage ? (
                <Box
                  component="img"
                  alt=""
                  src={cardImage}
                  sx={{
                    width: { xs: 72, sm: 96 },
                    height: { xs: 72, sm: 96 },
                    flex: "0 0 auto",
                    objectFit: "contain",
                  }}
                />
              ) : null}

              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography
                  color="primary"
                  fontSize={12}
                  fontWeight={800}
                  letterSpacing="0.08em"
                  textTransform="uppercase"
                >
                  {selectedListing?.item?.team_short_name ??
                    selectedListing?.item?.team ??
                    "Market"}
                </Typography>
                <Typography component="h2" variant="h4" fontWeight={800}>
                  {selectedName}
                </Typography>
                <Typography color="text.secondary">
                  {selectedListing?.item?.rarity ?? "Unknown rarity"} -{" "}
                  {selectedListing?.item?.series ?? "Unknown series"} -{" "}
                  {selectedListing?.item?.display_position ?? "Position"}
                </Typography>
              </Box>

              <Chip
                color={detailState === "loading" ? "default" : "primary"}
                label={detailState === "loading" ? "Refreshing..." : "Live API"}
                variant="outlined"
              />
            </Stack>

            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "1fr",
                  sm: "repeat(2, minmax(0, 1fr))",
                  xl: "repeat(6, minmax(0, 1fr))",
                },
                gap: 1.25,
              }}
            >
              <Metric label="Buy now" value={formatStubs(bestSell)} />
              <Metric label="Sell now" value={formatStubs(bestBuy)} />
              <Metric label="Spread" value={formatStubs(currentSpread)} />
              <Metric
                label="Average order"
                value={formatStubs(averageOrderPrice)}
              />
              <Metric label="Daily history starts" value={earliestDaily} />
              <Metric label="Granular orders start" value={earliestOrder} />
            </Box>

            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", xl: "1fr 1fr" },
                gap: 1.75,
              }}
            >
              <ChartCard title="Daily price history" meta={`${priceHistory.length} points`}>
                <PriceChart points={priceHistory} />
              </ChartCard>

              <ChartCard
                title="Completed orders by hour"
                meta={`${completedOrders.length} orders`}
              >
                <OrderChart buckets={orderBuckets} />
              </ChartCard>
            </Box>

            <Paper variant="outlined" sx={{ p: 1.75 }}>
              <SectionHeading
                title="Recent completed orders"
                meta={`${earliestOrder} to ${latestOrder}`}
              />
              <TableContainer sx={{ maxHeight: 360 }}>
                <Table stickyHeader size="small" aria-label="Recent completed orders">
                  <TableHead>
                    <TableRow>
                      <TableCell>Time</TableCell>
                      <TableCell align="right">Price</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {completedOrders
                      .slice()
                      .reverse()
                      .slice(0, 40)
                      .map((order, index) => (
                        <TableRow key={`${order.label}-${order.price}-${index}`}>
                          <TableCell>{order.label}</TableCell>
                          <TableCell align="right">
                            {formatStubs(order.price)}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Stack>
        </Paper>
      </Box>
    </Container>
  );
}

function SearchPanel({
  listings,
  listingError,
  listingState,
  rarity,
  searchText,
  selectedUuid,
  setRarity,
  setSearchText,
  setSelectedUuid,
  setSort,
  sort,
}: {
  listings: Listing[];
  listingError: string;
  listingState: LoadState;
  rarity: string;
  searchText: string;
  selectedUuid: string | null;
  setRarity: (value: string) => void;
  setSearchText: (value: string) => void;
  setSelectedUuid: (value: string) => void;
  setSort: (value: SortKey) => void;
  sort: SortKey;
}) {
  return (
    <Paper
      component="aside"
      variant="outlined"
      sx={{ alignSelf: "start", p: 2, position: { lg: "sticky" }, top: 16 }}
    >
      <Stack spacing={1.5}>
        <TextField
          fullWidth
          label="Player"
          onChange={(event) => setSearchText(event.target.value)}
          placeholder="Search names"
          type="search"
          value={searchText}
        />

        <Stack direction={{ xs: "column", sm: "row", lg: "row" }} spacing={1.5}>
          <FormControl fullWidth>
            <InputLabel id="rarity-label">Rarity</InputLabel>
            <Select
              label="Rarity"
              labelId="rarity-label"
              onChange={(event: SelectChangeEvent) => setRarity(event.target.value)}
              value={rarity}
            >
              {rarityOptions.map((option) => (
                <MenuItem key={option || "all"} value={option}>
                  {option ? titleCase(option) : "All"}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl fullWidth>
            <InputLabel id="sort-label">Sort</InputLabel>
            <Select
              label="Sort"
              labelId="sort-label"
              onChange={(event: SelectChangeEvent) =>
                setSort(event.target.value as SortKey)
              }
              value={sort}
            >
              <MenuItem value="best_sell_price">Buy now</MenuItem>
              <MenuItem value="best_buy_price">Sell now</MenuItem>
              <MenuItem value="rank">Overall</MenuItem>
            </Select>
          </FormControl>
        </Stack>

        {listingState === "error" ? (
          <Alert severity="error">{listingError}</Alert>
        ) : null}

        <Box sx={{ position: "relative" }}>
          {listingState === "loading" ? (
            <Stack
              direction="row"
              spacing={1}
              sx={{ alignItems: "center", color: "text.secondary", mb: 1 }}
            >
              <CircularProgress size={16} />
              <Typography variant="body2">Loading market cards...</Typography>
            </Stack>
          ) : null}

          <List
            aria-label="Player listings"
            disablePadding
            sx={{
              display: "grid",
              gap: 1,
              maxHeight: { xs: 440, lg: "calc(100vh - 250px)" },
              overflow: "auto",
              pr: 0.5,
            }}
          >
            {listings.map((listing, index) => {
              const uuid = listing.item?.uuid;
              const active = uuid === selectedUuid;
              const image = listing.item?.baked_img ?? listing.item?.img ?? undefined;

              return (
                <ListItemButton
                  disabled={!uuid}
                  key={uuid ?? `${listing.listing_name ?? "listing"}-${index}`}
                  onClick={() => uuid && setSelectedUuid(uuid)}
                  selected={active}
                  sx={{
                    border: 1,
                    borderColor: active ? "primary.main" : "divider",
                    borderRadius: 1,
                    gap: 1,
                  }}
                >
                  <ListItemAvatar sx={{ minWidth: 48 }}>
                    <Avatar
                      src={image}
                      variant="square"
                      sx={{ bgcolor: "background.default", objectFit: "contain" }}
                    >
                      {listing.listing_name?.charAt(0) ?? "?"}
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={listing.listing_name ?? listing.item?.name}
                    primaryTypographyProps={{ fontWeight: 800, noWrap: true }}
                    secondary={`${listing.item?.team_short_name ?? listing.item?.team ?? "FA"} - ${
                      listing.item?.rarity ?? "Unknown"
                    } - ${listing.item?.ovr ?? "?"}`}
                    secondaryTypographyProps={{ noWrap: true }}
                  />
                  <Typography color="secondary" fontWeight={900}>
                    {formatStubs(toNumber(listing.best_sell_price))}
                  </Typography>
                </ListItemButton>
              );
            })}
          </List>
        </Box>
      </Stack>
    </Paper>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Paper variant="outlined" sx={{ minWidth: 0, p: 1.5 }}>
      <Typography color="text.secondary" variant="caption">
        {label}
      </Typography>
      <Typography fontWeight={900} sx={{ overflowWrap: "anywhere" }} variant="h6">
        {value}
      </Typography>
    </Paper>
  );
}

function ChartCard({
  children,
  meta,
  title,
}: {
  children: React.ReactNode;
  meta: string;
  title: string;
}) {
  return (
    <Paper variant="outlined" sx={{ minWidth: 0, p: 1.75 }}>
      <SectionHeading title={title} meta={meta} />
      {children}
    </Paper>
  );
}

function SectionHeading({ meta, title }: { meta: string; title: string }) {
  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={1}
      sx={{ alignItems: { xs: "flex-start", sm: "baseline" }, mb: 1.5 }}
    >
      <Typography component="h3" fontWeight={900} sx={{ flex: 1 }} variant="h6">
        {title}
      </Typography>
      <Typography color="text.secondary" variant="body2">
        {meta}
      </Typography>
    </Stack>
  );
}

function PriceChart({ points }: { points: PricePoint[] }) {
  if (points.length === 0) {
    return <Typography color="text.secondary">No daily prices returned.</Typography>;
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
    return (
      <Typography color="text.secondary">No completed orders returned.</Typography>
    );
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
    return <Typography color="text.secondary">No prices returned.</Typography>;
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
    <Box>
      <Box
        component="svg"
        role="img"
        aria-label={`${primaryLabel} and ${secondaryLabel} trend`}
        viewBox={`0 0 ${width} ${height}`}
        sx={{ display: "block", height: "auto", overflow: "visible", width: "100%" }}
      >
        <line
          x1={padding}
          x2={width - padding}
          y1={height - padding}
          y2={height - padding}
          stroke="rgba(255,255,255,0.2)"
        />
        <line
          x1={padding}
          x2={padding}
          y1={padding}
          y2={height - padding}
          stroke="rgba(255,255,255,0.2)"
        />
        <path
          d={pathFor("primary")}
          fill="none"
          stroke="#7dd3a7"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="3"
        />
        <path
          d={pathFor("secondary")}
          fill="none"
          stroke="#f7c873"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="3"
        />
        {points.map((point, index) => {
          if (point.primary === null) return null;
          return (
            <circle
              cx={xFor(index)}
              cy={yFor(point.primary)}
              fill="#7dd3a7"
              key={`${point.label}-primary`}
              r="3"
            />
          );
        })}
      </Box>

      <Stack direction="row" spacing={1.75} sx={{ mt: 1 }}>
        <LegendItem color="#7dd3a7" label={primaryLabel} />
        <LegendItem color="#f7c873" label={secondaryLabel} />
      </Stack>
    </Box>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
      <Box
        sx={{
          bgcolor: color,
          borderRadius: "50%",
          height: 12,
          width: 12,
        }}
      />
      <Typography color="text.secondary" variant="body2">
        {label}
      </Typography>
    </Stack>
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

function sortOrderFor(sort: SortKey): "asc" | "desc" {
  if (sort === "best_sell_price") return "asc";
  return "desc";
}

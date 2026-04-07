import { useEffect, useMemo, useRef, useState } from "react";
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
  Tooltip,
  Typography,
  type SelectChangeEvent,
} from "@mui/material";

import {
  fetchListingByUuid,
  fetchListings,
  type ApiSortKey,
  fetchStoredCompletedOrders,
  type CompletedOrder,
  type Listing,
  type ListingPriceHistoryPoint,
  type SortOrder,
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
const sortOptions: Array<{ label: string; value: SortKey }> = [
  { label: "Buy now", value: "best_sell_price" },
  { label: "Sell now", value: "best_buy_price" },
  { label: "Spread", value: "spread_number" },
  { label: "Spread %", value: "spread_percentage" },
  { label: "Overall", value: "rank" },
];
const LISTING_CACHE_MS = 60_000;
const DEFAULT_MIN_SPREAD_FOR_PERCENT = 40;
const fullListingsCache = new Map<
  string,
  { expiresAt: number; promise: Promise<Listing[]> }
>();

export default function App() {
  const [searchText, setSearchText] = useState("");
  const [query, setQuery] = useState("");
  const [rarity, setRarity] = useState("");
  const [sort, setSort] = useState<SortKey>("spread_percentage");
  const [minSpreadForPercent, setMinSpreadForPercent] = useState(
    DEFAULT_MIN_SPREAD_FOR_PERCENT,
  );
  const [listings, setListings] = useState<Listing[]>([]);
  const [listingState, setListingState] = useState<LoadState>("idle");
  const [listingError, setListingError] = useState("");
  const [selectedUuid, setSelectedUuid] = useState<string | null>(null);
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [storedCompletedOrders, setStoredCompletedOrders] = useState<
    CompletedOrder[] | null
  >(null);
  const [detailState, setDetailState] = useState<LoadState>("idle");
  const [detailError, setDetailError] = useState("");
  const selectedUuidRef = useRef(selectedUuid);

  useEffect(() => {
    selectedUuidRef.current = selectedUuid;
  }, [selectedUuid]);

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
        const nextListings = await fetchSortedListings({
          name: query || undefined,
          minSpreadForPercent,
          rarity: rarity || undefined,
          sort,
        });

        if (!active) return;

        setListings(nextListings);
        setListingState("ready");

        const firstUuid = nextListings[0]?.item?.uuid;
        const currentSelectedUuid = selectedUuidRef.current;
        const selectedUuidStillVisible = nextListings.some(
          (listing) => listing.item?.uuid === currentSelectedUuid,
        );

        if (firstUuid && (!currentSelectedUuid || !selectedUuidStillVisible)) {
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
  }, [minSpreadForPercent, query, rarity, sort]);

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

  useEffect(() => {
    if (!selectedUuid) {
      setStoredCompletedOrders(null);
      return;
    }

    let active = true;
    const uuid = selectedUuid;
    setStoredCompletedOrders(null);

    async function loadStoredOrders() {
      try {
        const orders = await fetchStoredCompletedOrders({ days: 7, uuid });
        if (!active) return;
        setStoredCompletedOrders(orders.length > 0 ? orders : null);
      } catch {
        if (!active) return;
        setStoredCompletedOrders(null);
      }
    }

    void loadStoredOrders();

    return () => {
      active = false;
    };
  }, [selectedUuid]);

  const priceHistory = useMemo(
    () => normalizePriceHistory(selectedListing?.price_history ?? []),
    [selectedListing],
  );
  const completedOrders = useMemo(
    () =>
      normalizeOrders(
        storedCompletedOrders?.length
          ? storedCompletedOrders
          : (selectedListing?.completed_orders ?? []),
      ),
    [selectedListing, storedCompletedOrders],
  );
  const orderBuckets = useMemo(
    () => bucketOrdersByHour(completedOrders),
    [completedOrders],
  );

  const selectedName =
    selectedListing?.listing_name ??
    selectedListing?.item?.name ??
    listings.find((listing) => listing.item?.uuid === selectedUuid)
      ?.listing_name ??
    "Select a player";
  const bestBuy = toNumber(selectedListing?.best_buy_price);
  const bestSell = toNumber(selectedListing?.best_sell_price);
  const earliestDaily = priceHistory[0]?.label ?? "Not returned";
  const earliestOrder = completedOrders[0]?.label ?? "Not returned";
  const latestOrder =
    completedOrders[completedOrders.length - 1]?.label ?? "Not returned";
  const currentSpread =
    bestBuy !== null && bestSell !== null
      ? Math.max(bestSell - bestBuy, 0)
      : null;
  const currentSpreadPercentage =
    currentSpread !== null && bestSell !== null && bestSell > 0
      ? (currentSpread / bestSell) * 100
      : null;
  const averageOrderPrice = average(
    completedOrders.map((order) => order.price),
  );
  const completedOrdersSource = storedCompletedOrders?.length
    ? "Local database"
    : "Live API sample";
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
          minSpreadForPercent={minSpreadForPercent}
          rarity={rarity}
          searchText={searchText}
          selectedUuid={selectedUuid}
          setMinSpreadForPercent={setMinSpreadForPercent}
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
              <Metric
                label="Spread"
                value={formatSpread(currentSpread, currentSpreadPercentage)}
              />
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
              <ChartCard
                title="Daily price history"
                meta={`${priceHistory.length} points`}
              >
                <PriceChart points={priceHistory} />
              </ChartCard>

              <ChartCard
                title="Completed orders by hour"
                meta={`${completedOrders.length} orders - ${completedOrdersSource}`}
              >
                <OrderChart buckets={orderBuckets} />
              </ChartCard>
            </Box>

            <Paper variant="outlined" sx={{ p: 1.75 }}>
              <SectionHeading
                title="Recent completed orders"
                meta={`${completedOrdersSource}: ${earliestOrder} to ${latestOrder}`}
              />
              <TableContainer sx={{ maxHeight: 360 }}>
                <Table
                  stickyHeader
                  size="small"
                  aria-label="Recent completed orders"
                >
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
                        <TableRow
                          key={`${order.label}-${order.price}-${index}`}
                        >
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
  minSpreadForPercent,
  rarity,
  searchText,
  selectedUuid,
  setMinSpreadForPercent,
  setRarity,
  setSearchText,
  setSelectedUuid,
  setSort,
  sort,
}: {
  listings: Listing[];
  listingError: string;
  listingState: LoadState;
  minSpreadForPercent: number;
  rarity: string;
  searchText: string;
  selectedUuid: string | null;
  setMinSpreadForPercent: (value: number) => void;
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
              onChange={(event: SelectChangeEvent) =>
                setRarity(event.target.value)
              }
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
              {sortOptions.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>

        {sort === "spread_percentage" ? (
          <TextField
            fullWidth
            inputProps={{ min: 0, step: 1 }}
            label="Minimum spread"
            onChange={(event) =>
              setMinSpreadForPercent(
                Math.max(Number(event.target.value) || 0, 0),
              )
            }
            type="number"
            value={minSpreadForPercent}
          />
        ) : null}

        {isSpreadSort(sort) ? (
          <Alert severity="info" sx={{ py: 0.5 }}>
            Spread sorts hide cards with Sell now at 0
            {sort === "spread_percentage"
              ? ` and spreads below ${formatStubs(minSpreadForPercent)}.`
              : "."}
          </Alert>
        ) : null}

        {listingState === "error" ? (
          <Alert severity="error">{listingError}</Alert>
        ) : null}

        <Box sx={{ position: "relative" }}>
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
              const image =
                listing.item?.baked_img ?? listing.item?.img ?? undefined;
              const metric = getListingSortMetric(listing, sort);

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
                      sx={{
                        bgcolor: "background.default",
                        objectFit: "contain",
                      }}
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
                  <Box sx={{ flex: "0 0 auto", textAlign: "right" }}>
                    <Typography color="secondary" fontWeight={900}>
                      {metric.value}
                    </Typography>
                    <Typography color="text.secondary" variant="caption">
                      {metric.label}
                    </Typography>
                  </Box>
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
      <Typography
        fontWeight={900}
        sx={{ overflowWrap: "anywhere" }}
        variant="h6"
      >
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
    return (
      <Typography color="text.secondary">No daily prices returned.</Typography>
    );
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
      <Typography color="text.secondary">
        No completed orders returned.
      </Typography>
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
  points: Array<{
    label: string;
    primary: number | null;
    secondary: number | null;
  }>;
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
        sx={{
          display: "block",
          height: "auto",
          overflow: "visible",
          width: "100%",
        }}
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
          const currentX = xFor(index);
          const leftX = index === 0 ? 0 : (xFor(index - 1) + currentX) / 2;
          const rightX =
            index === points.length - 1
              ? width
              : (currentX + xFor(index + 1)) / 2;
          const columnWidth = Math.max(rightX - leftX, 1);
          const primaryY = point.primary === null ? null : yFor(point.primary);
          const secondaryY =
            point.secondary === null ? null : yFor(point.secondary);
          if (primaryY === null && secondaryY === null) return null;

          return (
            <Tooltip
              arrow
              enterTouchDelay={0}
              key={`${point.label}-${index}`}
              title={
                <ChartTooltipContent
                  label={point.label}
                  primaryLabel={primaryLabel}
                  primaryValue={point.primary}
                  secondaryLabel={secondaryLabel}
                  secondaryValue={point.secondary}
                />
              }
            >
              <g
                aria-label={`${point.label}: ${primaryLabel} ${formatStubs(
                  point.primary,
                )}, ${secondaryLabel} ${formatStubs(point.secondary)}`}
                role="img"
                style={{ cursor: "crosshair", outline: "none" }}
                tabIndex={0}
              >
                <rect
                  fill="transparent"
                  height={height}
                  pointerEvents="all"
                  stroke="transparent"
                  width={columnWidth}
                  x={leftX}
                  y={0}
                />
                {primaryY !== null ? (
                  <circle cx={currentX} cy={primaryY} fill="#7dd3a7" r="3.5" />
                ) : null}
                {secondaryY !== null ? (
                  <circle
                    cx={currentX}
                    cy={secondaryY}
                    fill="#f7c873"
                    r="3.5"
                  />
                ) : null}
              </g>
            </Tooltip>
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

function ChartTooltipContent({
  label,
  primaryLabel,
  primaryValue,
  secondaryLabel,
  secondaryValue,
}: {
  label: string;
  primaryLabel: string;
  primaryValue: number | null;
  secondaryLabel: string;
  secondaryValue: number | null;
}) {
  return (
    <Stack spacing={0.5}>
      <Typography fontWeight={900} variant="body2">
        {label}
      </Typography>
      <Typography variant="caption">
        {primaryLabel}: {formatStubs(primaryValue)}
      </Typography>
      <Typography variant="caption">
        {secondaryLabel}: {formatStubs(secondaryValue)}
      </Typography>
    </Stack>
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

function normalizePriceHistory(
  points: ListingPriceHistoryPoint[],
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

  const normalized =
    typeof value === "string" ? value.replace(/,/g, "") : value;
  const parsed = Number(normalized);
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

async function fetchSortedListings({
  minSpreadForPercent,
  name,
  rarity,
  sort,
}: {
  minSpreadForPercent: number;
  name?: string;
  rarity?: string;
  sort: SortKey;
}): Promise<Listing[]> {
  const apiSort = apiSortFor(sort);
  const order = sortOrderFor(apiSort);
  const normalizedName = normalizeSearchText(name ?? "");

  if (normalizedName || isSpreadSort(sort)) {
    const allListings = await fetchAllListings({
      order,
      rarity,
      sort: apiSort,
    });
    const searchedListings = normalizedName
      ? allListings.filter((listing) =>
          listingMatchesNormalizedSearch(listing, normalizedName),
        )
      : allListings;

    return isSpreadSort(sort)
      ? sortListingsBySpread(
          filterListingsForSpreadSort(
            searchedListings,
            sort,
            minSpreadForPercent,
          ),
          sort,
        )
      : searchedListings;
  }

  const firstResponse = await fetchListings({
    page: 1,
    name,
    rarity,
    sort: apiSort,
    order,
  });

  return firstResponse.listings ?? [];
}

async function fetchAllListings({
  order,
  rarity,
  sort,
}: {
  order: SortOrder;
  rarity?: string;
  sort: ApiSortKey;
}): Promise<Listing[]> {
  const cacheKey = JSON.stringify({ order, rarity: rarity ?? "", sort });
  const cached = fullListingsCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.promise;
  }

  const promise = fetchAllListingsUncached({ order, rarity, sort }).catch(
    (error) => {
      if (fullListingsCache.get(cacheKey)?.promise === promise) {
        fullListingsCache.delete(cacheKey);
      }

      throw error;
    },
  );

  fullListingsCache.set(cacheKey, {
    expiresAt: Date.now() + LISTING_CACHE_MS,
    promise,
  });

  return promise;
}

async function fetchAllListingsUncached({
  order,
  rarity,
  sort,
}: {
  order: SortOrder;
  rarity?: string;
  sort: ApiSortKey;
}): Promise<Listing[]> {
  const firstResponse = await fetchListings({
    page: 1,
    rarity,
    sort,
    order,
  });

  if (firstResponse.total_pages <= 1) {
    return firstResponse.listings ?? [];
  }

  const totalPages = Math.max(Number(firstResponse.total_pages) || 1, 1);
  const remainingPages = Array.from(
    { length: totalPages - 1 },
    (_, index) => index + 2,
  );
  const remainingListings = await mapWithConcurrency(
    remainingPages,
    6,
    async (page) => {
      const response = await fetchListings({
        page,
        rarity,
        sort,
        order,
      });

      return response.listings ?? [];
    },
  );

  return [...(firstResponse.listings ?? []), ...remainingListings.flat()];
}

function apiSortFor(sort: SortKey): ApiSortKey {
  return isSpreadSort(sort) ? "rank" : sort;
}

function listingMatchesNormalizedSearch(
  listing: Listing,
  normalizedNeedle: string,
): boolean {
  const normalizedName = normalizeSearchText(
    [listing.listing_name, listing.item?.name].filter(Boolean).join(" "),
  );

  return (
    normalizedName.includes(normalizedNeedle) ||
    compactSearchText(normalizedName).includes(
      compactSearchText(normalizedNeedle),
    )
  );
}

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function compactSearchText(value: string): string {
  return value.replace(/\s+/g, "");
}

function isSpreadSort(
  sort: SortKey,
): sort is "spread_number" | "spread_percentage" {
  return sort === "spread_number" || sort === "spread_percentage";
}

function filterListingsForSpreadSort(
  listings: Listing[],
  sort: SortKey,
  minSpreadForPercent: number,
): Listing[] {
  return listings.filter((listing) => {
    if (!hasNonZeroSellNow(listing)) return false;
    if (sort !== "spread_percentage") return true;

    const spread = listingSpreadNumber(listing);
    return spread !== null && spread >= minSpreadForPercent;
  });
}

function sortListingsBySpread(listings: Listing[], sort: SortKey): Listing[] {
  return listings.slice().sort((a, b) => {
    const aValue = listingSpreadSortValue(a, sort);
    const bValue = listingSpreadSortValue(b, sort);

    if (aValue === null && bValue === null) return 0;
    if (aValue === null) return 1;
    if (bValue === null) return -1;

    return (
      bValue - aValue ||
      (getListingPrices(b).buyNow ?? 0) - (getListingPrices(a).buyNow ?? 0) ||
      (a.listing_name ?? "").localeCompare(b.listing_name ?? "")
    );
  });
}

function listingSpreadSortValue(
  listing: Listing,
  sort: SortKey,
): number | null {
  return sort === "spread_percentage"
    ? listingSpreadPercentage(listing)
    : listingSpreadNumber(listing);
}

function getListingSortMetric(
  listing: Listing,
  sort: SortKey,
): { label: string; value: string } {
  const prices = getListingPrices(listing);

  if (sort === "best_buy_price") {
    return { label: "Sell now", value: formatStubs(prices.sellNow) };
  }

  if (sort === "spread_number") {
    return {
      label: "Spread",
      value: formatStubs(listingSpreadNumber(listing)),
    };
  }

  if (sort === "spread_percentage") {
    return {
      label: "Spread",
      value: formatPercent(listingSpreadPercentage(listing)),
    };
  }

  return { label: "Buy now", value: formatStubs(prices.buyNow) };
}

function getListingPrices(listing: Listing): {
  buyNow: number | null;
  sellNow: number | null;
} {
  return {
    buyNow: toNumber(listing.best_sell_price),
    sellNow: toNumber(listing.best_buy_price),
  };
}

function listingSpreadNumber(listing: Listing): number | null {
  const { buyNow, sellNow } = getListingPrices(listing);
  if (buyNow === null || sellNow === null || sellNow <= 0) return null;
  return Math.max(buyNow - sellNow, 0);
}

function listingSpreadPercentage(listing: Listing): number | null {
  const spread = listingSpreadNumber(listing);
  const { buyNow } = getListingPrices(listing);
  if (spread === null || buyNow === null || buyNow <= 0) return null;
  return (spread / buyNow) * 100;
}

function hasNonZeroSellNow(listing: Listing): boolean {
  const { sellNow } = getListingPrices(listing);
  return sellNow !== null && sellNow > 0;
}

function formatPercent(value: number | null): string {
  if (value === null) return "-";
  return `${value.toLocaleString("en-US", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  })}%`;
}

function formatSpread(
  spread: number | null,
  percentage: number | null,
): string {
  if (spread === null) return "-";
  return `${formatStubs(spread)} (${formatPercent(percentage)})`;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
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
    }),
  );

  return results;
}

function sortOrderFor(sort: ApiSortKey): "asc" | "desc" {
  if (sort === "best_sell_price") return "asc";
  return "desc";
}

import { memo, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Chip,
  Paper,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Typography,
} from "@mui/material";

import {
  ALL_ORDER_LOOKBACK_DAYS,
  bucketOrdersByHour,
  calculateProfit,
  calculateProfitPercentage,
  calculateSpread,
  formatStubs,
  getListingDetailSummary,
  getListingEyebrow,
  getListingPrices,
  isUsingQuickSellFallback,
  normalizeOrders,
  normalizePriceHistory,
  RECENT_ORDER_LOOKBACK_DAYS,
  type LoadState,
  type OrderBucket,
  type OrderPoint,
  type PricePoint,
} from "../../marketUtils";
import {
  fetchListingByUuid,
  fetchStoredCompletedOrders,
  type CompletedOrder,
  type Listing,
} from "../../showApi";
import {
  CompletedOrderTimelineChart,
  OrderChart,
  PriceChart,
} from "./Charts";
import {
  ChartCard,
  MetricCard,
  ProfitMetric,
  QuickSellBadge,
  SectionHeading,
} from "./Common";

interface MarketDetailProps {
  selectedCatalogListing: Listing | null;
  selectedUuid: string | null;
}

export const MarketDetail = memo(function MarketDetail({
  selectedCatalogListing,
  selectedUuid,
}: MarketDetailProps) {
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [storedCompletedOrders, setStoredCompletedOrders] = useState<
    CompletedOrder[] | null
  >(null);
  const [storedAllCompletedOrders, setStoredAllCompletedOrders] = useState<
    CompletedOrder[] | null
  >(null);
  const [detailState, setDetailState] = useState<LoadState>("idle");
  const [detailError, setDetailError] = useState("");
  const [recentOrdersState, setRecentOrdersState] = useState<LoadState>("idle");
  const [recentOrdersError, setRecentOrdersError] = useState("");
  const [allOrdersState, setAllOrdersState] = useState<LoadState>("idle");
  const [allOrdersError, setAllOrdersError] = useState("");
  const [completedOrderPage, setCompletedOrderPage] = useState(0);
  const [completedOrderRowsPerPage, setCompletedOrderRowsPerPage] =
    useState(25);

  useEffect(() => {
    setCompletedOrderPage(0);
  }, [selectedUuid]);

  useEffect(() => {
    if (!selectedUuid) {
      setSelectedListing(null);
      setStoredCompletedOrders(null);
      setStoredAllCompletedOrders(null);
      setDetailState("idle");
      setDetailError("");
      setRecentOrdersState("idle");
      setRecentOrdersError("");
      setAllOrdersState("idle");
      setAllOrdersError("");
      return;
    }

    let active = true;
    const uuid = selectedUuid;
    let allOrdersTimeoutId: number | null = null;

    setSelectedListing(null);
    setStoredCompletedOrders(null);
    setStoredAllCompletedOrders(null);
    setDetailState("loading");
    setDetailError("");
    setRecentOrdersState("idle");
    setRecentOrdersError("");
    setAllOrdersState("idle");
    setAllOrdersError("");

    async function loadRecentOrders() {
      setRecentOrdersState("loading");
      setRecentOrdersError("");

      try {
        const recentOrders = await fetchStoredCompletedOrders({
          days: RECENT_ORDER_LOOKBACK_DAYS,
          uuid,
        });
        if (!active) return;

        setStoredCompletedOrders(recentOrders.length > 0 ? recentOrders : null);
        setRecentOrdersState("ready");
      } catch (error) {
        if (!active) return;

        setStoredCompletedOrders(null);
        setRecentOrdersState("error");
        setRecentOrdersError(
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    async function loadAllOrders() {
      setAllOrdersState("loading");
      setAllOrdersError("");

      try {
        const allOrders = await fetchStoredCompletedOrders({
          days: ALL_ORDER_LOOKBACK_DAYS,
          uuid,
        });
        if (!active) return;

        setStoredAllCompletedOrders(allOrders.length > 0 ? allOrders : null);
        setAllOrdersState("ready");
      } catch (error) {
        if (!active) return;

        setStoredAllCompletedOrders(null);
        setAllOrdersState("error");
        setAllOrdersError(error instanceof Error ? error.message : String(error));
      }
    }

    async function loadDetail() {
      try {
        const listing = await fetchListingByUuid(uuid);
        if (!active) return;

        setSelectedListing(listing);
        setDetailState("ready");
        void loadRecentOrders();
        allOrdersTimeoutId = window.setTimeout(() => {
          if (!active) return;
          void loadAllOrders();
        }, 0);
      } catch (error) {
        if (!active) return;

        setDetailState("error");
        setDetailError(error instanceof Error ? error.message : String(error));
      }
    }

    void loadDetail();

    return () => {
      active = false;
      if (allOrdersTimeoutId !== null) {
        window.clearTimeout(allOrdersTimeoutId);
      }
    };
  }, [selectedUuid]);

  const detailListing = selectedListing ?? selectedCatalogListing;
  const priceHistory = useMemo(
    () => normalizePriceHistory(selectedListing?.price_history ?? []),
    [selectedListing],
  );
  const liveCompletedOrders = useMemo(
    () => normalizeOrders(selectedListing?.completed_orders ?? []),
    [selectedListing],
  );
  const storedRecentOrderPoints = useMemo(
    () => normalizeOrders(storedCompletedOrders ?? []),
    [storedCompletedOrders],
  );
  const storedAllOrderPoints = useMemo(
    () => normalizeOrders(storedAllCompletedOrders ?? []),
    [storedAllCompletedOrders],
  );
  const completedOrders = useMemo(
    () =>
      storedRecentOrderPoints.length > 0
        ? storedRecentOrderPoints
        : liveCompletedOrders,
    [liveCompletedOrders, storedRecentOrderPoints],
  );
  const allCompletedOrders = useMemo(
    () =>
      storedAllOrderPoints.length > 0
        ? storedAllOrderPoints
        : allOrdersState === "loading"
          ? []
          : liveCompletedOrders,
    [allOrdersState, liveCompletedOrders, storedAllOrderPoints],
  );
  const orderBuckets = useMemo(
    () => bucketOrdersByHour(completedOrders),
    [completedOrders],
  );
  const allCompletedOrdersDescending = useMemo(
    () => allCompletedOrders.slice().reverse(),
    [allCompletedOrders],
  );
  const maxCompletedOrderPage = Math.max(
    Math.ceil(allCompletedOrdersDescending.length / completedOrderRowsPerPage) -
      1,
    0,
  );
  const safeCompletedOrderPage = Math.min(
    completedOrderPage,
    maxCompletedOrderPage,
  );
  const paginatedAllCompletedOrders = useMemo(
    () =>
      allCompletedOrdersDescending.slice(
        safeCompletedOrderPage * completedOrderRowsPerPage,
        (safeCompletedOrderPage + 1) * completedOrderRowsPerPage,
      ),
    [
      allCompletedOrdersDescending,
      completedOrderRowsPerPage,
      safeCompletedOrderPage,
    ],
  );
  const selectedName =
    detailListing?.listing_name ?? detailListing?.item?.name ?? "Select an item";
  const selectedPrices = useMemo(
    () =>
      detailListing
        ? getListingPrices(detailListing)
        : { buyNow: null, sellNow: null },
    [detailListing],
  );
  const bestBuy = selectedPrices.sellNow;
  const bestSell = selectedPrices.buyNow;
  const usesQuickSellFallback = useMemo(
    () => detailListing !== null && isUsingQuickSellFallback(detailListing),
    [detailListing],
  );
  const earliestDaily = priceHistory[0]?.label ?? "Not returned";
  const earliestOrder = completedOrders[0]?.label ?? "Not returned";
  const earliestAllOrder = allCompletedOrders[0]?.label ?? "Not returned";
  const latestAllOrder =
    allCompletedOrders[allCompletedOrders.length - 1]?.label ?? "Not returned";
  const currentSpread = calculateSpread(selectedPrices);
  const currentProfit = calculateProfit(selectedPrices);
  const currentProfitPercentage = calculateProfitPercentage(selectedPrices);
  const completedOrdersSource = storedRecentOrderPoints.length > 0
    ? "Local database"
    : "Live API sample";
  const allCompletedOrdersSource = storedAllOrderPoints.length > 0
    ? "Local database"
    : "Live API sample";
  const cardImage =
    detailListing?.item?.baked_img_lg ??
    detailListing?.item?.baked_img ??
    detailListing?.item?.img;

  return (
    <MarketDetailView
      allCompletedOrders={allCompletedOrders}
      allCompletedOrdersDescending={allCompletedOrdersDescending}
      allCompletedOrdersSource={allCompletedOrdersSource}
      allOrdersError={allOrdersError}
      allOrdersState={allOrdersState}
      bestBuy={bestBuy}
      bestSell={bestSell}
      cardImage={cardImage}
      completedOrderRowsPerPage={completedOrderRowsPerPage}
      completedOrders={completedOrders}
      completedOrdersSource={completedOrdersSource}
      currentProfit={currentProfit}
      currentProfitPercentage={currentProfitPercentage}
      currentSpread={currentSpread}
      detailError={detailError}
      detailState={detailState}
      earliestAllOrder={earliestAllOrder}
      earliestDaily={earliestDaily}
      earliestOrder={earliestOrder}
      latestAllOrder={latestAllOrder}
      orderBuckets={orderBuckets}
      paginatedAllCompletedOrders={paginatedAllCompletedOrders}
      priceHistory={priceHistory}
      recentOrdersError={recentOrdersError}
      recentOrdersState={recentOrdersState}
      safeCompletedOrderPage={safeCompletedOrderPage}
      selectedListing={detailListing}
      selectedName={selectedName}
      setCompletedOrderPage={setCompletedOrderPage}
      setCompletedOrderRowsPerPage={setCompletedOrderRowsPerPage}
      usesQuickSellFallback={usesQuickSellFallback}
    />
  );
});

interface MarketDetailViewProps {
  allCompletedOrders: OrderPoint[];
  allCompletedOrdersDescending: OrderPoint[];
  allOrdersError: string;
  allOrdersState: LoadState;
  allCompletedOrdersSource: string;
  bestBuy: number | null;
  bestSell: number | null;
  cardImage?: string | null;
  completedOrderRowsPerPage: number;
  completedOrders: OrderPoint[];
  completedOrdersSource: string;
  currentProfit: number | null;
  currentProfitPercentage: number | null;
  currentSpread: number | null;
  detailError: string;
  detailState: LoadState;
  earliestAllOrder: string;
  earliestDaily: string;
  earliestOrder: string;
  latestAllOrder: string;
  orderBuckets: OrderBucket[];
  paginatedAllCompletedOrders: OrderPoint[];
  priceHistory: PricePoint[];
  recentOrdersError: string;
  recentOrdersState: LoadState;
  safeCompletedOrderPage: number;
  selectedListing: Listing | null;
  selectedName: string;
  setCompletedOrderPage: (value: number) => void;
  setCompletedOrderRowsPerPage: (value: number) => void;
  usesQuickSellFallback: boolean;
}

const MarketDetailView = memo(function MarketDetailView({
  allCompletedOrders,
  allCompletedOrdersDescending,
  allOrdersError,
  allOrdersState,
  allCompletedOrdersSource,
  bestBuy,
  bestSell,
  cardImage,
  completedOrderRowsPerPage,
  completedOrders,
  completedOrdersSource,
  currentProfit,
  currentProfitPercentage,
  currentSpread,
  detailError,
  detailState,
  earliestAllOrder,
  earliestDaily,
  earliestOrder,
  latestAllOrder,
  orderBuckets,
  paginatedAllCompletedOrders,
  priceHistory,
  recentOrdersError,
  recentOrdersState,
  safeCompletedOrderPage,
  selectedListing,
  selectedName,
  setCompletedOrderPage,
  setCompletedOrderRowsPerPage,
  usesQuickSellFallback,
}: MarketDetailViewProps) {
  const recentOrdersMeta =
    recentOrdersState === "loading" && completedOrdersSource !== "Local database"
      ? `${completedOrders.length} orders - refreshing local history`
      : `${completedOrders.length} orders - ${completedOrdersSource}`;
  const allOrdersMeta =
    allOrdersState === "loading"
      ? "Loading long-term order history..."
      : `${allCompletedOrders.length} orders - ${allCompletedOrdersSource}: ${earliestAllOrder} to ${latestAllOrder}`;
  const showAllOrdersFallbackNotice =
    allOrdersState === "error" && allCompletedOrdersSource === "Live API sample";
  const showRecentOrdersFallbackNotice =
    recentOrdersState === "error" && completedOrdersSource === "Live API sample";

  return (
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
              {getListingEyebrow(selectedListing)}
            </Typography>
            <Typography component="h2" variant="h4" fontWeight={800}>
              {selectedName}
            </Typography>
            <Typography color="text.secondary">
              {getListingDetailSummary(selectedListing)}
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
          <MetricCard label="Buy now" value={formatStubs(bestSell)} />
          <MetricCard
            badge={usesQuickSellFallback ? <QuickSellBadge /> : null}
            label="Sell now"
            value={formatStubs(bestBuy)}
          />
          <ProfitMetric
            profit={currentProfit}
            profitPercentage={currentProfitPercentage}
          />
          <MetricCard label="Spread" value={formatStubs(currentSpread)} />
          <MetricCard label="Daily history starts" value={earliestDaily} />
          <MetricCard label="Granular orders start" value={earliestOrder} />
        </Box>

        {usesQuickSellFallback ? (
          <Alert severity="info" sx={{ py: 0.5 }}>
            Sell now is using the default quick-sell floor because the market
            buy side is currently 0.
          </Alert>
        ) : null}

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

          <ChartCard title="Completed orders by hour" meta={recentOrdersMeta}>
            {showRecentOrdersFallbackNotice ? (
              <Alert severity="warning" sx={{ mb: 1.5 }}>
                Local recent order history could not be loaded. Showing the live
                API sample instead.
              </Alert>
            ) : null}
            {recentOrdersError &&
            !showRecentOrdersFallbackNotice &&
            completedOrdersSource === "Local database" ? (
              <Alert severity="warning" sx={{ mb: 1.5 }}>
                {recentOrdersError}
              </Alert>
            ) : null}
            <OrderChart buckets={orderBuckets} />
          </ChartCard>
        </Box>

        <AllCompletedOrdersTableSection
          allCompletedOrdersDescending={allCompletedOrdersDescending}
          allOrdersMeta={allOrdersMeta}
          allOrdersState={allOrdersState}
          errorMessage={
            showAllOrdersFallbackNotice
              ? "Local long-term history could not be loaded. Showing the live API sample instead."
              : allOrdersError
          }
          completedOrderRowsPerPage={completedOrderRowsPerPage}
          paginatedAllCompletedOrders={paginatedAllCompletedOrders}
          safeCompletedOrderPage={safeCompletedOrderPage}
          setCompletedOrderPage={setCompletedOrderPage}
          setCompletedOrderRowsPerPage={setCompletedOrderRowsPerPage}
        />

        <AllCompletedOrdersChartSection
          allOrdersMeta={allOrdersMeta}
          allOrdersState={allOrdersState}
          errorMessage={
            showAllOrdersFallbackNotice
              ? "Local long-term history could not be loaded. Showing the live API sample instead."
              : allOrdersError
          }
          orders={allCompletedOrders}
        />
      </Stack>
    </Paper>
  );
});

const AllCompletedOrdersTableSection = memo(
  function AllCompletedOrdersTableSection({
    allCompletedOrdersDescending,
    allOrdersMeta,
    allOrdersState,
    completedOrderRowsPerPage,
    errorMessage,
    paginatedAllCompletedOrders,
    safeCompletedOrderPage,
    setCompletedOrderPage,
    setCompletedOrderRowsPerPage,
  }: {
    allCompletedOrdersDescending: OrderPoint[];
    allOrdersMeta: string;
    allOrdersState: LoadState;
    completedOrderRowsPerPage: number;
    errorMessage: string;
    paginatedAllCompletedOrders: OrderPoint[];
    safeCompletedOrderPage: number;
    setCompletedOrderPage: (value: number) => void;
    setCompletedOrderRowsPerPage: (value: number) => void;
  }) {
    return (
      <Paper variant="outlined" sx={{ p: 1.75 }}>
        <SectionHeading title="All completed orders" meta={allOrdersMeta} />
        {allOrdersState === "loading" ? (
          <OrderHistoryLoadingState
            message="Loading long-term completed order history..."
            variant="table"
          />
        ) : (
          <>
            {errorMessage ? (
              <Alert severity="warning" sx={{ mb: 1.5 }}>
                {errorMessage}
              </Alert>
            ) : null}
            <TableContainer sx={{ maxHeight: 360 }}>
              <Table stickyHeader size="small" aria-label="All completed orders">
                <TableHead>
                  <TableRow>
                    <TableCell>Time</TableCell>
                    <TableCell align="right">Price</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {paginatedAllCompletedOrders.map((order, index) => (
                    <TableRow
                      key={`${order.label}-${order.price}-${safeCompletedOrderPage}-${index}`}
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
            <TablePagination
              component="div"
              count={allCompletedOrdersDescending.length}
              onPageChange={(_event, page) => setCompletedOrderPage(page)}
              onRowsPerPageChange={(event) => {
                setCompletedOrderRowsPerPage(Number(event.target.value));
                setCompletedOrderPage(0);
              }}
              page={safeCompletedOrderPage}
              rowsPerPage={completedOrderRowsPerPage}
              rowsPerPageOptions={[25, 50, 100, 250]}
            />
          </>
        )}
      </Paper>
    );
  },
);

const AllCompletedOrdersChartSection = memo(
  function AllCompletedOrdersChartSection({
    allOrdersMeta,
    allOrdersState,
    errorMessage,
    orders,
  }: {
    allOrdersMeta: string;
    allOrdersState: LoadState;
    errorMessage: string;
    orders: OrderPoint[];
  }) {
    return (
      <ChartCard title="Every completed order" meta={allOrdersMeta}>
        {allOrdersState === "loading" ? (
          <OrderHistoryLoadingState
            message="Preparing the full completed order timeline..."
            variant="chart"
          />
        ) : (
          <>
            {errorMessage ? (
              <Alert severity="warning" sx={{ mb: 1.5 }}>
                {errorMessage}
              </Alert>
            ) : null}
            <CompletedOrderTimelineChart orders={orders} />
          </>
        )}
      </ChartCard>
    );
  },
);

const OrderHistoryLoadingState = memo(function OrderHistoryLoadingState({
  message,
  variant,
}: {
  message: string;
  variant: "chart" | "table";
}) {
  return (
    <Stack spacing={1.25}>
      <Typography color="text.secondary" variant="body2">
        {message}
      </Typography>
      {variant === "table" ? (
        <>
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton
              key={index}
              animation="wave"
              height={28}
              sx={{ transform: "none" }}
              variant="rounded"
            />
          ))}
        </>
      ) : (
        <>
          <Skeleton
            animation="wave"
            height={44}
            sx={{ transform: "none" }}
            variant="rounded"
          />
          <Skeleton
            animation="wave"
            height={260}
            sx={{ transform: "none" }}
            variant="rounded"
          />
        </>
      )}
    </Stack>
  );
});

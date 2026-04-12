import { memo } from "react";
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
  formatStubs,
  getListingDetailSummary,
  getListingEyebrow,
  type LoadState,
  type OrderBucket,
  type OrderPoint,
  type PricePoint,
} from "../../marketUtils";
import type { Listing } from "../../showApi";
import { CompletedOrderTimelineChart, OrderChart, PriceChart } from "./Charts";
import { ChartCard, MetricCard, ProfitMetric, QuickSellBadge, SectionHeading } from "./Common";

interface MarketDetailProps {
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

export const MarketDetail = memo(function MarketDetail({
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
}: MarketDetailProps) {
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

          <ChartCard
            title="Completed orders by hour"
            meta={recentOrdersMeta}
          >
            {showRecentOrdersFallbackNotice ? (
              <Alert severity="warning" sx={{ mb: 1.5 }}>
                Local recent order history could not be loaded. Showing the live
                API sample instead.
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

const AllCompletedOrdersTableSection = memo(function AllCompletedOrdersTableSection({
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
});

const AllCompletedOrdersChartSection = memo(function AllCompletedOrdersChartSection({
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
});

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

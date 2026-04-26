import {
  Alert,
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import {
  formatStubs,
  getListingDetailSummary,
  getListingEyebrow,
  LoadState,
  OrderBucket,
  OrderPoint,
  PricePoint,
} from '../../../marketUtils';
import { Listing } from '../../../showApi';
import {
  ChartCard,
  MetricCard,
  ProfitMetric,
  QuickSellBadge,
  StarButton,
} from '../common';
import { OrderChart, PriceChart } from '../Charts';
import { AllCompletedOrdersTableSection } from './AllCompletedOrdersTableSection';
import { AllCompletedOrdersChartSection } from './AllCompletedOrdersSection';

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
  currentProfitPerHourLabel: string;
  detailError: string;
  detailState: LoadState;
  allTimeAverage: number | null;
  buyNowVsAllTimeAverageDiff: number | null;
  sevenDayTrend: number | null;
  earliestAllOrder: string;
  latestAllOrder: string;
  orderBuckets: OrderBucket[];
  paginatedAllCompletedOrders: OrderPoint[];
  priceHistory: PricePoint[];
  recentOrdersError: string;
  recentOrdersState: LoadState;
  safeCompletedOrderPage: number;
  selectedIsStarred: boolean;
  selectedListing: Listing | null;
  selectedName: string;
  setCompletedOrderPage: (value: number) => void;
  setCompletedOrderRowsPerPage: (value: number) => void;
  usesQuickSellFallback: boolean;
  onToggleSelectedStarred: () => void;
  onRefresh: () => void;
  refreshDisabled: boolean;
}

export function MarketDetailView({
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
  currentProfitPerHourLabel,
  detailError,
  detailState,
  allTimeAverage,
  buyNowVsAllTimeAverageDiff,
  sevenDayTrend,
  earliestAllOrder,
  latestAllOrder,
  orderBuckets,
  paginatedAllCompletedOrders,
  priceHistory,
  recentOrdersError,
  recentOrdersState,
  safeCompletedOrderPage,
  selectedIsStarred,
  selectedListing,
  selectedName,
  setCompletedOrderPage,
  setCompletedOrderRowsPerPage,
  usesQuickSellFallback,
  onToggleSelectedStarred,
  onRefresh,
  refreshDisabled,
}: MarketDetailViewProps) {
  const recentOrdersMeta =
    recentOrdersState === 'loading' &&
    completedOrdersSource !== 'Local database'
      ? `${completedOrders.length} orders - refreshing local history`
      : `${completedOrders.length} orders - ${completedOrdersSource}`;
  const allOrdersMeta =
    allOrdersState === 'loading'
      ? 'Loading long-term order history...'
      : `${allCompletedOrders.length} orders - ${allCompletedOrdersSource}: ${earliestAllOrder} to ${latestAllOrder}`;
  const showAllOrdersFallbackNotice =
    allOrdersState === 'error' &&
    allCompletedOrdersSource === 'Live API sample';
  const showRecentOrdersFallbackNotice =
    recentOrdersState === 'error' &&
    completedOrdersSource === 'Live API sample';
  const allTimeAverageDiffLabel =
    buyNowVsAllTimeAverageDiff === null
      ? null
      : `current ${buyNowVsAllTimeAverageDiff > 0 ? '+' : ''}${formatStubs(
          buyNowVsAllTimeAverageDiff
        )}`;
  const allTimeAverageDiffColor =
    buyNowVsAllTimeAverageDiff === null
      ? 'text.secondary'
      : buyNowVsAllTimeAverageDiff > 0
        ? 'success.main'
        : buyNowVsAllTimeAverageDiff < 0
          ? 'error.main'
          : 'text.secondary';

  return (
    <Paper
      component="section"
      aria-label="Market analysis"
      variant="outlined"
      sx={{ minWidth: 0, p: { xs: 2, md: 2.25 } }}
    >
      <Stack spacing={2.25}>
        {detailState === 'error' ? (
          <Alert severity="error">{detailError}</Alert>
        ) : null}

        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          sx={{ alignItems: { xs: 'flex-start', sm: 'center' } }}
        >
          {cardImage ? (
            <Box
              component="img"
              alt=""
              src={cardImage}
              sx={{
                width: { xs: 72, sm: 96 },
                height: { xs: 72, sm: 96 },
                flex: '0 0 auto',
                objectFit: 'contain',
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

          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <StarButton
              disabled={!selectedListing?.item?.uuid}
              isStarred={selectedIsStarred}
              itemName={selectedName}
              onToggle={onToggleSelectedStarred}
              size="medium"
            />
            <Chip
              color={detailState === 'loading' ? 'default' : 'primary'}
              label={detailState === 'loading' ? 'Refreshing...' : 'Live API'}
              variant="outlined"
            />
            <Button
              disabled={refreshDisabled}
              onClick={onRefresh}
              size="small"
              variant="outlined"
              sx={{
                textTransform: 'none',
              }}
            >
              Refresh
            </Button>
          </Stack>
        </Stack>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(2, minmax(0, 1fr))',
              xl: 'repeat(6, minmax(0, 1fr))',
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
          <MetricCard label="Profit/hr" value={currentProfitPerHourLabel} />
          <MetricCard
            badge={
              allTimeAverageDiffLabel ? (
                <Typography
                  color={allTimeAverageDiffColor}
                  fontWeight={800}
                  variant="caption"
                >
                  {allTimeAverageDiffLabel}
                </Typography>
              ) : null
            }
            label="All time average"
            value={formatStubs(allTimeAverage)}
          />
          <MetricCard
            label="7-day trend"
            value={`${sevenDayTrend && sevenDayTrend > 0 ? '+' : ''}${formatStubs(
              sevenDayTrend
            )}`}
          />
        </Box>

        {usesQuickSellFallback ? (
          <Alert severity="info" sx={{ py: 0.5 }}>
            Sell now is using the default quick-sell floor because the market
            buy side is currently 0.
          </Alert>
        ) : null}

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', xl: '1fr 1fr' },
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
            completedOrdersSource === 'Local database' ? (
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
              ? 'Local long-term history could not be loaded. Showing the live API sample instead.'
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
              ? 'Local long-term history could not be loaded. Showing the live API sample instead.'
              : allOrdersError
          }
          orders={allCompletedOrders}
        />
      </Stack>
    </Paper>
  );
}

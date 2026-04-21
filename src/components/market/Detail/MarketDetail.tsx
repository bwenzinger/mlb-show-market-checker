import { memo, useEffect, useMemo, useState } from 'react';
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
} from '@mui/material';

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
} from '../../../marketUtils';
import {
  fetchListingByUuid,
  fetchStoredOrderAverage,
  fetchStoredCompletedOrders,
  type CompletedOrder,
  type Listing,
  type StoredOrderAverage,
} from '../../../showApi';
import { CompletedOrderTimelineChart, OrderChart, PriceChart } from '../Charts';
import {
  ChartCard,
  MetricCard,
  ProfitMetric,
  QuickSellBadge,
  SectionHeading,
} from '../common';
import { AllCompletedOrdersChartSection } from './AllCompletedOrdersSection';
import { AllCompletedOrdersTableSection } from './AllCompletedOrdersTableSection';
import { MarketDetailView } from './MarketDetailView';
import { useQueryParams } from '../common/useQueryParams';
import { FilterUrlParams } from '../../../types';

export function MarketDetail() {
  const { params, setQueryParams } = useQueryParams<FilterUrlParams>();
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [storedCompletedOrders, setStoredCompletedOrders] = useState<
    CompletedOrder[] | null
  >(null);
  const [storedAllCompletedOrders, setStoredAllCompletedOrders] = useState<
    CompletedOrder[] | null
  >(null);
  const [storedOrderAverage, setStoredOrderAverage] =
    useState<StoredOrderAverage | null>(null);
  const [detailState, setDetailState] = useState<LoadState>('idle');
  const [detailError, setDetailError] = useState('');
  const [recentOrdersState, setRecentOrdersState] = useState<LoadState>('idle');
  const [recentOrdersError, setRecentOrdersError] = useState('');
  const [allOrdersState, setAllOrdersState] = useState<LoadState>('idle');
  const [allOrdersError, setAllOrdersError] = useState('');
  const [completedOrderPage, setCompletedOrderPage] = useState(0);
  const [completedOrderRowsPerPage, setCompletedOrderRowsPerPage] =
    useState(25);

  useEffect(() => {
    setCompletedOrderPage(0);
  }, [params?.uuid, refreshKey]);

  useEffect(() => {
    if (!params?.uuid) {
      setSelectedListing(null);
      setStoredCompletedOrders(null);
      setStoredAllCompletedOrders(null);
      setStoredOrderAverage(null);
      setDetailState('idle');
      setDetailError('');
      setRecentOrdersState('idle');
      setRecentOrdersError('');
      setAllOrdersState('idle');
      setAllOrdersError('');
      return;
    }

    let active = true;
    let allOrdersTimeoutId: number | null = null;

    setSelectedListing(null);
    setStoredCompletedOrders(null);
    setStoredAllCompletedOrders(null);
    setStoredOrderAverage(null);
    setDetailState('loading');
    setDetailError('');
    setRecentOrdersState('idle');
    setRecentOrdersError('');
    setAllOrdersState('idle');
    setAllOrdersError('');

    async function loadRecentOrders() {
      setRecentOrdersState('loading');
      setRecentOrdersError('');

      if (!params?.uuid) {
        return;
      }

      try {
        const recentOrders = await fetchStoredCompletedOrders({
          days: RECENT_ORDER_LOOKBACK_DAYS,
          uuid: params.uuid,
        });
        if (!active) return;

        setStoredCompletedOrders(recentOrders.length > 0 ? recentOrders : null);
        setRecentOrdersState('ready');
      } catch (error) {
        if (!active) return;

        setStoredCompletedOrders(null);
        setRecentOrdersState('error');
        setRecentOrdersError(
          error instanceof Error ? error.message : String(error)
        );
      }
    }

    async function loadAllOrders() {
      setAllOrdersState('loading');
      setAllOrdersError('');

      if (!params?.uuid) {
        return;
      }

      try {
        const allOrders = await fetchStoredCompletedOrders({
          days: ALL_ORDER_LOOKBACK_DAYS,
          uuid: params?.uuid,
        });
        if (!active) return;

        setStoredAllCompletedOrders(allOrders.length > 0 ? allOrders : null);
        setAllOrdersState('ready');
      } catch (error) {
        if (!active) return;

        setStoredAllCompletedOrders(null);
        setAllOrdersState('error');
        setAllOrdersError(
          error instanceof Error ? error.message : String(error)
        );
      }
    }

    async function loadAverage() {
      if (!params?.uuid) {
        return;
      }

      try {
        const average = await fetchStoredOrderAverage({
          uuid: params.uuid,
        });
        if (!active) return;

        setStoredOrderAverage(average);
      } catch {
        if (!active) return;

        setStoredOrderAverage(null);
      }
    }

    async function loadDetail() {
      if (!params?.uuid) return;
      try {
        const listing = await fetchListingByUuid(params?.uuid);
        if (!active) return;

        setSelectedListing(listing);
        setDetailState('ready');
        void loadAverage();
        void loadRecentOrders();
        allOrdersTimeoutId = window.setTimeout(() => {
          if (!active) return;
          void loadAllOrders();
        }, 0);
      } catch (error) {
        if (!active) return;

        setDetailState('error');
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
  }, [params?.uuid, refreshKey]);

  const detailListing = selectedListing;
  const priceHistory = useMemo(
    () => normalizePriceHistory(selectedListing?.price_history ?? []),
    [selectedListing]
  );
  const liveCompletedOrders = useMemo(
    () => normalizeOrders(selectedListing?.completed_orders ?? []),
    [selectedListing]
  );
  const storedRecentOrderPoints = useMemo(
    () => normalizeOrders(storedCompletedOrders ?? []),
    [storedCompletedOrders]
  );
  const storedAllOrderPoints = useMemo(
    () => normalizeOrders(storedAllCompletedOrders ?? []),
    [storedAllCompletedOrders]
  );
  const completedOrders = useMemo(
    () =>
      storedRecentOrderPoints.length > 0
        ? storedRecentOrderPoints
        : liveCompletedOrders,
    [liveCompletedOrders, storedRecentOrderPoints]
  );
  const allCompletedOrders = useMemo(
    () =>
      storedAllOrderPoints.length > 0
        ? storedAllOrderPoints
        : allOrdersState === 'loading'
          ? []
          : liveCompletedOrders,
    [allOrdersState, liveCompletedOrders, storedAllOrderPoints]
  );
  const orderBuckets = useMemo(
    () => bucketOrdersByHour(completedOrders),
    [completedOrders]
  );
  const allCompletedOrdersDescending = useMemo(
    () => allCompletedOrders.slice().reverse(),
    [allCompletedOrders]
  );
  const maxCompletedOrderPage = Math.max(
    Math.ceil(allCompletedOrdersDescending.length / completedOrderRowsPerPage) -
      1,
    0
  );
  const safeCompletedOrderPage = Math.min(
    completedOrderPage,
    maxCompletedOrderPage
  );
  const paginatedAllCompletedOrders = useMemo(
    () =>
      allCompletedOrdersDescending.slice(
        safeCompletedOrderPage * completedOrderRowsPerPage,
        (safeCompletedOrderPage + 1) * completedOrderRowsPerPage
      ),
    [
      allCompletedOrdersDescending,
      completedOrderRowsPerPage,
      safeCompletedOrderPage,
    ]
  );
  const selectedName =
    detailListing?.listing_name ??
    detailListing?.item?.name ??
    'Select an item';
  const selectedPrices = useMemo(
    () =>
      detailListing
        ? getListingPrices(detailListing)
        : { buyNow: null, sellNow: null },
    [detailListing]
  );
  const bestBuy = selectedPrices.sellNow;
  const bestSell = selectedPrices.buyNow;
  const usesQuickSellFallback = useMemo(
    () => detailListing !== null && isUsingQuickSellFallback(detailListing),
    [detailListing]
  );
  const sevenDayTrend = useMemo(() => {
    if (priceHistory.length < 2) return null;

    const latestPoint = priceHistory[priceHistory.length - 1];
    const windowStart = latestPoint.date.getTime() - 7 * 24 * 60 * 60 * 1000;
    const buyNowPoints = priceHistory.filter(
      (point) => point.date.getTime() >= windowStart && point.sell !== null
    );

    if (buyNowPoints.length < 2) return null;

    const firstValue = buyNowPoints[0]?.sell;
    const lastValue = buyNowPoints[buyNowPoints.length - 1]?.sell;

    if (firstValue === null || lastValue === null) return null;

    return lastValue - firstValue;
  }, [priceHistory]);
  const allTimeAverage = storedOrderAverage?.averagePrice ?? null;
  const buyNowVsAllTimeAverageDiff = useMemo(() => {
    if (allTimeAverage === null || bestSell === null) return null;

    return bestSell - allTimeAverage;
  }, [allTimeAverage, bestSell]);
  const earliestAllOrder = allCompletedOrders[0]?.label ?? 'Not returned';
  const latestAllOrder =
    allCompletedOrders[allCompletedOrders.length - 1]?.label ?? 'Not returned';
  const currentSpread = calculateSpread(selectedPrices);
  const currentProfit = calculateProfit(selectedPrices);
  const currentProfitPercentage = calculateProfitPercentage(selectedPrices);
  const completedOrdersSource =
    storedRecentOrderPoints.length > 0 ? 'Local database' : 'Live API sample';
  const allCompletedOrdersSource =
    storedAllOrderPoints.length > 0 ? 'Local database' : 'Live API sample';
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
      allTimeAverage={allTimeAverage}
      buyNowVsAllTimeAverageDiff={buyNowVsAllTimeAverageDiff}
      sevenDayTrend={sevenDayTrend}
      earliestAllOrder={earliestAllOrder}
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
      onRefresh={() => {
        if (!params?.uuid || detailState === 'loading') return;

        setRefreshKey((current) => current + 1);
      }}
      refreshDisabled={!params?.uuid || detailState === 'loading'}
    />
  );
}

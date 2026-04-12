import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Container, Stack, Typography } from "@mui/material";

import { MarketDetail } from "./components/market/MarketDetail";
import { SearchPanel } from "./components/market/SearchPanel";
import {
  ALL_ORDER_LOOKBACK_DAYS,
  bucketOrdersByHour,
  calculateProfit,
  calculateProfitPercentage,
  calculateSpread,
  fetchSortedListings,
  getListingPrices,
  isUsingQuickSellFallback,
  normalizeOrders,
  normalizePriceHistory,
  readFiltersFromUrl,
  RECENT_ORDER_LOOKBACK_DAYS,
  type LoadState,
  writeFiltersToUrl,
} from "./marketUtils";
import {
  fetchListingByUuid,
  fetchStoredCompletedOrders,
  type CompletedOrder,
  type Listing,
  type SortKey,
} from "./showApi";

export default function App() {
  const initialFilters = useMemo(readFiltersFromUrl, []);
  const [query, setQuery] = useState(initialFilters.searchText);
  const [itemType, setItemType] = useState(initialFilters.itemType);
  const [rarity, setRarity] = useState(initialFilters.rarity);
  const [sort, setSort] = useState<SortKey>(initialFilters.sort);
  const [minSpreadForPercent, setMinSpreadForPercent] = useState(
    initialFilters.minSpreadForPercent,
  );
  const [listings, setListings] = useState<Listing[]>([]);
  const [listingState, setListingState] = useState<LoadState>("idle");
  const [listingError, setListingError] = useState("");
  const [selectedUuid, setSelectedUuid] = useState<string | null>(
    initialFilters.selectedUuid,
  );
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [storedCompletedOrders, setStoredCompletedOrders] = useState<
    CompletedOrder[] | null
  >(null);
  const [storedAllCompletedOrders, setStoredAllCompletedOrders] = useState<
    CompletedOrder[] | null
  >(null);
  const [detailState, setDetailState] = useState<LoadState>("idle");
  const [detailError, setDetailError] = useState("");
  const [ordersRefreshKey, setOrdersRefreshKey] = useState(0);
  const [completedOrderPage, setCompletedOrderPage] = useState(0);
  const [completedOrderRowsPerPage, setCompletedOrderRowsPerPage] =
    useState(25);
  const selectedUuidRef = useRef(selectedUuid);

  useEffect(() => {
    selectedUuidRef.current = selectedUuid;
  }, [selectedUuid]);

  useEffect(() => {
    setCompletedOrderPage(0);
  }, [selectedUuid]);

  useEffect(() => {
    writeFiltersToUrl({
      itemType,
      minSpreadForPercent,
      rarity,
      searchText: query.trim(),
      selectedUuid,
      sort,
    });
  }, [itemType, minSpreadForPercent, query, rarity, selectedUuid, sort]);

  useEffect(() => {
    let active = true;

    async function loadListings() {
      setListingState((current) => (current === "ready" ? "ready" : "loading"));
      setListingError("");

      try {
        const nextListings = await fetchSortedListings({
          itemType,
          minSpreadForPercent,
          name: query.trim() || undefined,
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
  }, [itemType, minSpreadForPercent, query, rarity, sort]);

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
        setOrdersRefreshKey((value) => value + 1);
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
      setStoredAllCompletedOrders(null);
      return;
    }

    let active = true;
    const uuid = selectedUuid;
    setStoredCompletedOrders(null);
    setStoredAllCompletedOrders(null);

    async function loadStoredOrders() {
      try {
        const [recentOrders, allOrders] = await Promise.all([
          fetchStoredCompletedOrders({
            days: RECENT_ORDER_LOOKBACK_DAYS,
            uuid,
          }),
          fetchStoredCompletedOrders({
            days: ALL_ORDER_LOOKBACK_DAYS,
            uuid,
          }),
        ]);
        if (!active) return;
        setStoredCompletedOrders(recentOrders.length > 0 ? recentOrders : null);
        setStoredAllCompletedOrders(allOrders.length > 0 ? allOrders : null);
      } catch {
        if (!active) return;
        setStoredCompletedOrders(null);
        setStoredAllCompletedOrders(null);
      }
    }

    void loadStoredOrders();

    return () => {
      active = false;
    };
  }, [ordersRefreshKey, selectedUuid]);

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
  const allCompletedOrders = useMemo(
    () =>
      normalizeOrders(
        storedAllCompletedOrders?.length
          ? storedAllCompletedOrders
          : (selectedListing?.completed_orders ?? []),
      ),
    [selectedListing, storedAllCompletedOrders],
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
    selectedListing?.listing_name ??
    selectedListing?.item?.name ??
    listings.find((listing) => listing.item?.uuid === selectedUuid)
      ?.listing_name ??
    "Select an item";
  const selectedPrices = useMemo(
    () =>
      selectedListing
        ? getListingPrices(selectedListing)
        : { buyNow: null, sellNow: null },
    [selectedListing],
  );
  const bestBuy = selectedPrices.sellNow;
  const bestSell = selectedPrices.buyNow;
  const usesQuickSellFallback = useMemo(
    () =>
      selectedListing !== null && isUsingQuickSellFallback(selectedListing),
    [selectedListing],
  );
  const earliestDaily = priceHistory[0]?.label ?? "Not returned";
  const earliestOrder = completedOrders[0]?.label ?? "Not returned";
  const earliestAllOrder = allCompletedOrders[0]?.label ?? "Not returned";
  const latestAllOrder =
    allCompletedOrders[allCompletedOrders.length - 1]?.label ?? "Not returned";
  const currentSpread = calculateSpread(selectedPrices);
  const currentProfit = calculateProfit(selectedPrices);
  const currentProfitPercentage = calculateProfitPercentage(selectedPrices);
  const completedOrdersSource = storedCompletedOrders?.length
    ? "Local database"
    : "Live API sample";
  const allCompletedOrdersSource = storedAllCompletedOrders?.length
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
            Live market
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
          itemType={itemType}
          listings={listings}
          listingError={listingError}
          listingState={listingState}
          minSpreadForPercent={minSpreadForPercent}
          rarity={rarity}
          searchText={query}
          selectedUuid={selectedUuid}
          setItemType={setItemType}
          setMinSpreadForPercent={setMinSpreadForPercent}
          setRarity={setRarity}
          setSearchText={setQuery}
          setSelectedUuid={setSelectedUuid}
          setSort={setSort}
          sort={sort}
        />

        <MarketDetail
          allCompletedOrders={allCompletedOrders}
          allCompletedOrdersDescending={allCompletedOrdersDescending}
          allCompletedOrdersSource={allCompletedOrdersSource}
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
          safeCompletedOrderPage={safeCompletedOrderPage}
          selectedListing={selectedListing}
          selectedName={selectedName}
          setCompletedOrderPage={setCompletedOrderPage}
          setCompletedOrderRowsPerPage={setCompletedOrderRowsPerPage}
          usesQuickSellFallback={usesQuickSellFallback}
        />
      </Box>
    </Container>
  );
}

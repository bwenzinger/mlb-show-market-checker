import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Container, Stack, Typography } from '@mui/material';

import { MarketDetail } from './components/market/Detail/MarketDetail';
import { SearchPanel } from './components/market/SearchPanel';
import {
  type LoadState,
  fetchListingsByTypeAndRarity,
  getDefaultSortDirection,
  isSpreadSort,
  sortListingsBySpread,
  filterListingsForSpreadSort,
  sortListingsByStandardMetric,
  getListingPrices,
  normalizeSort,
} from './marketUtils';
import {
  fetchStoredOrderAverages,
  fetchStoredOrderLiquidities,
  type Listing,
  type StoredOrderAverage,
  type SortOrder,
} from './showApi';
import { useQueryParams } from './components/market/common/useQueryParams';
import { FilterUrlParams } from './types';

function parseNonNegativeQueryNumber(
  value: string | undefined
): number | undefined {
  if (!value) return undefined;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(parsed, 0) : undefined;
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

function normalizeSeries(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

function listingMatchesSeries(
  listing: Listing,
  series: string | undefined
): boolean {
  const normalizedSeries = normalizeSeries(series);
  if (!normalizedSeries) return true;

  return normalizeSeries(listing.item?.series) === normalizedSeries;
}

function listingsIncludeSeries(
  listings: Listing[],
  series: string | undefined
): boolean {
  const normalizedSeries = normalizeSeries(series);
  if (!normalizedSeries) return true;

  return listings.some(
    (listing) => normalizeSeries(listing.item?.series) === normalizedSeries
  );
}

function getSeriesOptions(listings: Listing[]): string[] {
  const seriesByKey = new Map<string, string>();

  for (const listing of listings) {
    const series = listing.item?.series?.trim();
    if (!series) continue;

    const key = series.toLowerCase();
    if (!seriesByKey.has(key)) {
      seriesByKey.set(key, series);
    }
  }

  return [...seriesByKey.values()].sort((a, b) => a.localeCompare(b));
}

export default function App() {
  const { params, setQueryParams } = useQueryParams<FilterUrlParams>();
  const activeSort = normalizeSort(params?.sort);
  const sortDirection: SortOrder =
    params?.sortDirection ?? getDefaultSortDirection(activeSort);
  // const initialFilters = useMemo(readFiltersFromUrl, []);
  // const [query, setQuery] = useState(initialFilters.searchText);
  // const [itemType, setItemType] = useState(initialFilters.itemType);
  // const [rarity, setRarity] = useState(initialFilters.rarity);
  // const [sort, setSort] = useState<SortKey>(initialFilters.sort);
  // const [minSpreadForPercent, setMinSpreadForPercent] = useState(
  //   params?.minSpreadForPercent
  // );
  const [allListings, setAllListings] = useState<Listing[]>([]);
  const [filteredListings, setFilteredListings] = useState<Listing[]>([]);
  const [listingState, setListingState] = useState<LoadState>('idle');
  const [listingError, setListingError] = useState('');
  const seriesOptions = useMemo(
    () => getSeriesOptions(allListings),
    [allListings]
  );
  // const [selectedUuid, setSelectedUuid] = useState<string | null>(
  //   initialFilters.selectedUuid
  // );
  // const selectedUuidRef = useRef(selectedUuid);
  const previousFetchRef = useRef<Partial<FilterUrlParams> | null>(null);

  // useEffect(() => {
  //   selectedUuidRef.current = selectedUuid;
  // }, [selectedUuid]);

  // useEffect(() => {
  //   writeFiltersToUrl({
  //     itemType,
  //     minSpreadForPercent,
  //     rarity,
  //     searchText: query.trim(),
  //     selectedUuid,
  //     sort,
  //   });
  // }, [itemType, minSpreadForPercent, query, rarity, selectedUuid, sort]);

  useEffect(() => {
    let active = true;

    async function loadListings() {
      setListingError('');

      const previousFetch = previousFetchRef.current;
      const needsNewFetch =
        previousFetch === null ||
        previousFetch.itemType !== params.itemType ||
        previousFetch.query !== params.query ||
        previousFetch.rarity !== params.rarity ||
        previousFetch.series !== params.series;

      setListingState((current) =>
        current === 'ready' && !needsNewFetch ? 'ready' : 'loading'
      );

      try {
        let nextListings: Listing[];

        if (needsNewFetch) {
          const [
            fetchedListings,
            storedOrderAverages,
            storedOrderLiquidities,
          ] = await Promise.all([
            fetchListingsByTypeAndRarity({
              itemType: params?.itemType,
              name: params?.query ? params.query.trim() : undefined,
              rarity: params?.rarity || undefined,
              series: params?.series,
            }),
            fetchStoredOrderAverages().catch(
              () => new Map<string, StoredOrderAverage>()
            ),
            fetchStoredOrderLiquidities().catch(() => new Map()),
          ]);

          nextListings = fetchedListings.map((listing) => {
            const uuid = listing.item?.uuid;
            const average = uuid
              ? storedOrderAverages.get(uuid)?.averagePrice ?? null
              : null;
            const liquidity = uuid
              ? storedOrderLiquidities.get(uuid) ?? null
              : null;
            const buyNow = getListingPrices(listing).buyNow;

            return {
              ...listing,
              allTimeAverage: average,
              buyNowVsAllTimeAverageDiff:
                average === null || buyNow === null ? null : buyNow - average,
              storedOrderLiquidity: liquidity,
            };
          });
        } else {
          nextListings = [...allListings];
        }

        if (needsNewFetch) {
          setAllListings(nextListings);
          previousFetchRef.current = {
            itemType: params?.itemType,
            query: params?.query,
            rarity: params?.rarity,
            series: params?.series,
          };
        }

        if (!active) return;

        const seriesForFilter = listingsIncludeSeries(
          nextListings,
          params?.series
        )
          ? params?.series
          : undefined;

        if (params?.series && seriesForFilter === undefined) {
          setQueryParams({ series: undefined });
        }

        nextListings = nextListings.filter((listing) => {
          const prices = getListingPrices(listing);

          return (
            isWithinRange(
              prices.buyNow,
              parseNonNegativeQueryNumber(params?.minBuyNow),
              parseNonNegativeQueryNumber(params?.maxBuyNow)
            ) &&
            isWithinRange(
              prices.sellNow,
              parseNonNegativeQueryNumber(params?.minSellNow),
              parseNonNegativeQueryNumber(params?.maxSellNow)
            ) &&
            listingMatchesSeries(listing, seriesForFilter)
          );
        });

        if (isSpreadSort(activeSort)) {
          nextListings = sortListingsBySpread(
            filterListingsForSpreadSort(
              nextListings,
              activeSort,
              params?.minSpreadForPercent
                ? Number(params?.minSpreadForPercent)
                : undefined
            ),
            activeSort,
            sortDirection
          );
        } else {
          nextListings = sortListingsByStandardMetric(
            nextListings,
            activeSort,
            sortDirection
          );
        }

        setFilteredListings(nextListings);
        setListingState('ready');

        const firstUuid = nextListings[0]?.item?.uuid;
        // const currentSelectedUuid = selectedUuidRef.current;
        const selectedUuidStillVisible = nextListings.some(
          (listing: Listing) => listing.item?.uuid === params.uuid
        );

        if (firstUuid && (!params.uuid || !selectedUuidStillVisible)) {
          setQueryParams({ uuid: firstUuid });
          // setSelectedUuid(firstUuid);
        }
      } catch (error) {
        if (!active) return;

        setFilteredListings([]);
        setAllListings([]);
        setListingState('error');
        setListingError(error instanceof Error ? error.message : String(error));
      }
    }

    loadListings();

    return () => {
      active = false;
    };
  }, [
    params?.itemType,
    params?.maxBuyNow,
    params?.maxSellNow,
    params?.minBuyNow,
    params?.minSpreadForPercent,
    params?.minSellNow,
    params?.query,
    params?.rarity,
    params?.series,
    params?.sort,
    params?.sortDirection,
  ]);

  return (
    <Container maxWidth={false} sx={{ maxWidth: 1440, py: 3 }}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={2}
        sx={{ alignItems: { xs: 'stretch', md: 'flex-end' }, mb: 2.5 }}
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
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            lg: '400px minmax(0, 1fr)',
            xl: '430px minmax(0, 1fr)',
          },
          gap: 2.5,
        }}
      >
        <SearchPanel
          listings={filteredListings}
          listingError={listingError}
          listingState={listingState}
          seriesOptions={seriesOptions}
        />

        <MarketDetail />
      </Box>
    </Container>
  );
}

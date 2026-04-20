import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Container, Stack, Typography } from '@mui/material';

import { MarketDetail } from './components/market/Detail/MarketDetail';
import { SearchPanel } from './components/market/SearchPanel';
import {
  readFiltersFromUrl,
  type LoadState,
  writeFiltersToUrl,
  fetchListingsByTypeAndRarity,
  isSpreadSort,
  sortListingsBySpread,
  filterListingsForSpreadSort,
  sortListingsByStandardMetric,
  getListingPrices,
} from './marketUtils';
import type { Listing, SortKey } from './showApi';
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

export default function App() {
  const { params, setQueryParams } = useQueryParams<FilterUrlParams>();
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
  // const [selectedUuid, setSelectedUuid] = useState<string | null>(
  //   initialFilters.selectedUuid
  // );
  // const selectedUuidRef = useRef(selectedUuid);
  const previousFetchRef = useRef<Partial<FilterUrlParams>>(null);

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

      let needsNewFetch =
        previousFetchRef?.current?.itemType !== params.itemType ||
        previousFetchRef.current?.query !== params.query ||
        previousFetchRef.current?.rarity !== params.rarity;

      setListingState((current) =>
        current === 'ready' && !needsNewFetch ? 'ready' : 'loading'
      );

      try {
        let nextListings = needsNewFetch
          ? await fetchListingsByTypeAndRarity({
              itemType: params?.itemType,
              name: params?.query ? params.query.trim() : undefined,
              rarity: params?.rarity || undefined,
            })
          : [...allListings]; // needs to be a new array

        if (needsNewFetch) {
          setAllListings(nextListings);
          previousFetchRef.current = {
            itemType: params?.itemType,
            query: params?.query,
            rarity: params?.rarity,
          };
        }

        if (!active) return;

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
            )
          );
        });

        if (isSpreadSort(params?.sort)) {
          nextListings = sortListingsBySpread(
            filterListingsForSpreadSort(
              nextListings,
              params?.sort,
              params?.minSpreadForPercent
                ? Number(params?.minSpreadForPercent)
                : undefined
            ),
            params?.sort
          );
        } else {
          nextListings = sortListingsByStandardMetric(
            nextListings,
            params?.sort
          );
        }

        setFilteredListings(nextListings);
        setListingState('ready');

        const firstUuid = nextListings[0]?.item?.uuid;
        // const currentSelectedUuid = selectedUuidRef.current;
        const selectedUuidStillVisible = nextListings.some(
          (listing) => listing.item?.uuid === params.uuid
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
    params?.sort,
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
        />

        <MarketDetail />
      </Box>
    </Container>
  );
}

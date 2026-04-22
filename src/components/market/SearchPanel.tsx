import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  CircularProgress,
  Drawer,
  FormControl,
  IconButton,
  InputLabel,
  ListItemAvatar,
  ListItemButton,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Stack,
  SvgIcon,
  TextField,
  Tooltip,
  Typography,
  type SelectChangeEvent,
} from '@mui/material';

import {
  doesSortMetricUseQuickSell,
  getListingListSummary,
  getListingSortMetric,
  isUsingQuickSellFallback,
  itemTypeOptions,
  rarityOptions,
  resolveSortDirection,
  titleCase,
  type LoadState,
  sortOptions,
} from '../../marketUtils';
import type { ItemType, Listing, SortKey, SortOrder } from '../../showApi';
import { DebounceTextField, ListLoadingState, QuickSellBadge } from './common';
import { useQueryParams } from './common/useQueryParams';
import type { FilterUrlParams } from '../../types';

const LIST_ITEM_HEIGHT = 72;
const LIST_ROW_GAP = 8;
const LIST_ROW_HEIGHT = LIST_ITEM_HEIGHT + LIST_ROW_GAP;
const LIST_OVERSCAN = 6;
const MIN_LIST_HEIGHT = 240;

function toNonNegativeQueryValue(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return undefined;

  return String(Math.max(Math.trunc(parsed), 0));
}

function includesSeriesOption(options: string[], value: string | undefined) {
  const normalizedValue = value?.trim().toLowerCase();
  if (!normalizedValue) return true;

  return options.some(
    (option) => option.trim().toLowerCase() === normalizedValue
  );
}

interface SearchPanelProps {
  listings: Listing[];
  listingError: string;
  listingState: LoadState;
  seriesOptions: string[];
}

interface PriceFiltersFieldsProps {
  maxBuyNow?: string;
  maxSellNow?: string;
  minBuyNow?: string;
  minSellNow?: string;
  onMaxBuyNowChange: (value: string | undefined) => void;
  onMaxSellNowChange: (value: string | undefined) => void;
  onMinBuyNowChange: (value: string | undefined) => void;
  onMinSellNowChange: (value: string | undefined) => void;
}

function PriceFiltersFields({
  maxBuyNow,
  maxSellNow,
  minBuyNow,
  minSellNow,
  onMaxBuyNowChange,
  onMaxSellNowChange,
  onMinBuyNowChange,
  onMinSellNowChange,
}: PriceFiltersFieldsProps) {
  return (
    <Box
      sx={{
        display: 'grid',
        gap: 1.5,
        gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
      }}
    >
      <Typography
        color="text.secondary"
        fontWeight={800}
        sx={{ gridColumn: '1 / -1', letterSpacing: '0.04em' }}
        textTransform="uppercase"
        variant="caption"
      >
        Post-query price filters
      </Typography>
      <TextField
        fullWidth
        inputProps={{ min: 0, step: 1 }}
        label="Min buy now"
        onChange={(event) => onMinBuyNowChange(toNonNegativeQueryValue(event.target.value))}
        type="number"
        value={minBuyNow ?? ''}
      />
      <TextField
        fullWidth
        inputProps={{ min: 0, step: 1 }}
        label="Max buy now"
        onChange={(event) => onMaxBuyNowChange(toNonNegativeQueryValue(event.target.value))}
        type="number"
        value={maxBuyNow ?? ''}
      />
      <TextField
        fullWidth
        inputProps={{ min: 0, step: 1 }}
        label="Min sell now"
        onChange={(event) => onMinSellNowChange(toNonNegativeQueryValue(event.target.value))}
        type="number"
        value={minSellNow ?? ''}
      />
      <TextField
        fullWidth
        inputProps={{ min: 0, step: 1 }}
        label="Max sell now"
        onChange={(event) => onMaxSellNowChange(toNonNegativeQueryValue(event.target.value))}
        type="number"
        value={maxSellNow ?? ''}
      />
    </Box>
  );
}

function SortDirectionIcon({ direction }: { direction: SortOrder }) {
  return (
    <SvgIcon
      sx={{
        fontSize: 18,
        transform: direction === 'asc' ? 'rotate(180deg)' : 'none',
        transition: 'transform 120ms ease',
      }}
      viewBox="0 0 24 24"
    >
      <path d="M11 5h2v10.17l3.59-3.58L18 13l-6 6-6-6 1.41-1.41L11 15.17V5z" />
    </SvgIcon>
  );
}

export const SearchPanel = function SearchPanel({
  listings,
  listingError,
  listingState,
  seriesOptions,
}: SearchPanelProps) {
  const { params, setQueryParams } = useQueryParams<FilterUrlParams>();
  const listRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(MIN_LIST_HEIGHT);
  const [isFiltersDrawerOpen, setIsFiltersDrawerOpen] = useState(false);

  const showInitialLoadingState =
    listingState === 'loading' && listings.length === 0;
  const showRefreshingOverlay =
    listingState === 'loading' && listings.length > 0;
  const activeSort = params?.sort;
  const activeSortDirection = resolveSortDirection(
    params?.sort,
    params?.sortDirection
  );
  const nextSortDirection = activeSortDirection === 'desc' ? 'asc' : 'desc';
  const startIndex = Math.max(
    Math.floor(scrollTop / LIST_ROW_HEIGHT) - LIST_OVERSCAN,
    0
  );
  const endIndex = Math.min(
    listings.length,
    Math.ceil((scrollTop + viewportHeight) / LIST_ROW_HEIGHT) + LIST_OVERSCAN
  );
  const totalHeight =
    listings.length > 0
      ? listings.length * LIST_ROW_HEIGHT - LIST_ROW_GAP
      : MIN_LIST_HEIGHT;
  const visibleListings = listings.slice(startIndex, endIndex);
  const activeFilterCount = [
    params?.minBuyNow,
    params?.maxBuyNow,
    params?.minSellNow,
    params?.maxSellNow,
    params?.series,
  ].filter(Boolean).length;
  const seriesSelectOptions = includesSeriesOption(seriesOptions, params?.series)
    ? seriesOptions
    : [params.series ?? '', ...seriesOptions];

  useEffect(() => {
    if (showInitialLoadingState) return;

    const node = listRef.current;
    if (!node) return;

    const updateMeasurements = () => {
      setViewportHeight(node.clientHeight || MIN_LIST_HEIGHT);
      setScrollTop(node.scrollTop);
    };

    updateMeasurements();

    if (typeof ResizeObserver === 'undefined') return;

    const resizeObserver = new ResizeObserver(() => {
      updateMeasurements();
    });

    resizeObserver.observe(node);

    return () => {
      resizeObserver.disconnect();
    };
  }, [showInitialLoadingState]);

  useEffect(() => {
    const node = listRef.current;
    if (!node) return;

    const activeIndex = listings.findIndex(
      (listing) => listing.item?.uuid === params?.uuid
    );
    if (activeIndex < 0) return;

    const rowTop = activeIndex * LIST_ROW_HEIGHT;
    const rowBottom = rowTop + LIST_ITEM_HEIGHT;
    const viewportTop = node.scrollTop;
    const viewportBottom = viewportTop + node.clientHeight;

    if (rowTop < viewportTop) {
      node.scrollTo({ top: rowTop });
      return;
    }

    if (rowBottom > viewportBottom) {
      node.scrollTo({
        top: Math.max(rowBottom - node.clientHeight, 0),
      });
    }
  }, [listings, params?.uuid]);

  const priceFiltersContent = (
    <Stack spacing={2}>
      <FormControl fullWidth disabled={seriesSelectOptions.length === 0}>
        <InputLabel id="series-filter-label">Series</InputLabel>
        <Select
          label="Series"
          labelId="series-filter-label"
          onChange={(event: SelectChangeEvent) =>
            setQueryParams({
              series: event.target.value,
            })
          }
          value={params?.series ?? ''}
        >
          <MenuItem value="">All</MenuItem>
          {seriesSelectOptions.map((series) => (
            <MenuItem key={series} value={series}>
              {series}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <PriceFiltersFields
        maxBuyNow={params?.maxBuyNow}
        maxSellNow={params?.maxSellNow}
        minBuyNow={params?.minBuyNow}
        minSellNow={params?.minSellNow}
        onMaxBuyNowChange={(value) => {
          setQueryParams({
            maxBuyNow: value,
          });
        }}
        onMaxSellNowChange={(value) => {
          setQueryParams({
            maxSellNow: value,
          });
        }}
        onMinBuyNowChange={(value) => {
          setQueryParams({
            minBuyNow: value,
          });
        }}
        onMinSellNowChange={(value) => {
          setQueryParams({
            minSellNow: value,
          });
        }}
      />
    </Stack>
  );

  return (
    <Paper
      component="aside"
      variant="outlined"
      sx={{
        alignSelf: 'start',
        minWidth: 0,
        p: 2,
        position: { lg: 'sticky' },
        top: 16,
        width: '100%',
      }}
    >
      <Stack spacing={1.5}>
        <DebounceTextField
          debounceMs={300}
          fullWidth
          label="Item"
          onDebouncedChange={(value) => {
            setQueryParams({
              query: value,
            });
          }}
          placeholder="Search market items"
          type="search"
          value={params?.query ?? ''}
        />

        <FormControl fullWidth>
          <InputLabel id="item-type-label">Type</InputLabel>
          <Select
            label="Type"
            labelId="item-type-label"
            onChange={(event: SelectChangeEvent) =>
              setQueryParams({
                itemType: event.target.value as ItemType,
                series: undefined,
              })
            }
            value={params?.itemType ?? ''}
          >
            {itemTypeOptions.map((option) => (
              <MenuItem key={option.value || 'all'} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <Stack direction={{ xs: 'column', sm: 'row', lg: 'row' }} spacing={1.5}>
          <FormControl fullWidth>
            <InputLabel id="rarity-label">Rarity</InputLabel>
            <Select
              label="Rarity"
              labelId="rarity-label"
              onChange={(event: SelectChangeEvent) =>
                setQueryParams({
                  rarity: event.target.value,
                })
              }
              value={params?.rarity ?? ''}
            >
              {rarityOptions.map((option) => (
                <MenuItem key={option || 'all'} value={option}>
                  {option ? titleCase(option) : 'All'}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flex: 1 }}>
            <FormControl fullWidth>
              <InputLabel id="sort-label">Sort</InputLabel>
              <Select
                label="Sort"
                labelId="sort-label"
                onChange={(event: SelectChangeEvent) =>
                  setQueryParams({
                    sort: event.target.value as SortKey,
                  })
                }
                value={params?.sort ?? ''}
              >
                {sortOptions.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Tooltip
              placement="top"
              title={
                activeSortDirection === 'desc'
                  ? 'Sorting descending. Click for ascending.'
                  : 'Sorting ascending. Click for descending.'
              }
            >
              <IconButton
                aria-label={`Sorting ${activeSortDirection}. Click to sort ${nextSortDirection}.`}
                color="primary"
                onClick={() =>
                  setQueryParams({
                    sortDirection: nextSortDirection,
                  })
                }
                size="small"
                sx={{
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 1.5,
                  flexShrink: 0,
                  height: 40,
                  mt: { xs: 1, sm: 0 },
                  width: 40,
                }}
              >
                <SortDirectionIcon direction={activeSortDirection} />
              </IconButton>
            </Tooltip>
          </Stack>
        </Stack>

        {params?.sort === 'spread_percentage' ? (
          <TextField
            fullWidth
            inputProps={{ min: 0, step: 1 }}
            label="Minimum spread"
            onChange={(event) =>
              setQueryParams({
                minSpreadForPercent: Math.max(
                  Number(event.target.value) || 0,
                  0
                ).toString(),
              })
            }
            type="number"
            value={params?.minSpreadForPercent ?? ''}
          />
        ) : null}

        <Button
          onClick={() => setIsFiltersDrawerOpen(true)}
          sx={{ alignSelf: 'flex-start', textTransform: 'none' }}
          variant="outlined"
        >
          {activeFilterCount > 0
            ? `Filters (${activeFilterCount})`
            : 'Filters'}
        </Button>

        <Drawer
          anchor="right"
          onClose={() => setIsFiltersDrawerOpen(false)}
          open={isFiltersDrawerOpen}
        >
          <Stack
            spacing={2}
            sx={{
              p: 2,
              width: { xs: 'min(100vw, 360px)', sm: 360 },
            }}
          >
            <Stack
              direction="row"
              spacing={1}
              sx={{ alignItems: 'center', justifyContent: 'space-between' }}
            >
              <Typography fontWeight={900} variant="h6">
                Filters
              </Typography>
              <Button
                onClick={() => setIsFiltersDrawerOpen(false)}
                size="small"
                sx={{ textTransform: 'none' }}
              >
                Close
              </Button>
            </Stack>

            {priceFiltersContent}
          </Stack>
        </Drawer>

        {listingState === 'error' ? (
          <Alert severity="error">{listingError}</Alert>
        ) : null}

        <Box sx={{ position: 'relative' }}>
          {showInitialLoadingState ? (
            <ListLoadingState />
          ) : (
            <Box
              aria-label="Market listings"
              onScroll={(event) => {
                setScrollTop(event.currentTarget.scrollTop);
              }}
              ref={listRef}
              role="list"
              sx={{
                maxHeight: { xs: 440, lg: 'calc(100vh - 250px)' },
                minHeight: MIN_LIST_HEIGHT,
                overflow: 'auto',
                position: 'relative',
                pr: 0.5,
              }}
            >
              <Box sx={{ height: totalHeight, position: 'relative' }}>
                {visibleListings.map((listing, visibleIndex) => {
                  const index = startIndex + visibleIndex;
                  const uuid = listing.item?.uuid;
                  const active = uuid === params?.uuid;
                  const image =
                    listing.item?.baked_img ?? listing.item?.img ?? undefined;
                  const metric = getListingSortMetric(listing, activeSort);
                  const showQuickSellBadge =
                    isUsingQuickSellFallback(listing) &&
                    doesSortMetricUseQuickSell(activeSort);

                  return (
                    <Box
                      key={uuid ?? `${listing.listing_name}-${index}`}
                      role="listitem"
                      sx={{
                        left: 0,
                        position: 'absolute',
                        right: 0,
                        top: index * LIST_ROW_HEIGHT,
                      }}
                    >
                      <ListItemButton
                        disabled={!uuid}
                        onClick={() => {
                          if (!uuid) return;

                          setQueryParams({ uuid });
                        }}
                        selected={active}
                        sx={{
                          alignItems: 'center',
                          border: 1,
                          borderColor: active ? 'primary.main' : 'divider',
                          borderRadius: 1,
                          display: 'flex',
                          gap: 1.25,
                          height: LIST_ITEM_HEIGHT,
                          maxHeight: LIST_ITEM_HEIGHT,
                          minHeight: LIST_ITEM_HEIGHT,
                          overflow: 'hidden',
                          px: 1.5,
                          py: 1,
                          width: '100%',
                        }}
                      >
                        <ListItemAvatar sx={{ flex: '0 0 40px', minWidth: 40 }}>
                          <Avatar
                            src={image}
                            variant="square"
                            sx={{
                              bgcolor: 'background.default',
                              objectFit: 'contain',
                            }}
                          >
                            {listing.listing_name?.charAt(0) ?? '?'}
                          </Avatar>
                        </ListItemAvatar>
                        <ListItemText
                          primary={listing.listing_name ?? listing.item?.name}
                          primaryTypographyProps={{
                            fontWeight: 800,
                            noWrap: true,
                          }}
                          secondary={getListingListSummary(listing)}
                          secondaryTypographyProps={{
                            noWrap: true,
                            variant: 'body2',
                          }}
                          sx={{
                            flex: 1,
                            m: 0,
                            minWidth: 0,
                            '& .MuiListItemText-primary, & .MuiListItemText-secondary':
                              {
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              },
                          }}
                        />
                        <Box
                          sx={{
                            flex: '0 0 auto',
                            minWidth: 0,
                            overflow: 'hidden',
                            textAlign: 'right',
                          }}
                        >
                          <Stack
                            direction="row"
                            spacing={0.5}
                            sx={{
                              alignItems: 'center',
                              flexWrap: 'nowrap',
                              justifyContent: 'flex-end',
                              minWidth: 0,
                            }}
                          >
                            <Typography
                              color="secondary"
                              fontWeight={900}
                              noWrap
                              sx={{ minWidth: 0 }}
                            >
                              {metric.value}
                            </Typography>
                            {showQuickSellBadge ? <QuickSellBadge /> : null}
                          </Stack>
                          <Typography
                            color="text.secondary"
                            noWrap
                            variant="caption"
                          >
                            {metric.label}
                          </Typography>
                        </Box>
                      </ListItemButton>
                    </Box>
                  );
                })}
              </Box>
            </Box>
          )}

          {showRefreshingOverlay ? (
            <Box
              role="status"
              aria-live="polite"
              sx={{
                alignItems: 'center',
                backdropFilter: 'blur(2px)',
                backgroundColor: 'rgba(10, 15, 20, 0.58)',
                borderRadius: 1,
                bottom: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
                inset: 0,
                justifyContent: 'center',
                position: 'absolute',
                zIndex: 1,
              }}
            >
              <CircularProgress size={24} thickness={5} />
              <Typography color="text.secondary" variant="body2">
                Refreshing market listings...
              </Typography>
            </Box>
          ) : null}
        </Box>
      </Stack>
    </Paper>
  );
};

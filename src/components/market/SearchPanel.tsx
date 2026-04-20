import { memo } from 'react';
import {
  Alert,
  Avatar,
  Box,
  CircularProgress,
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
  TextField,
  Typography,
  type SelectChangeEvent,
} from '@mui/material';

import {
  doesSortMetricUseQuickSell,
  formatStubs,
  getListingListSummary,
  getListingSortMetric,
  isSpreadSort,
  isUsingQuickSellFallback,
  itemTypeOptions,
  rarityOptions,
  titleCase,
  type LoadState,
  sortOptions,
  updateUrlParam,
} from '../../marketUtils';
import type { ItemType, Listing, SortKey } from '../../showApi';
import { DebounceTextField, ListLoadingState, QuickSellBadge } from './common';
import { useQueryParams } from './common/useQueryParams';
import { FilterUrlParams } from '../../types';

interface SearchPanelProps {
  listings: Listing[];
  listingError: string;
  listingState: LoadState;
}

export const SearchPanel = function SearchPanel({
  listings,
  listingError,
  listingState,
}: SearchPanelProps) {
  const { params, setQueryParams } = useQueryParams<FilterUrlParams>();

  console.log('params: ', params);
  const showInitialLoadingState =
    listingState === 'loading' && listings.length === 0;
  const showRefreshingOverlay =
    listingState === 'loading' && listings.length > 0;

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

        {listingState === 'error' ? (
          <Alert severity="error">{listingError}</Alert>
        ) : null}

        <Box sx={{ position: 'relative' }}>
          {showInitialLoadingState ? (
            <ListLoadingState />
          ) : (
            <List
              aria-label="Market listings"
              disablePadding
              sx={{
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
                maxHeight: { xs: 440, lg: 'calc(100vh - 250px)' },
                minHeight: 240,
                overflow: 'auto',
                pr: 0.5,
              }}
            >
              {listings.map((listing, index) => {
                const uuid = listing.item?.uuid;
                const active = uuid === params?.uuid;
                const image =
                  listing.item?.baked_img ?? listing.item?.img ?? undefined;
                const metric = getListingSortMetric(listing, params?.sort);
                const showQuickSellBadge =
                  isUsingQuickSellFallback(listing) &&
                  doesSortMetricUseQuickSell(params?.sort);

                if (active) {
                  console.log('found active item: ', active, uuid);
                }

                return (
                  <ListItemButton
                    disabled={!uuid}
                    key={uuid ?? `${listing.listing_name}`}
                    // onClick={() => uuid && setSelectedUuid(uuid)}
                    onClick={() => {
                      updateUrlParam('uuid', uuid ?? null);
                    }}
                    selected={active}
                    sx={{
                      alignItems: 'center',
                      border: 1,
                      borderColor: active ? 'primary.main' : 'divider',
                      borderRadius: 1,
                      display: 'flex',
                      flex: '0 0 auto',
                      gap: 1.25,
                      height: 72,
                      maxHeight: 72,
                      minHeight: 72,
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
                      primaryTypographyProps={{ fontWeight: 800, noWrap: true }}
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
                );
              })}
            </List>
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

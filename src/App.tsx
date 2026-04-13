import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Container, Stack, Typography } from "@mui/material";

import { MarketDetail } from "./components/market/MarketDetail";
import { SearchPanel } from "./components/market/SearchPanel";
import {
  fetchSortedListings,
  readFiltersFromUrl,
  type LoadState,
  writeFiltersToUrl,
} from "./marketUtils";
import type { Listing, SortKey } from "./showApi";

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
  const selectedUuidRef = useRef(selectedUuid);

  useEffect(() => {
    selectedUuidRef.current = selectedUuid;
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

  const selectedCatalogListing = useMemo(
    () =>
      listings.find((listing) => listing.item?.uuid === selectedUuid) ?? null,
    [listings, selectedUuid],
  );

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
          gridTemplateColumns: {
            xs: "1fr",
            lg: "400px minmax(0, 1fr)",
            xl: "430px minmax(0, 1fr)",
          },
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
          selectedCatalogListing={selectedCatalogListing}
          selectedUuid={selectedUuid}
        />
      </Box>
    </Container>
  );
}

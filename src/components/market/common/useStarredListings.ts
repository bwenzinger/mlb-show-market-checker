import { useCallback, useMemo, useSyncExternalStore } from 'react';

const STARRED_LISTINGS_STORAGE_KEY = 'mlb-show-market-starred-listings-v1';
const STARRED_LISTINGS_CHANGE_EVENT = 'starred-listings-change';
const EMPTY_STARRED_LISTINGS = '[]';

function readSnapshot(): string {
  if (typeof window === 'undefined') return EMPTY_STARRED_LISTINGS;

  return (
    window.localStorage.getItem(STARRED_LISTINGS_STORAGE_KEY) ??
    EMPTY_STARRED_LISTINGS
  );
}

function parseStarredSnapshot(snapshot: string): Set<string> {
  try {
    const parsed = JSON.parse(snapshot) as unknown;
    if (!Array.isArray(parsed)) return new Set();

    return new Set(
      parsed.filter((value): value is string => typeof value === 'string')
    );
  } catch {
    return new Set();
  }
}

function writeStarredListings(starredUuids: Set<string>) {
  if (typeof window === 'undefined') return;

  const values = [...starredUuids].sort();
  window.localStorage.setItem(
    STARRED_LISTINGS_STORAGE_KEY,
    JSON.stringify(values)
  );
  window.dispatchEvent(new Event(STARRED_LISTINGS_CHANGE_EVENT));
}

function subscribe(onStoreChange: () => void) {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key === STARRED_LISTINGS_STORAGE_KEY) {
      onStoreChange();
    }
  };

  window.addEventListener('storage', onStorage);
  window.addEventListener(STARRED_LISTINGS_CHANGE_EVENT, onStoreChange);

  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(STARRED_LISTINGS_CHANGE_EVENT, onStoreChange);
  };
}

export function useStarredListings() {
  const snapshot = useSyncExternalStore(
    subscribe,
    readSnapshot,
    () => EMPTY_STARRED_LISTINGS
  );
  const starredUuids = useMemo(
    () => parseStarredSnapshot(snapshot),
    [snapshot]
  );
  const toggleStarred = useCallback((uuid: string) => {
    const nextStarred = parseStarredSnapshot(readSnapshot());

    if (nextStarred.has(uuid)) {
      nextStarred.delete(uuid);
    } else {
      nextStarred.add(uuid);
    }

    writeStarredListings(nextStarred);
  }, []);

  return {
    starredUuids,
    toggleStarred,
  };
}

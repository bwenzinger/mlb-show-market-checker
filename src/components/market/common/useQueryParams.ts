import { useSyncExternalStore } from 'react';

export type QueryParamValue = string | null | undefined;
type RawQueryParams = Record<string, string>;

const URL_PARAMS_CHANGE_EVENT = 'url-params-change';

let historyPatched = false;
let cachedSearch = '';
let cachedParams: RawQueryParams = {};

export function useQueryParams<T = RawQueryParams>(): {
  params: T;
  setQueryParams: (updates: Partial<T>) => void;
} {
  const params = useSyncExternalStore(subscribe, getSnapshot, getSnapshot) as T;

  return {
    params,
    setQueryParams: (updates: Partial<T>) => updateQueryParams<T>(updates),
  };
}

function shallowEqualObject<T extends Record<string, unknown>>(a: T, b: T) {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);

  if (aKeys.length !== bKeys.length) return false;

  for (const key of aKeys) {
    if (a[key] !== b[key]) return false;
  }

  return true;
}

function parseSearchParams(search: string): RawQueryParams {
  const nextParams = Object.fromEntries(new URLSearchParams(search).entries());

  if (search === cachedSearch || shallowEqualObject(cachedParams, nextParams)) {
    cachedSearch = search;
    return cachedParams;
  }

  cachedSearch = search;
  cachedParams = nextParams;
  return cachedParams;
}

function notifyUrlParamsChanged() {
  window.dispatchEvent(new Event(URL_PARAMS_CHANGE_EVENT));
}

function patchHistory() {
  if (historyPatched || typeof window === 'undefined') return;

  historyPatched = true;

  const { pushState, replaceState } = window.history;

  window.history.pushState = function pushStatePatched(...args) {
    pushState.apply(this, args);
    notifyUrlParamsChanged();
  };

  window.history.replaceState = function replaceStatePatched(...args) {
    replaceState.apply(this, args);
    notifyUrlParamsChanged();
  };
}

function subscribe(onStoreChange: () => void) {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  patchHistory();

  window.addEventListener('popstate', onStoreChange);
  window.addEventListener(URL_PARAMS_CHANGE_EVENT, onStoreChange);

  return () => {
    window.removeEventListener('popstate', onStoreChange);
    window.removeEventListener(URL_PARAMS_CHANGE_EVENT, onStoreChange);
  };
}

function getSnapshot() {
  if (typeof window === 'undefined') {
    return cachedParams;
  }

  return parseSearchParams(window.location.search);
}

export function updateQueryParams<T>(updates: Partial<T>) {
  if (typeof window === 'undefined') return;

  const url = new URL(window.location.href);

  for (const [key, value] of Object.entries(updates)) {
    if (value == null || value === '') {
      url.searchParams.delete(key);
      continue;
    }

    url.searchParams.set(key, value as string);
  }

  const nextSearch = url.search;
  parseSearchParams(nextSearch);

  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const nextUrl = `${url.pathname}${nextSearch}${url.hash}`;

  if (currentUrl !== nextUrl) {
    window.history.replaceState(window.history.state, '', nextUrl);
  }
}

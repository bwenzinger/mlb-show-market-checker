import { ItemType, SortKey } from './showApi';

export interface FilterUrlParams {
  itemType?: ItemType;
  maxBuyNow?: string;
  maxSellNow?: string;
  minBuyNow?: string;
  minSpreadForPercent?: string;
  minSellNow?: string;
  query?: string;
  rarity?: string;
  sort?: SortKey;
  uuid?: string;
}

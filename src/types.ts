import { ItemType, SortKey } from './showApi';

export interface FilterUrlParams {
  uuid?: string;
  itemType?: ItemType;
  minSpreadForPercent?: string;
  query?: string;
  rarity?: string;
  sort?: SortKey;
}

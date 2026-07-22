import type { ISODateTime } from "./travel.js";

export interface ShoppingItem {
  id: string;
  listId: string;
  label: string;
  checked: boolean;
  sortOrder: number;
  addedBy: string;
  checkedAt: ISODateTime | null;
}

export interface ShoppingListSummary {
  id: string;
  title: string;
  status: "current" | "archived";
  itemCount: number;
  checkedCount: number;
  createdAt: ISODateTime;
  archivedAt: ISODateTime | null;
}

export interface ShoppingList extends ShoppingListSummary { items: ShoppingItem[] }
export interface ShoppingEditLock { token: string; ownerEmail: string; ownerName: string; expiresAt: ISODateTime }

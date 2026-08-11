import type { ISODateTime } from "./travel.js";

export interface Todo {
  id: string;
  listId: string;
  text: string;
  createdAt: ISODateTime;
  completedAt: ISODateTime | null;
}

export interface TodoListSummary {
  id: string;
  title: string;
  shared: boolean;
  openCount: number;
  completedCount: number;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface TodoList extends TodoListSummary { todos: Todo[] }

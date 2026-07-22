import type { ISODateTime } from "./travel.js";

export interface Todo {
  id: string;
  text: string;
  createdAt: ISODateTime;
  completedAt: ISODateTime | null;
}

export interface CreateTodoInput { text: string }

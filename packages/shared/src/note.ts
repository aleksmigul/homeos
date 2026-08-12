import type { ISODateTime } from "./travel.js";

export interface SharedNote {
  id: string;
  title: string;
  content: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  updatedBy: string;
}

export interface CreateSharedNoteInput { title: string; content?: string }
export interface UpdateSharedNoteInput extends CreateSharedNoteInput { expectedUpdatedAt: ISODateTime }

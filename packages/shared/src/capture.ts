import type { ISODateTime } from "./travel.js";

export interface CaptureStream {
  id: string;
  name: string;
  itemCount: number;
  createdAt: ISODateTime;
}

export interface SavedItem {
  id: string;
  streamId: string;
  title: string;
  text: string;
  url: string;
  source: string;
  createdAt: ISODateTime;
  attachments: SavedAttachment[];
}

export interface SavedAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  url: string;
}

export interface CreateSavedItemInput {
  streamId: string;
  title?: string;
  text?: string;
  url?: string;
  source?: string;
  attachmentIds?: string[];
}

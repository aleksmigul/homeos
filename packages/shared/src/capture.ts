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
}

export interface CreateCaptureStreamInput { name: string }
export interface CreateSavedItemInput {
  streamId: string;
  title?: string;
  text?: string;
  url?: string;
  source?: string;
}

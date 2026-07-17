export type ISODate = string;
export type ISODateTime = string;

export interface TravelRow {
  id: string;
  planId: string;
  date: ISODate;
  theme: string;
  hotel: string;
  notes: string;
  sortOrder: number;
  updatedAt: ISODateTime;
}

export interface TravelPlanSummary {
  id: string;
  title: string;
  startDate: ISODate;
  endDate: ISODate;
  rowCount: number;
  updatedAt: ISODateTime;
}

export interface TravelPlan extends TravelPlanSummary {
  rows: TravelRow[];
}

export interface CreateTravelPlanInput {
  title: string;
  startDate: ISODate;
  endDate: ISODate;
}

export interface UpdateTravelRowInput {
  theme?: string;
  hotel?: string;
  notes?: string;
}


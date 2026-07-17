import { randomUUID } from "node:crypto";
import type {
  CreateTravelPlanInput,
  TravelPlan,
  TravelPlanSummary,
  TravelRow,
  UpdateTravelRowInput
} from "@homeos/shared";
import { db } from "./db.js";
import { enumerateDates } from "./dateRange.js";

interface PlanRecord {
  id: string;
  title: string;
  start_date: string;
  end_date: string;
  row_count?: number;
  updated_at: string;
}

interface RowRecord {
  id: string;
  plan_id: string;
  date: string;
  theme: string;
  hotel: string;
  notes: string;
  sort_order: number;
  updated_at: string;
}

export function listTravelPlans(): TravelPlanSummary[] {
  const rows = db
    .prepare(
      `
      SELECT
        p.id,
        p.title,
        p.start_date,
        p.end_date,
        p.updated_at,
        COUNT(r.id) AS row_count
      FROM travel_plans p
      LEFT JOIN travel_rows r ON r.plan_id = p.id
      GROUP BY p.id
      ORDER BY p.updated_at DESC
    `
    )
    .all() as PlanRecord[];

  return rows.map(mapPlanSummary);
}

export function getTravelPlan(id: string): TravelPlan | null {
  const plan = db.prepare("SELECT * FROM travel_plans WHERE id = ?").get(id) as PlanRecord | undefined;
  if (!plan) {
    return null;
  }

  const rows = db
    .prepare("SELECT * FROM travel_rows WHERE plan_id = ? ORDER BY sort_order ASC")
    .all(id) as RowRecord[];

  return {
    ...mapPlanSummary({ ...plan, row_count: rows.length }),
    rows: rows.map(mapTravelRow)
  };
}

export function createTravelPlan(input: CreateTravelPlanInput): TravelPlan {
  const now = new Date().toISOString();
  const id = randomUUID();
  const dates = enumerateDates(input.startDate, input.endDate);

  const insertPlan = db.prepare(`
    INSERT INTO travel_plans (id, title, start_date, end_date, created_at, updated_at)
    VALUES (@id, @title, @startDate, @endDate, @now, @now)
  `);

  const insertRow = db.prepare(`
    INSERT INTO travel_rows (id, plan_id, date, theme, hotel, notes, sort_order, created_at, updated_at)
    VALUES (@id, @planId, @date, '', '', '', @sortOrder, @now, @now)
  `);

  const write = db.transaction(() => {
    insertPlan.run({
      id,
      title: input.title.trim(),
      startDate: input.startDate,
      endDate: input.endDate,
      now
    });

    dates.forEach((date, index) => {
      insertRow.run({
        id: randomUUID(),
        planId: id,
        date,
        sortOrder: index,
        now
      });
    });
  });

  write();

  const plan = getTravelPlan(id);
  if (!plan) {
    throw new Error("Travel plan was not created");
  }
  return plan;
}

export function updateTravelRow(id: string, input: UpdateTravelRowInput): TravelRow | null {
  const row = db.prepare("SELECT * FROM travel_rows WHERE id = ?").get(id) as RowRecord | undefined;
  if (!row) {
    return null;
  }

  const next = {
    theme: input.theme ?? row.theme,
    hotel: input.hotel ?? row.hotel,
    notes: input.notes ?? row.notes,
    updatedAt: new Date().toISOString(),
    id
  };

  db.transaction(() => {
    db.prepare(
      `
      UPDATE travel_rows
      SET theme = @theme, hotel = @hotel, notes = @notes, updated_at = @updatedAt
      WHERE id = @id
    `
    ).run(next);

    db.prepare(
      `
      UPDATE travel_plans
      SET updated_at = @updatedAt
      WHERE id = @planId
    `
    ).run({ updatedAt: next.updatedAt, planId: row.plan_id });
  })();

  const updated = db.prepare("SELECT * FROM travel_rows WHERE id = ?").get(id) as RowRecord;
  return mapTravelRow(updated);
}

function mapPlanSummary(record: PlanRecord): TravelPlanSummary {
  return {
    id: record.id,
    title: record.title,
    startDate: record.start_date,
    endDate: record.end_date,
    rowCount: Number(record.row_count ?? 0),
    updatedAt: record.updated_at
  };
}

function mapTravelRow(record: RowRecord): TravelRow {
  return {
    id: record.id,
    planId: record.plan_id,
    date: record.date,
    theme: record.theme,
    hotel: record.hotel,
    notes: record.notes,
    sortOrder: record.sort_order,
    updatedAt: record.updated_at
  };
}


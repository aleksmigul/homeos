import { randomUUID } from "node:crypto";
import type {
  CreateTravelPlanInput,
  TravelPlan,
  TravelPlanSummary,
  TravelRow,
  UpdateTravelRowInput
} from "@homeos/shared";
import { all, get, run, writeTransaction } from "./db.js";
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
  const rows = all<PlanRecord>(
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
  );

  return rows.map(mapPlanSummary);
}

export function getTravelPlan(id: string): TravelPlan | null {
  const plan = get<PlanRecord>("SELECT * FROM travel_plans WHERE id = :id", { ":id": id });
  if (!plan) {
    return null;
  }

  const rows = all<RowRecord>("SELECT * FROM travel_rows WHERE plan_id = :id ORDER BY sort_order ASC", { ":id": id });

  return {
    ...mapPlanSummary({ ...plan, row_count: rows.length }),
    rows: rows.map(mapTravelRow)
  };
}

export function createTravelPlan(input: CreateTravelPlanInput): TravelPlan {
  const now = new Date().toISOString();
  const id = randomUUID();
  const dates = enumerateDates(input.startDate, input.endDate);

  writeTransaction(() => {
    run(
      `
      INSERT INTO travel_plans (id, title, start_date, end_date, created_at, updated_at)
      VALUES (:id, :title, :startDate, :endDate, :now, :now)
    `,
      {
        ":id": id,
        ":title": input.title.trim(),
        ":startDate": input.startDate,
        ":endDate": input.endDate,
        ":now": now
      }
    );

    dates.forEach((date, index) => {
      run(
        `
        INSERT INTO travel_rows (id, plan_id, date, theme, hotel, notes, sort_order, created_at, updated_at)
        VALUES (:id, :planId, :date, '', '', '', :sortOrder, :now, :now)
      `,
        {
          ":id": randomUUID(),
          ":planId": id,
          ":date": date,
          ":sortOrder": index,
          ":now": now
        }
      );
    });
  });

  const plan = getTravelPlan(id);
  if (!plan) {
    throw new Error("Travel plan was not created");
  }
  return plan;
}

export function updateTravelRow(id: string, input: UpdateTravelRowInput): TravelRow | null {
  const row = get<RowRecord>("SELECT * FROM travel_rows WHERE id = :id", { ":id": id });
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

  writeTransaction(() => {
    run(
      `
      UPDATE travel_rows
      SET theme = @theme, hotel = @hotel, notes = @notes, updated_at = @updatedAt
      WHERE id = @id
    `,
      {
        "@theme": next.theme,
        "@hotel": next.hotel,
        "@notes": next.notes,
        "@updatedAt": next.updatedAt,
        "@id": next.id
      }
    );

    run(
      `
      UPDATE travel_plans
      SET updated_at = @updatedAt
      WHERE id = @planId
    `,
      { "@updatedAt": next.updatedAt, "@planId": row.plan_id }
    );
  });

  const updated = get<RowRecord>("SELECT * FROM travel_rows WHERE id = :id", { ":id": id });
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

import { CalendarPlus, ChevronRight, Home, Loader2, NotebookPen, Plane, Plus, Save } from "lucide-react";
import { FormEvent, Suspense, lazy, useEffect, useMemo, useState } from "react";
import type { CreateTravelPlanInput, TravelPlan, TravelPlanSummary, TravelRow } from "@homeos/shared";
import { createTravelPlan, getTravelPlan, listTravelPlans, updateTravelRow } from "./api";
import "@uiw/react-md-editor/markdown-editor.css";

const today = new Date().toISOString().slice(0, 10);
const MarkdownEditor = lazy(() => import("@uiw/react-md-editor"));

export function App() {
  const [plans, setPlans] = useState<TravelPlanSummary[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<TravelPlan | null>(null);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState("Ready");
  const selectedRow = selectedPlan?.rows.find((row) => row.id === selectedRowId) ?? selectedPlan?.rows[0] ?? null;

  useEffect(() => {
    void bootstrap();
  }, []);

  async function bootstrap() {
    setIsLoading(true);
    try {
      const { travelPlans } = await listTravelPlans();
      setPlans(travelPlans);
      if (travelPlans[0]) {
        await loadPlan(travelPlans[0].id);
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function loadPlan(id: string) {
    const { travelPlan } = await getTravelPlan(id);
    setSelectedPlan(travelPlan);
    setSelectedRowId(travelPlan.rows[0]?.id ?? null);
  }

  function replaceRow(row: TravelRow) {
    setSelectedPlan((plan) => {
      if (!plan) {
        return plan;
      }

      return {
        ...plan,
        rows: plan.rows.map((item) => (item.id === row.id ? row : item)),
        updatedAt: row.updatedAt
      };
    });
  }

  function patchLocalRow(id: string, patch: Partial<TravelRow>) {
    setSelectedPlan((plan) => {
      if (!plan) {
        return plan;
      }

      return {
        ...plan,
        rows: plan.rows.map((row) => (row.id === id ? { ...row, ...patch } : row))
      };
    });
  }

  async function saveRow(row: TravelRow) {
    setStatus("Saving");
    try {
      const { travelRow } = await updateTravelRow(row.id, {
        theme: row.theme,
        hotel: row.hotel,
        notes: row.notes
      });
      replaceRow(travelRow);
      setStatus("Saved");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Save failed");
    }
  }

  async function handleCreate(input: CreateTravelPlanInput) {
    setStatus("Creating");
    const { travelPlan } = await createTravelPlan(input);
    setPlans((items) => [
      {
        id: travelPlan.id,
        title: travelPlan.title,
        startDate: travelPlan.startDate,
        endDate: travelPlan.endDate,
        rowCount: travelPlan.rowCount,
        updatedAt: travelPlan.updatedAt
      },
      ...items
    ]);
    setSelectedPlan(travelPlan);
    setSelectedRowId(travelPlan.rows[0]?.id ?? null);
    setIsCreateOpen(false);
    setStatus("Created");
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <Home size={18} />
          <span>The Annexation</span>
        </div>
        <button className="new-button" type="button" onClick={() => setIsCreateOpen(true)}>
          <Plus size={16} />
          New travel
        </button>
        <nav className="plan-list" aria-label="Travel plans">
          {plans.map((plan) => (
            <button
              className={plan.id === selectedPlan?.id ? "plan-link active" : "plan-link"}
              key={plan.id}
              type="button"
              onClick={() => void loadPlan(plan.id)}
            >
              <Plane size={15} />
              <span>
                <strong>{plan.title}</strong>
                <small>
                  {formatDate(plan.startDate)} - {formatDate(plan.endDate)}
                </small>
              </span>
            </button>
          ))}
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Travel planner</p>
            <h1>{selectedPlan?.title ?? "No trips yet"}</h1>
          </div>
          <div className="status-pill">{isLoading ? <Loader2 className="spin" size={14} /> : <Save size={14} />}{status}</div>
        </header>

        {selectedPlan ? (
          <div className="planner-grid">
            <TravelTable
              rows={selectedPlan.rows}
              selectedRowId={selectedRow?.id ?? null}
              onSelect={setSelectedRowId}
              onLocalChange={patchLocalRow}
              onSave={saveRow}
            />
            <RowPage row={selectedRow} onChange={patchLocalRow} onSave={saveRow} />
          </div>
        ) : (
          <EmptyState onCreate={() => setIsCreateOpen(true)} />
        )}
      </section>

      {isCreateOpen ? <CreateTravelDialog onClose={() => setIsCreateOpen(false)} onCreate={handleCreate} /> : null}
    </main>
  );
}

function TravelTable({
  rows,
  selectedRowId,
  onSelect,
  onLocalChange,
  onSave
}: {
  rows: TravelRow[];
  selectedRowId: string | null;
  onSelect: (id: string) => void;
  onLocalChange: (id: string, patch: Partial<TravelRow>) => void;
  onSave: (row: TravelRow) => Promise<void>;
}) {
  return (
    <section className="table-wrap" aria-label="Travel itinerary table">
      <div className="table-header row">
        <span>Date</span>
        <span>Theme</span>
        <span>Hotel</span>
        <span />
      </div>
      {rows.map((row) => (
        <button
          className={row.id === selectedRowId ? "itinerary-row row selected" : "itinerary-row row"}
          key={row.id}
          type="button"
          onClick={() => onSelect(row.id)}
        >
          <span className="date-cell">
            <strong>{formatWeekday(row.date)}</strong>
            <small>{formatDate(row.date)}</small>
          </span>
          <input
            aria-label={`Theme for ${row.date}`}
            value={row.theme}
            placeholder="Theme"
            onChange={(event) => onLocalChange(row.id, { theme: event.target.value })}
            onBlur={() => void onSave(row)}
            onClick={(event) => event.stopPropagation()}
          />
          <input
            aria-label={`Hotel for ${row.date}`}
            value={row.hotel}
            placeholder="Hotel"
            onChange={(event) => onLocalChange(row.id, { hotel: event.target.value })}
            onBlur={() => void onSave(row)}
            onClick={(event) => event.stopPropagation()}
          />
          <ChevronRight size={16} />
        </button>
      ))}
    </section>
  );
}

function RowPage({
  row,
  onChange,
  onSave
}: {
  row: TravelRow | null;
  onChange: (id: string, patch: Partial<TravelRow>) => void;
  onSave: (row: TravelRow) => Promise<void>;
}) {
  if (!row) {
    return (
      <aside className="row-page">
        <NotebookPen size={18} />
      </aside>
    );
  }

  return (
    <aside className="row-page">
      <div className="row-page-title">
        <CalendarPlus size={18} />
        <div>
          <p>
            {formatWeekday(row.date)}, {formatDate(row.date)}
          </p>
          <h2>{row.theme || "Untitled day"}</h2>
        </div>
      </div>
      <label>
        Theme
        <input
          value={row.theme}
          placeholder="Coffee, museums, slow dinner..."
          onChange={(event) => onChange(row.id, { theme: event.target.value })}
          onBlur={() => void onSave(row)}
        />
      </label>
      <label>
        Hotel
        <input
          value={row.hotel}
          placeholder="Where you sleep"
          onChange={(event) => onChange(row.id, { hotel: event.target.value })}
          onBlur={() => void onSave(row)}
        />
      </label>
      <div className="notes-label">
        <span className="field-label">Notes</span>
        <div className="markdown-editor" data-color-mode="light" onBlur={() => void onSave(row)}>
          <Suspense fallback={<div className="editor-loading">Loading editor...</div>}>
            <MarkdownEditor
              value={row.notes}
              height={360}
              preview="edit"
              textareaProps={{
                placeholder: "# Ideas\n- Dinner reservation\n- Transit notes"
              }}
              onChange={(value) => onChange(row.id, { notes: value ?? "" })}
            />
          </Suspense>
        </div>
      </div>
    </aside>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <section className="empty-state">
      <Plane size={28} />
      <h2>Start with a trip</h2>
      <button className="primary-button" type="button" onClick={onCreate}>
        <Plus size={16} />
        New travel
      </button>
    </section>
  );
}

function CreateTravelDialog({
  onClose,
  onCreate
}: {
  onClose: () => void;
  onCreate: (input: CreateTravelPlanInput) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [error, setError] = useState("");
  const canSubmit = useMemo(() => title.trim() && startDate && endDate, [title, startDate, endDate]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await onCreate({ title, startDate, endDate });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create travel plan");
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <form className="modal" onSubmit={(event) => void submit(event)} onMouseDown={(event) => event.stopPropagation()}>
        <h2>New travel</h2>
        <label>
          Title
          <input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Japan spring trip" />
        </label>
        <div className="date-pair">
          <label>
            Start
            <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </label>
          <label>
            End
            <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          </label>
        </div>
        {error ? <p className="form-error">{error}</p> : null}
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" type="submit" disabled={!canSubmit}>
            Create
          </button>
        </div>
      </form>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(`${value}T00:00:00`));
}

function formatWeekday(value: string) {
  return new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(new Date(`${value}T00:00:00`));
}

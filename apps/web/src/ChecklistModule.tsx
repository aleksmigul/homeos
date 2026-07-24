import { ArrowLeft, Check, CheckCircle2, ChevronRight, ClipboardCheck, History, ListChecks, Pencil, Play, Plus, X } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Checklist, ChecklistRun, ChecklistSummary, CreateChecklistInput } from "@homeos/shared";
import {
  completeChecklistRun,
  createChecklist,
  getChecklist,
  getChecklistRun,
  listChecklists,
  startChecklistRun,
  updateChecklist,
  updateChecklistRunItem
} from "./api";
import { currentNavigation, pushNavigation, type ChecklistScreenState } from "./navigation";

type Screen = ChecklistScreenState;

export function ChecklistModule() {
  const [checklists, setChecklists] = useState<ChecklistSummary[]>([]);
  const [selected, setSelected] = useState<Checklist | null>(null);
  const [activeRun, setActiveRun] = useState<ChecklistRun | null>(null);
  const [screen, setScreen] = useState<Screen>(() => currentNavigation().checklist ?? { kind: "library" });
  const [editing, setEditing] = useState<Checklist | "new" | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void refreshLibrary();
    const initial = currentNavigation().checklist;
    if (initial?.kind === "detail") void loadChecklist(initial.id, false);
    if (initial?.kind === "run") void loadRun(initial.id, false);
    const onPopState = () => {
      const next = currentNavigation().checklist ?? { kind: "library" as const };
      if (next.kind === "detail") void loadChecklist(next.id, false);
      else if (next.kind === "run") void loadRun(next.id, false);
      else setScreen(next);
      setEditing(null);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  async function refreshLibrary() {
    setLoading(true);
    try {
      const response = await listChecklists();
      setChecklists(response.checklists);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setLoading(false);
    }
  }

  async function openChecklist(id: string) {
    await loadChecklist(id, true);
  }

  async function loadChecklist(id: string, addHistory: boolean) {
    setError("");
    try {
      const { checklist } = await getChecklist(id);
      setSelected(checklist);
      setScreen({ kind: "detail", id });
      if (addHistory) pushNavigation({ module: "checklists", checklist: { kind: "detail", id } });
    } catch (cause) {
      setError(message(cause));
    }
  }

  async function openRun(id: string) {
    await loadRun(id, true);
  }

  async function loadRun(id: string, addHistory: boolean) {
    setError("");
    try {
      const { checklistRun } = await getChecklistRun(id);
      setActiveRun(checklistRun);
      setScreen({ kind: "run", id });
      if (addHistory) pushNavigation({ module: "checklists", checklist: { kind: "run", id } });
    } catch (cause) {
      setError(message(cause));
    }
  }

  async function saveChecklist(input: CreateChecklistInput) {
    const response = editing === "new" ? await createChecklist(input) : await updateChecklist(editing!.id, input);
    setEditing(null);
    await refreshLibrary();
    await openChecklist(response.checklist.id);
  }

  async function beginRun() {
    if (!selected) return;
    const { checklistRun } = await startChecklistRun(selected.id);
    setActiveRun(checklistRun);
    setScreen({ kind: "run", id: checklistRun.id });
    pushNavigation({ module: "checklists", checklist: { kind: "run", id: checklistRun.id } });
  }

  async function toggleRunItem(itemId: string, checked: boolean) {
    if (!activeRun || activeRun.completedAt) return;
    setActiveRun({
      ...activeRun,
      checkedCount: activeRun.checkedCount + (checked ? 1 : -1),
      items: activeRun.items.map((item) => item.id === itemId ? { ...item, checked } : item)
    });
    try {
      const { item } = await updateChecklistRunItem(itemId, checked);
      setActiveRun((run) => run ? { ...run, items: run.items.map((entry) => entry.id === item.id ? item : entry) } : run);
    } catch (cause) {
      await openRun(activeRun.id);
      setError(message(cause));
    }
  }

  async function finishRun() {
    if (!activeRun) return;
    const { checklistRun } = await completeChecklistRun(activeRun.id);
    setActiveRun(checklistRun);
    const [, detail] = await Promise.all([refreshLibrary(), getChecklist(activeRun.checklistId)]);
    setSelected(detail.checklist);
  }

  function back() {
    setError("");
    window.history.back();
  }

  if (screen.kind === "run" && activeRun) {
    return <RunScreen run={activeRun} error={error} onBack={back} onToggle={toggleRunItem} onComplete={finishRun} />;
  }

  if (screen.kind === "detail" && selected) {
    return (
      <>
        <ChecklistDetail
          checklist={selected}
          error={error}
          onBack={back}
          onEdit={() => setEditing(selected)}
          onRun={() => void beginRun()}
          onOpenRun={(id) => void openRun(id)}
        />
        {editing ? <ChecklistEditor checklist={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSave={saveChecklist} /> : null}
      </>
    );
  }

  return (
    <section className="workspace checklist-workspace">
      <header className="topbar checklist-topbar">
        <div><p className="eyebrow">Reusable routines</p><h1>Checklists</h1></div>
        <button className="primary-button touch-button add-action" type="button" onClick={() => setEditing("new")}><Plus size={18} /><span>New checklist</span></button>
      </header>
      <div className="checklist-library">
        <div className="section-heading"><div><h2>Your checklists</h2><p>Pick one whenever it is time to get things done.</p></div></div>
        {error ? <p className="inline-error">{error}</p> : null}
        {loading ? <div className="skeleton-card" /> : null}
        {!loading && checklists.length === 0 ? (
          <div className="checklist-empty"><ClipboardCheck size={32} /><h2>Make your first reusable list</h2><p>Packing, cleaning, closing up—anything you do more than once.</p><button className="primary-button touch-button add-action" onClick={() => setEditing("new")}><Plus size={18} /><span>Create checklist</span></button></div>
        ) : (
          <div className="checklist-card-grid">
            {checklists.map((checklist) => (
              <button className="checklist-card" type="button" key={checklist.id} onClick={() => void openChecklist(checklist.id)}>
                <span className="checklist-card-icon"><ListChecks size={21} /></span>
                <span className="checklist-card-copy"><strong>{checklist.title}</strong><small>{checklist.description || `${checklist.itemCount} items`}</small></span>
                <span className="checklist-card-meta">{checklist.itemCount} items · {checklist.runCount} runs</span>
                <ChevronRight size={18} />
              </button>
            ))}
          </div>
        )}
      </div>
      {editing ? <ChecklistEditor checklist={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSave={saveChecklist} /> : null}
    </section>
  );
}

function ChecklistDetail({ checklist, error, onBack, onEdit, onRun, onOpenRun }: {
  checklist: Checklist;
  error: string;
  onBack: () => void;
  onEdit: () => void;
  onRun: () => void;
  onOpenRun: (id: string) => void;
}) {
  return (
    <section className="workspace checklist-workspace">
      <header className="topbar detail-topbar">
        <button className="icon-button" onClick={onBack} aria-label="Back to checklists"><ArrowLeft size={20} /></button>
        <div className="detail-title"><p className="eyebrow">Checklist</p><h1>{checklist.title}</h1></div>
        <button className="secondary-button touch-button" onClick={onEdit}><Pencil size={16} />Edit</button>
      </header>
      <div className="checklist-detail-layout">
        <article className="checklist-template-panel">
          {checklist.description ? <p className="checklist-description">{checklist.description}</p> : null}
          <div className="template-items">
            {checklist.items.map((item) => <div className="template-item" key={item.id}><span className="empty-check" /><span>{item.label}</span></div>)}
          </div>
          {error ? <p className="inline-error">{error}</p> : null}
          <button className="run-button" type="button" onClick={onRun}><Play fill="currentColor" size={19} />Run this checklist</button>
        </article>
        <aside className="history-panel">
          <div className="section-heading compact"><div><p className="eyebrow">Activity</p><h2>Run history</h2></div><History size={19} /></div>
          {checklist.runs.length === 0 ? <p className="history-empty">No runs yet. Your completed and in-progress runs will appear here.</p> : null}
          <div className="history-list">
            {checklist.runs.map((run) => (
              <button type="button" className="history-row" key={run.id} onClick={() => onOpenRun(run.id)}>
                <span className={run.completedAt ? "history-status complete" : "history-status"}>{run.completedAt ? <Check size={14} /> : <Play size={13} />}</span>
                <span><strong>{run.completedAt ? "Completed" : "In progress"}</strong><small>{formatDateTime(run.completedAt ?? run.startedAt)}</small></span>
                <span className="history-count">{run.checkedCount}/{run.itemCount}</span>
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
}

function RunScreen({ run, error, onBack, onToggle, onComplete }: {
  run: ChecklistRun;
  error: string;
  onBack: () => void;
  onToggle: (id: string, checked: boolean) => void;
  onComplete: () => void;
}) {
  const percent = run.itemCount ? Math.round((run.checkedCount / run.itemCount) * 100) : 0;
  const complete = Boolean(run.completedAt);
  return (
    <section className="workspace run-workspace">
      <header className="run-header">
        <button className="icon-button light" onClick={onBack} aria-label="Back"><ArrowLeft size={21} /></button>
        <div><p>{complete ? "Run completed" : "Checklist in progress"}</p><h1>{run.checklistTitle}</h1></div>
        <span className="run-fraction">{run.checkedCount}/{run.itemCount}</span>
      </header>
      <div className="run-progress"><span style={{ width: `${percent}%` }} /></div>
      <div className="run-content">
        <p className="run-date">Started {formatDateTime(run.startedAt)}</p>
        <div className="run-items">
          {run.items.map((item) => (
            <div className={item.checked ? "run-item checked" : "run-item"} key={item.id}>
              <button
                className="run-checkbox"
                type="button"
                aria-label={`${item.checked ? "Uncheck" : "Check"} ${item.label}`}
                aria-pressed={item.checked}
                disabled={complete}
                onClick={() => onToggle(item.id, !item.checked)}
              >
                {item.checked ? <Check size={21} strokeWidth={3} /> : null}
              </button>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
        {error ? <p className="inline-error">{error}</p> : null}
        {complete ? (
          <div className="completion-card"><CheckCircle2 size={30} /><div><strong>Run saved</strong><p>Completed {formatDateTime(run.completedAt!)}</p></div></div>
        ) : (
          <button className="complete-run-button" type="button" onClick={onComplete}><CheckCircle2 size={20} />Finish and save run</button>
        )}
      </div>
    </section>
  );
}

function ChecklistEditor({ checklist, onClose, onSave }: {
  checklist: Checklist | null;
  onClose: () => void;
  onSave: (input: CreateChecklistInput) => Promise<void>;
}) {
  const [title, setTitle] = useState(checklist?.title ?? "");
  const [description, setDescription] = useState(checklist?.description ?? "");
  const [itemsText, setItemsText] = useState(checklist?.items.map((item) => item.label).join("\n") ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const cleanItems = useMemo(() => itemsText.split(/\r?\n/).map((item) => item.trim()).filter(Boolean), [itemsText]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onSave({ title: title.trim(), description: description.trim(), items: cleanItems });
    } catch (cause) {
      setError(message(cause));
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop editor-backdrop" role="presentation" onMouseDown={onClose}>
      <form className="checklist-editor" onSubmit={(event) => void submit(event)} onMouseDown={(event) => event.stopPropagation()}>
        <header><div><p className="eyebrow">{checklist ? "Edit template" : "New template"}</p><h2>{checklist ? checklist.title : "Create a checklist"}</h2></div><button type="button" className="icon-button" onClick={onClose}><X size={20} /></button></header>
        <label>Title<input autoFocus value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} placeholder="Weekend packing" /></label>
        <label>Description <span className="optional">Optional</span><textarea value={description} maxLength={1000} onChange={(event) => setDescription(event.target.value)} placeholder="A quick note about when to use this list" /></label>
        <label>Items <span className="optional">One item per line</span><textarea className="items-textarea" value={itemsText} onChange={(event) => setItemsText(event.target.value)} placeholder={'Passport\nPhone charger\nWalking shoes'} spellCheck /></label>
        {error ? <p className="inline-error">{error}</p> : null}
        <footer><button className="secondary-button touch-button" type="button" onClick={onClose}>Cancel</button><button className="primary-button touch-button" type="submit" disabled={saving || !title.trim() || cleanItems.length === 0}>{saving ? "Saving…" : "Save checklist"}</button></footer>
      </form>
    </div>
  );
}

function message(cause: unknown) {
  return cause instanceof Error ? cause.message : "Something went wrong";
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

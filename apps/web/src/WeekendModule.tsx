import { useEffect, useState, type DragEvent, type FormEvent } from "react";
import { ArrowLeft, ArrowUpToLine, Check, GripVertical, History, Plus, Trash2 } from "lucide-react";
import { dateKey, nextWeekendDay, weekendBuckets, type WeekendChore } from "@homeos/shared";
import { addWeekendChore, changeWeekendChore, getWeekendChores, removeWeekendChore } from "./api";
import { currentNavigation, pushNavigation } from "./navigation";

const labelDay = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric", year: "numeric" });
const historyDay = (chore: WeekendChore) => chore.day ?? dateKey(new Date(chore.completedAt!));

export function WeekendModule() {
  const [chores, setChores] = useState<WeekendChore[]>([]);
  const [history, setHistory] = useState(() => !!currentNavigation().weekendHistory);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [text, setText] = useState("");
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [today, setToday] = useState(() => dateKey(new Date()));
  useEffect(() => {
    let active = true;
    getWeekendChores().then(result => { if (active) setChores(result.chores); }).catch(cause => { if (active) setError(String(cause.message ?? cause)); }).finally(() => { if (active) setLoading(false); });
    const pop = () => setHistory(!!currentNavigation().weekendHistory);
    const timer = window.setInterval(() => setToday(dateKey(new Date())), 60_000);
    window.addEventListener("popstate", pop);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener("popstate", pop); };
  }, []);
  async function mutate(operation: () => Promise<{ chores: WeekendChore[] }>): Promise<boolean> {
    if (busy) return false;
    setBusy(true); setError("");
    try { setChores((await operation()).chores); return true; }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save activities"); return false; }
    finally { setBusy(false); }
  }
  function navigate(showHistory: boolean) { pushNavigation({ module: "weekend", weekendHistory: showHistory }); setHistory(showHistory); }
  const open = chores.filter(c => !c.completedAt);
  const days = weekendBuckets(open, new Date(`${today}T12:00:00`));
  const completed = chores.filter(c => c.completedAt).sort((a, b) => historyDay(b).localeCompare(historyDay(a)) || a.position - b.position);
  const groups = [...new Set(completed.map(historyDay))];
  const move = (id: string, day: string | null, beforeId?: string) => { if (id !== beforeId) void mutate(() => changeWeekendChore(id, { action: "move", day, beforeId })); };
  function drop(event: DragEvent, day: string | null, beforeId?: string) {
    event.preventDefault(); event.stopPropagation();
    const id = event.dataTransfer.getData("application/x-homeos-chore") || dragging;
    setDragging(null); setOver(null);
    if (id && !busy) move(id, day, beforeId);
  }
  async function add(event: FormEvent) { event.preventDefault(); if (text.trim() && await mutate(() => addWeekendChore(text.trim()))) setText(""); }
  function row(chore: WeekendChore, siblings: WeekendChore[]) {
    const index = siblings.findIndex(c => c.id === chore.id);
    return <li key={chore.id} className={`weekend-chore ${dragging === chore.id ? "dragging" : ""} ${over === chore.id ? "drag-over" : ""}`}
      draggable={!busy} onDragStart={event => { setDragging(chore.id); event.dataTransfer.setData("application/x-homeos-chore", chore.id); event.dataTransfer.effectAllowed = "move"; }}
      onDragEnd={() => { setDragging(null); setOver(null); }} onDragOver={event => { if (!busy && dragging) { event.preventDefault(); event.stopPropagation(); setOver(chore.id); } }} onDrop={event => drop(event, chore.day, chore.id)}>
      <GripVertical size={16} className="chore-grip" aria-hidden="true" /><span className="chore-text">{chore.text}</span>
      <div className="chore-actions">
        <button className="icon-button" disabled={busy || index === 0} aria-label={`Move ${chore.text} up`} title="Move up" onClick={() => move(chore.id, chore.day, siblings[index - 1]?.id)}><ArrowUpToLine size={16} /></button>
        {chore.day ? <><button className="secondary-button" disabled={busy} onClick={() => move(chore.id, nextWeekendDay(chore.day!))} title="Move to next weekend day">Next day</button><button className="secondary-button" disabled={busy} onClick={() => move(chore.id, null, open.find(c => c.day === null)?.id)} title="Return to top of activity list">To list</button></> : null}
        <select aria-label={`Schedule ${chore.text}`} value={chore.day ?? ""} disabled={busy} onChange={event => move(chore.id, event.target.value || null)}><option value="">Unscheduled</option>{days.map(day => <option key={day} value={day}>{labelDay(day)}</option>)}</select>
        <button className="icon-button" disabled={busy} aria-label={`Done: ${chore.text}`} title="Done" onClick={() => void mutate(() => changeWeekendChore(chore.id, { action: "done" }))}><Check size={18} /></button>
        <button className="icon-button danger" disabled={busy} aria-label={`Delete ${chore.text}`} title="Delete" onClick={() => void mutate(() => removeWeekendChore(chore.id))}><Trash2 size={16} /></button>
      </div>
    </li>;
  }
  function bucket(day: string | null) {
    const items = open.filter(c => c.day === day);
    const key = day ?? "list";
    return <section key={key} className={`weekend-bucket ${over === key ? "drag-over" : ""}`} aria-label={day ? labelDay(day) : "Activity list"}
      onDragOver={event => { if (dragging && !busy) { event.preventDefault(); setOver(key); } }} onDrop={event => drop(event, day)}>
      <div className="weekend-bucket-heading"><h2>{day ? labelDay(day) : "Activities to plan"}</h2><span>{items.length}</span></div>
      {day && day < today ? <p className="weekend-hint">Still to do · move these forward when you’re ready.</p> : null}
      {items.length ? <ul className="weekend-chore-list">{items.map(c => row(c, items))}</ul> : <p className="weekend-drop-hint">{day ? "Drop activities here, or choose this day from an activity’s menu." : "Add an activity below, or drag one back here."}</p>}
    </section>;
  }
  return <section className="workspace weekend-workspace">
    <header className="topbar"><div><p className="eyebrow">Household · a little room for the weekend</p><h1>{history ? "Activity history" : "Weekend activity planner"}</h1></div><button className="secondary-button touch-button" onClick={() => navigate(!history)}>{history ? <ArrowLeft size={17} /> : <History size={17} />}{history ? "Planner" : "History"}</button></header>
    <div className="weekend-content">
      {error ? <p className="inline-error" role="alert">{error}</p> : null}
      <p className="weekend-hint" role="status">{loading ? "Loading activities…" : busy ? "Saving…" : history ? `${completed.length} activities completed` : "Drag activities into a day and rearrange them. Use the menu and up button on touchscreens or with a keyboard."}</p>
      {!loading && (history ? <>
        {!completed.length ? <div className="empty-state"><h2>A fresh start</h2><p>Finished activities will appear under their scheduled dates.</p></div> : groups.map(day => <section className="weekend-bucket" key={day}>
          <h2>{labelDay(day)}</h2>
          <ul className="weekend-chore-list">{completed.filter(c => historyDay(c) === day).map(c => <li className="weekend-history-row" key={c.id}>
            <Check size={18} />
            <div><strong>{c.text}</strong><p>{c.day ? `Planned for ${labelDay(c.day)}` : `Unscheduled · Marked complete ${new Date(c.completedAt!).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`}</p></div>
          </li>)}</ul>
        </section>)}
      </> : <>
        <div className="weekend-days">{days.map(day => bucket(day))}</div>
        {bucket(null)}
        <form className="todo-add" onSubmit={event => void add(event)}><label htmlFor="weekend-new-chore">Add an activity</label><div><input id="weekend-new-chore" value={text} maxLength={500} disabled={busy} onChange={event => setText(event.target.value)} placeholder="What would you like to do?" /><button className="primary-button" disabled={busy || !text.trim()}><Plus size={18} />Add</button></div></form>
      </>)}
    </div>
  </section>;
}

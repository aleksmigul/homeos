import { Check, CheckCircle2, Circle, Loader2, Plus } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Todo } from "@homeos/shared";
import { createTodo, listTodos, updateTodo } from "./api";

export function TodoModule() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const open = useMemo(() => todos.filter((todo) => !todo.completedAt), [todos]);
  const completed = useMemo(() => todos.filter((todo) => todo.completedAt), [todos]);

  useEffect(() => { void refresh(); }, []);
  async function refresh() { setLoading(true); try { setTodos((await listTodos()).todos); } catch (cause) { setError(message(cause)); } finally { setLoading(false); } }

  async function add(event: FormEvent) {
    event.preventDefault(); const clean = text.trim(); if (!clean) return;
    setAdding(true); setError("");
    try { const { todo } = await createTodo(clean); setTodos((current) => [todo, ...current]); setText(""); }
    catch (cause) { setError(message(cause)); }
    finally { setAdding(false); }
  }

  async function toggle(todo: Todo) {
    const completedAt = todo.completedAt ? null : new Date().toISOString();
    setTodos((current) => sortTodos(current.map((item) => item.id === todo.id ? { ...item, completedAt } : item)));
    try { const response = await updateTodo(todo.id, !todo.completedAt); setTodos((current) => sortTodos(current.map((item) => item.id === todo.id ? response.todo : item))); }
    catch (cause) { setError(message(cause)); await refresh(); }
  }

  return <section className="workspace todo-workspace">
    <header className="topbar todo-topbar"><div><p className="eyebrow">Just for you</p><h1>To-dos</h1></div><span className="todo-count">{open.length} open</span></header>
    <div className="todo-layout">
      <form className="todo-add" onSubmit={(event) => void add(event)}><label htmlFor="new-todo">Add a to-do</label><div><input id="new-todo" value={text} maxLength={500} onChange={(event) => setText(event.target.value)} placeholder="What needs doing?" autoComplete="off" /><button className="primary-button add-action" disabled={adding || !text.trim()}>{adding ? <Loader2 className="spin" size={18} /> : <Plus size={18} />}<span>Add</span></button></div></form>
      {error ? <p className="inline-error">{error}</p> : null}
      {loading ? <div className="skeleton-card" /> : null}
      {!loading && !todos.length ? <div className="todo-empty"><CheckCircle2 size={31} /><h2>Nothing waiting</h2><p>Add one thing at a time. Completed work will remain below with its timing.</p></div> : null}
      {open.length ? <section className="todo-section"><div className="todo-section-heading"><h2>Open</h2><span>{open.length}</span></div><div className="todo-list">{open.map((todo) => <TodoRow todo={todo} onToggle={toggle} key={todo.id} />)}</div></section> : null}
      {completed.length ? <section className="todo-section completed"><div className="todo-section-heading"><h2>Completed</h2><span>{completed.length}</span></div><div className="todo-list">{completed.map((todo) => <TodoRow todo={todo} onToggle={toggle} key={todo.id} />)}</div></section> : null}
    </div>
  </section>;
}

function TodoRow({ todo, onToggle }: { todo: Todo; onToggle: (todo: Todo) => void }) {
  return <article className={todo.completedAt ? "todo-row checked" : "todo-row"}><button type="button" className="todo-check" aria-label={todo.completedAt ? "Mark incomplete" : "Mark complete"} onClick={() => void onToggle(todo)}>{todo.completedAt ? <Check size={19} strokeWidth={3} /> : <Circle size={22} />}</button><div><strong>{todo.text}</strong><div className="todo-dates"><span>Created {formatDateTime(todo.createdAt)}</span>{todo.completedAt ? <><span>Completed {formatDateTime(todo.completedAt)}</span><span className="todo-duration">Took {formatDuration(new Date(todo.completedAt).getTime() - new Date(todo.createdAt).getTime())}</span></> : null}</div></div></article>;
}

function sortTodos(items: Todo[]) { return [...items].sort((a, b) => { if (!a.completedAt && !b.completedAt) return b.createdAt.localeCompare(a.createdAt); if (!a.completedAt) return -1; if (!b.completedAt) return 1; return b.completedAt.localeCompare(a.completedAt); }); }
function formatDateTime(value: string) { return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
function formatDuration(milliseconds: number) { const minutes = Math.max(0, Math.round(milliseconds / 60000)); if (minutes < 1) return "less than 1 min"; if (minutes < 60) return `${minutes} min`; const hours = Math.floor(minutes / 60); const rest = minutes % 60; if (hours < 24) return rest ? `${hours}h ${rest}m` : `${hours}h`; const days = Math.floor(hours / 24); const remainingHours = hours % 24; return remainingHours ? `${days}d ${remainingHours}h` : `${days}d`; }
function message(cause: unknown) { return cause instanceof Error ? cause.message : "Something went wrong"; }

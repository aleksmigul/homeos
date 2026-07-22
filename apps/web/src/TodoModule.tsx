import { ArrowLeft, Check, CheckCircle2, ChevronRight, Circle, ListTodo, Loader2, Pencil, Plus, X } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Todo, TodoList, TodoListSummary } from "@homeos/shared";
import { createTodo, createTodoList, getTodoList, listTodoLists, renameTodoList, updateTodo } from "./api";
import { currentNavigation, pushNavigation } from "./navigation";

export function TodoModule() {
  const [lists, setLists] = useState<TodoListSummary[]>([]);
  const [selected, setSelected] = useState<TodoList | null>(null);
  const [newListTitle, setNewListTitle] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void refreshLists();
    const initialId = currentNavigation().todoListId; if (initialId) void loadList(initialId, false);
    const onPopState = () => { const id = currentNavigation().todoListId; setNewListTitle(null); if (id) void loadList(id, false); else { setSelected(null); void refreshLists(); } };
    window.addEventListener("popstate", onPopState); return () => window.removeEventListener("popstate", onPopState);
  }, []);

  async function refreshLists() { setLoading(true); try { setLists((await listTodoLists()).todoLists); } catch (cause) { setError(message(cause)); } finally { setLoading(false); } }
  async function loadList(id: string, addHistory: boolean) { setLoading(true); try { const { todoList } = await getTodoList(id); setSelected(todoList); if (addHistory) pushNavigation({ module: "todos", todoListId: id }); } catch (cause) { setError(message(cause)); } finally { setLoading(false); } }

  async function makeList(event: FormEvent) { event.preventDefault(); const title = newListTitle?.trim(); if (!title) return; try { const { todoList } = await createTodoList(title); setNewListTitle(null); await loadList(todoList.id, true); } catch (cause) { setError(message(cause)); } }
  if (selected) return <TodoListDetail list={selected} loading={loading} error={error} onBack={() => window.history.back()} onChange={setSelected} />;

  return <section className="workspace todo-workspace">
    <header className="topbar todo-topbar"><div><p className="eyebrow">Just for you</p><h1>To-dos</h1></div><button className="primary-button touch-button add-action" onClick={() => setNewListTitle("")}><Plus size={18} /><span>New list</span></button></header>
    <div className="todo-library">
      {error ? <p className="inline-error">{error}</p> : null}{loading ? <div className="skeleton-card" /> : null}
      {!loading && !lists.length ? <div className="todo-empty"><CheckCircle2 size={31} /><h2>No lists yet</h2><p>Create a list for work, home, someday, or anything else.</p></div> : null}
      <div className="todo-list-grid">{lists.map((list) => <button className="todo-list-card" key={list.id} onClick={() => void loadList(list.id, true)}><span className="todo-list-icon"><ListTodo size={20} /></span><span><strong>{list.title}</strong><small>{list.openCount} open · {list.completedCount} completed</small><time>Active {formatRelative(list.updatedAt)}</time></span><ChevronRight size={18} /></button>)}</div>
    </div>
    {newListTitle !== null ? <div className="modal-backdrop"><form className="compact-dialog" onSubmit={(event) => void makeList(event)}><button className="dialog-close" type="button" onClick={() => setNewListTitle(null)}><X size={19} /></button><p className="eyebrow">Personal to-dos</p><h2>New list</h2><label>Name<input autoFocus value={newListTitle} maxLength={120} onChange={(event) => setNewListTitle(event.target.value)} placeholder="Work" /></label><button className="primary-button" disabled={!newListTitle.trim()}>Create list</button></form></div> : null}
  </section>;
}

function TodoListDetail({ list, loading, error, onBack, onChange }: { list: TodoList; loading: boolean; error: string; onBack: () => void; onChange: (list: TodoList) => void }) {
  const [text, setText] = useState(""); const [adding, setAdding] = useState(false); const [localError, setLocalError] = useState(""); const [renameTitle, setRenameTitle] = useState<string | null>(null);
  const open = useMemo(() => list.todos.filter((todo) => !todo.completedAt), [list]); const completed = useMemo(() => list.todos.filter((todo) => todo.completedAt), [list]);
  async function add(event: FormEvent) { event.preventDefault(); const clean = text.trim(); if (!clean) return; setAdding(true); try { const { todo } = await createTodo(list.id, clean); onChange({ ...list, todos: [todo, ...list.todos], openCount: list.openCount + 1, updatedAt: todo.createdAt }); setText(""); } catch (cause) { setLocalError(message(cause)); } finally { setAdding(false); } }
  async function toggle(todo: Todo) { const nextCompleted = !todo.completedAt; const optimistic = { ...todo, completedAt: nextCompleted ? new Date().toISOString() : null }; onChange(updateListTodo(list, optimistic)); try { const response = await updateTodo(todo.id, nextCompleted); onChange(updateListTodo(list, response.todo)); } catch (cause) { setLocalError(message(cause)); onChange(list); } }
  async function submitRename(event: FormEvent) { event.preventDefault(); if (!renameTitle?.trim()) return; try { onChange((await renameTodoList(list.id, renameTitle.trim())).todoList); setRenameTitle(null); } catch (cause) { setLocalError(message(cause)); } }
  return <section className="workspace todo-workspace"><header className="topbar detail-topbar todo-detail-topbar"><button className="icon-button" onClick={onBack}><ArrowLeft size={20} /></button><div className="detail-title"><p className="eyebrow">Personal list</p><h1>{list.title}</h1></div><button className="secondary-button touch-button" onClick={() => setRenameTitle(list.title)}><Pencil size={16} />Rename</button></header><div className="todo-layout">
    <form className="todo-add" onSubmit={(event) => void add(event)}><label htmlFor="new-todo">Add a to-do</label><div><input id="new-todo" value={text} maxLength={500} onChange={(event) => setText(event.target.value)} placeholder="What needs doing?" autoComplete="off" /><button className="primary-button add-action" disabled={adding || !text.trim()}>{adding ? <Loader2 className="spin" size={18} /> : <Plus size={18} />}<span>Add</span></button></div></form>
    {error || localError ? <p className="inline-error">{localError || error}</p> : null}{loading ? <div className="skeleton-card" /> : null}
    {!loading && !list.todos.length ? <div className="todo-empty"><CheckCircle2 size={31} /><h2>Nothing waiting</h2><p>Add one thing at a time. Completed work will remain below with its timing.</p></div> : null}
    {open.length ? <TodoSection title="Open" todos={open} onToggle={toggle} /> : null}{completed.length ? <TodoSection title="Completed" todos={completed} onToggle={toggle} completed /> : null}
  </div>{renameTitle !== null ? <div className="modal-backdrop"><form className="compact-dialog" onSubmit={(event) => void submitRename(event)}><button className="dialog-close" type="button" onClick={() => setRenameTitle(null)}><X size={19} /></button><p className="eyebrow">To-do list</p><h2>Rename list</h2><label>Name<input autoFocus value={renameTitle} maxLength={120} onChange={(event) => setRenameTitle(event.target.value)} /></label><button className="primary-button" disabled={!renameTitle.trim()}>Save name</button></form></div> : null}</section>;
}

function TodoSection({ title, todos, completed, onToggle }: { title: string; todos: Todo[]; completed?: boolean; onToggle: (todo: Todo) => void }) { return <section className={completed ? "todo-section completed" : "todo-section"}><div className="todo-section-heading"><h2>{title}</h2><span>{todos.length}</span></div><div className="todo-list">{todos.map((todo) => <TodoRow todo={todo} onToggle={onToggle} key={todo.id} />)}</div></section>; }
function TodoRow({ todo, onToggle }: { todo: Todo; onToggle: (todo: Todo) => void }) { return <article className={todo.completedAt ? "todo-row checked" : "todo-row"}><button type="button" className="todo-check" aria-label={todo.completedAt ? "Mark incomplete" : "Mark complete"} onClick={() => void onToggle(todo)}>{todo.completedAt ? <Check size={19} strokeWidth={3} /> : <Circle size={22} />}</button><div><strong>{todo.text}</strong><div className="todo-dates"><span>Created {formatDateTime(todo.createdAt)}</span>{todo.completedAt ? <><span>Completed {formatDateTime(todo.completedAt)}</span><span className="todo-duration">Took {formatDuration(new Date(todo.completedAt).getTime() - new Date(todo.createdAt).getTime())}</span></> : null}</div></div></article>; }
function updateListTodo(list: TodoList, todo: Todo): TodoList { const todos = sortTodos(list.todos.map((item) => item.id === todo.id ? todo : item)); return { ...list, todos, openCount: todos.filter((item) => !item.completedAt).length, completedCount: todos.filter((item) => item.completedAt).length, updatedAt: new Date().toISOString() }; }
function sortTodos(items: Todo[]) { return [...items].sort((a, b) => { if (!a.completedAt && !b.completedAt) return b.createdAt.localeCompare(a.createdAt); if (!a.completedAt) return -1; if (!b.completedAt) return 1; return b.completedAt.localeCompare(a.completedAt); }); }
function formatDateTime(value: string) { return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
function formatRelative(value: string) { const elapsed = Date.now() - new Date(value).getTime(); const minutes = Math.max(0, Math.floor(elapsed / 60000)); if (minutes < 1) return "just now"; if (minutes < 60) return `${minutes}m ago`; const hours = Math.floor(minutes / 60); if (hours < 24) return `${hours}h ago`; const days = Math.floor(hours / 24); return days < 7 ? `${days}d ago` : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value)); }
function formatDuration(milliseconds: number) { const minutes = Math.max(0, Math.round(milliseconds / 60000)); if (minutes < 1) return "less than 1 min"; if (minutes < 60) return `${minutes} min`; const hours = Math.floor(minutes / 60); const rest = minutes % 60; if (hours < 24) return rest ? `${hours}h ${rest}m` : `${hours}h`; const days = Math.floor(hours / 24); const remainingHours = hours % 24; return remainingHours ? `${days}d ${remainingHours}h` : `${days}d`; }
function message(cause: unknown) { return cause instanceof Error ? cause.message : "Something went wrong"; }

import { randomUUID } from "node:crypto";
import type { Todo, TodoList, TodoListSummary } from "@homeos/shared";
import { all, get, run, writeTransaction } from "./db.js";

type TodoRow = { id: string; list_id: string; text_content: string; created_at: string; completed_at: string | null };
type ListRow = { id: string; title: string; is_shared: number; open_count: number; completed_count: number; created_at: string; updated_at: string };
const mapTodo = (row: TodoRow): Todo => ({ id: row.id, listId: row.list_id, text: row.text_content, createdAt: row.created_at, completedAt: row.completed_at });
const mapList = (row: ListRow): TodoListSummary => ({ id: row.id, title: row.title, shared: Boolean(row.is_shared), openCount: Number(row.open_count), completedCount: Number(row.completed_count), createdAt: row.created_at, updatedAt: row.updated_at });
const listSelect = `SELECT l.id, l.title, l.is_shared, l.created_at, l.updated_at, SUM(CASE WHEN t.id IS NOT NULL AND t.completed_at IS NULL THEN 1 ELSE 0 END) AS open_count, SUM(CASE WHEN t.completed_at IS NOT NULL THEN 1 ELSE 0 END) AS completed_count FROM todo_lists l LEFT JOIN todos t ON t.list_id = l.id`;

function ensureTodoList(ownerEmail: string) {
  const existing = get<{ id: string }>("SELECT id FROM todo_lists WHERE owner_email = $owner AND is_shared = 0 ORDER BY updated_at DESC LIMIT 1", { $owner: ownerEmail });
  if (existing) return existing.id;
  return createTodoList(ownerEmail, "Personal").id;
}

export function listTodoLists(ownerEmail: string) {
  ensureTodoList(ownerEmail);
  return all<ListRow>(`${listSelect} WHERE l.owner_email = $owner AND l.is_shared = 0 GROUP BY l.id ORDER BY l.updated_at DESC`, { $owner: ownerEmail }).map(mapList);
}

export function getSharedTodoList() {
  let existing = get<{ id: string }>("SELECT id FROM todo_lists WHERE is_shared = 1 LIMIT 1");
  if (!existing) {
    const id = randomUUID(); const now = new Date().toISOString();
    writeTransaction(() => run("INSERT INTO todo_lists (id, owner_email, title, is_shared, created_at, updated_at) VALUES ($id, 'household', 'Shared to-dos', 1, $now, $now)", { $id: id, $now: now }));
    existing = { id };
  }
  return getTodoList("", existing.id)!;
}

export function createTodoList(ownerEmail: string, title: string) {
  const id = randomUUID(); const now = new Date().toISOString();
  writeTransaction(() => run("INSERT INTO todo_lists (id, owner_email, title, created_at, updated_at) VALUES ($id, $owner, $title, $now, $now)", { $id: id, $owner: ownerEmail, $title: title, $now: now }));
  return mapList({ id, title, is_shared: 0, open_count: 0, completed_count: 0, created_at: now, updated_at: now });
}

export function renameTodoList(ownerEmail: string, id: string, title: string) {
  if (!get("SELECT id FROM todo_lists WHERE id = $id AND owner_email = $owner AND is_shared = 0", { $id: id, $owner: ownerEmail })) return null;
  const now = new Date().toISOString();
  writeTransaction(() => run("UPDATE todo_lists SET title = $title, updated_at = $now WHERE id = $id AND owner_email = $owner", { $title: title, $now: now, $id: id, $owner: ownerEmail }));
  return getTodoList(ownerEmail, id);
}

function listTodos(listId: string) {
  return all<TodoRow>(`SELECT id, list_id, text_content, created_at, completed_at FROM todos WHERE list_id = $listId
    ORDER BY CASE WHEN completed_at IS NULL THEN 0 ELSE 1 END, CASE WHEN completed_at IS NULL THEN created_at END DESC, completed_at DESC`, { $listId: listId }).map(mapTodo);
}

export function getTodoList(ownerEmail: string, id: string): TodoList | null {
  const row = get<ListRow>(`${listSelect} WHERE l.id = $id AND (l.owner_email = $owner OR l.is_shared = 1) GROUP BY l.id`, { $id: id, $owner: ownerEmail });
  return row ? { ...mapList(row), todos: listTodos(id) } : null;
}

export function createTodo(ownerEmail: string, listId: string, text: string) {
  if (!get("SELECT id FROM todo_lists WHERE id = $id AND (owner_email = $owner OR is_shared = 1)", { $id: listId, $owner: ownerEmail })) return null;
  const todo: Todo = { id: randomUUID(), listId, text, createdAt: new Date().toISOString(), completedAt: null };
  writeTransaction(() => { run("INSERT INTO todos (id, owner_email, list_id, text_content, created_at) VALUES ($id, $owner, $listId, $text, $createdAt)", { $id: todo.id, $owner: ownerEmail, $listId: listId, $text: todo.text, $createdAt: todo.createdAt }); run("UPDATE todo_lists SET updated_at = $updatedAt WHERE id = $listId", { $updatedAt: todo.createdAt, $listId: listId }); });
  return todo;
}

export function setTodoCompleted(ownerEmail: string, id: string, completed: boolean) {
  const row = get<TodoRow>("SELECT t.id, t.list_id, t.text_content, t.created_at, t.completed_at FROM todos t JOIN todo_lists l ON l.id = t.list_id WHERE t.id = $id AND (l.owner_email = $owner OR l.is_shared = 1)", { $id: id, $owner: ownerEmail });
  if (!row) return null;
  const now = new Date().toISOString(); const completedAt = completed ? now : null;
  writeTransaction(() => { run("UPDATE todos SET completed_at = $completedAt WHERE id = $id", { $completedAt: completedAt, $id: id }); run("UPDATE todo_lists SET updated_at = $now WHERE id = $listId", { $now: now, $listId: row.list_id }); });
  return mapTodo({ ...row, completed_at: completedAt });
}

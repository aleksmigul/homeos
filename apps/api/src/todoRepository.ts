import { randomUUID } from "node:crypto";
import type { Todo } from "@homeos/shared";
import { all, get, run, writeTransaction } from "./db.js";

type TodoRow = { id: string; text_content: string; created_at: string; completed_at: string | null };
const mapTodo = (row: TodoRow): Todo => ({ id: row.id, text: row.text_content, createdAt: row.created_at, completedAt: row.completed_at });

export function listTodos(ownerEmail: string) {
  return all<TodoRow>(`SELECT id, text_content, created_at, completed_at FROM todos WHERE owner_email = $owner
    ORDER BY CASE WHEN completed_at IS NULL THEN 0 ELSE 1 END,
      CASE WHEN completed_at IS NULL THEN created_at END DESC,
      completed_at DESC`, { $owner: ownerEmail }).map(mapTodo);
}

export function createTodo(ownerEmail: string, text: string) {
  const todo: Todo = { id: randomUUID(), text, createdAt: new Date().toISOString(), completedAt: null };
  writeTransaction(() => run("INSERT INTO todos (id, owner_email, text_content, created_at) VALUES ($id, $owner, $text, $createdAt)", { $id: todo.id, $owner: ownerEmail, $text: todo.text, $createdAt: todo.createdAt }));
  return todo;
}

export function setTodoCompleted(ownerEmail: string, id: string, completed: boolean) {
  const row = get<TodoRow>("SELECT id, text_content, created_at, completed_at FROM todos WHERE id = $id AND owner_email = $owner", { $id: id, $owner: ownerEmail });
  if (!row) return null;
  const completedAt = completed ? new Date().toISOString() : null;
  writeTransaction(() => run("UPDATE todos SET completed_at = $completedAt WHERE id = $id AND owner_email = $owner", { $completedAt: completedAt, $id: id, $owner: ownerEmail }));
  return mapTodo({ ...row, completed_at: completedAt });
}

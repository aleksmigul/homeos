import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

test("deletion cleans up children, preserves run snapshots, and enforces todo ownership", async () => {
  const directory = await fs.mkdtemp(path.join(process.cwd(), ".deletion-test-"));
  process.env.DATABASE_PATH = path.join(directory, "test.db");
  try {
    const db = await import("./db.js");
    const c = await import("./checklistRepository.js");
    const t = await import("./todoRepository.js");
    await db.initializeDatabase();
    const checklist = c.createChecklist({ title: "Packing", items: ["Passport", "Charger"] });
    const firstRun = c.startChecklistRun(checklist.id)!;
    const secondRun = c.startChecklistRun(checklist.id)!;
    assert.equal(c.deleteChecklistItem(checklist.items[0].id)!.itemCount, 1);
    assert.equal(c.getChecklistRun(firstRun.id)!.itemCount, 2);
    assert.equal(c.deleteChecklistItem(checklist.items[1].id)!.itemCount, 0);
    assert.equal(c.deleteChecklistRun(firstRun.id), true);
    assert.equal(c.getChecklistRun(firstRun.id), null);
    assert.equal(c.deleteChecklist(checklist.id), true);
    assert.equal(c.getChecklistRun(secondRun.id), null);
    assert.equal(c.deleteChecklist(checklist.id), false);
    assert.equal(c.deleteChecklistItem("missing"), null);
    assert.equal(db.all("SELECT * FROM checklist_run_items WHERE run_id IN ($first, $second)", { $first: firstRun.id, $second: secondRun.id }).length, 0);
    assert.equal(db.all("SELECT * FROM checklist_items WHERE checklist_id = $id", { $id: checklist.id }).length, 0);

    const list = t.createTodoList("alice", "Private");
    const todo = t.createTodo("alice", list.id, "Call")!;
    assert.equal(t.deleteTodo("bob", todo.id), null);
    assert.equal(t.deleteTodoList("bob", list.id), false);
    t.setTodoCompleted("alice", todo.id, true);
    assert.equal(t.deleteTodo("alice", todo.id)!.completedCount, 0);
    t.createTodo("alice", list.id, "Another");
    assert.equal(t.deleteTodoList("alice", list.id), true);
    assert.equal(t.getTodoList("alice", list.id), null);
    assert.equal(t.listTodoLists("alice").length, 0);
    assert.equal(db.all("SELECT * FROM todos WHERE list_id = $id", { $id: list.id }).length, 0);
    const shared = t.getSharedTodoList();
    const sharedTodo = t.createTodo("alice", shared.id, "Household task")!;
    assert.equal(t.deleteTodo("bob", sharedTodo.id)!.openCount, 0);
    t.createTodo("alice", shared.id, "Another household task");
    assert.equal(t.deleteTodoList("bob", shared.id), true);
    assert.equal(t.getSharedTodoList().todos.length, 0);
    assert.equal(db.all("PRAGMA foreign_key_check").length, 0);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

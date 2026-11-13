import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("automation catalog covers every user-facing module and executes advertised actions", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "homeos-automation-test-"));
  process.env.DATABASE_PATH = path.join(directory, "homeos.db");
  process.env.AUTH_ALLOWED_EMAILS = "agent@example.com";

  try {
    const { initializeDatabase } = await import("./db.js");
    const { automationModules } = await import("./routes/automation.js");
    await initializeDatabase();

    assert.deepEqual(automationModules.map((module) => module.id), [
      "checklists",
      "todos",
      "shopping",
      "travel",
      "bookmarks",
      "voice-notes"
    ]);

    for (const module of automationModules) {
      assert.ok(module.description);
      assert.ok(module.contentDescription);
      assert.doesNotThrow(() => module.content("agent@example.com"));
      for (const advertised of Object.values(module.actions)) {
        assert.equal(advertised.input.type, "object");
        assert.ok(advertised.description);
      }
    }

    const shopping = automationModules.find((module) => module.id === "shopping")!;
    const addItems = shopping.actions.addItems;
    const added = addItems.run(addItems.parse({ items: ["Milk", "milk", "Bread"] }), "agent@example.com") as {
      addedItems: Array<{ label: string }>;
      skippedCount: number;
    };
    assert.deepEqual(added.addedItems.map((item) => item.label), ["Milk", "Bread"]);
    assert.equal(added.skippedCount, 1);
    assert.throws(() => addItems.parse({ items: [] }));

    const todos = automationModules.find((module) => module.id === "todos")!;
    const todoContent = todos.content("agent@example.com") as { todoLists: Array<{ id: string; shared: boolean }> };
    const sharedList = todoContent.todoLists.find((list) => list.shared)!;
    const addTodo = todos.actions.addTodo;
    const result = addTodo.run(addTodo.parse({ listId: sharedList.id, text: "Water plants" }), "agent@example.com") as { todo: { text: string } };
    assert.equal(result.todo.text, "Water plants");

    const secondUserTodoContent = todos.content("family@example.com") as { todoLists: Array<{ id: string; shared: boolean; todos: Array<{ text: string }> }> };
    const secondUserSharedList = secondUserTodoContent.todoLists.find((list) => list.shared)!;
    assert.equal(secondUserSharedList.id, sharedList.id);
    assert.deepEqual(secondUserSharedList.todos.map((todo) => todo.text), ["Water plants"]);

    const createList = todos.actions.createList;
    createList.run(createList.parse({ title: "Agent private" }), "agent@example.com");
    const firstUserLists = (todos.content("agent@example.com") as { todoLists: Array<{ title: string }> }).todoLists;
    const secondUserLists = (todos.content("family@example.com") as { todoLists: Array<{ title: string }> }).todoLists;
    assert.ok(firstUserLists.some((list) => list.title === "Agent private"));
    assert.ok(!secondUserLists.some((list) => list.title === "Agent private"));

    const bookmarks = automationModules.find((module) => module.id === "bookmarks")!;
    const createBookmark = bookmarks.actions.create;
    createBookmark.run(createBookmark.parse({ title: "Shared recipe", url: "https://example.com/recipe" }), "agent@example.com");
    const secondUserBookmarks = bookmarks.content("family@example.com") as { items: Array<{ title: string; url: string }> };
    assert.ok(secondUserBookmarks.items.some((item) => item.title === "Shared recipe" && item.url === "https://example.com/recipe"));
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

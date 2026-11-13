import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("shopping lists support stable checked ordering, quick add, and multiple active lists", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "homeos-shopping-test-"));
  process.env.DATABASE_PATH = path.join(directory, "homeos.db");

  try {
    const { initializeDatabase } = await import("./db.js");
    const { addShoppingItems, createShoppingList, getShoppingList, getShoppingOverview, setShoppingItemChecked } = await import("./shoppingRepository.js");
    await initializeDatabase();

    const first = addShoppingItems(["Milk", "Dish soap", "milk"], "codex");
    assert.deepEqual(first.addedItems.map((item) => item.label), ["Milk", "Dish soap"]);
    assert.equal(first.skippedCount, 1);
    assert.ok(first.addedItems.every((item) => !item.checked && item.addedBy === "codex"));

    const second = addShoppingItems(["Bread", "DISH SOAP"], "codex");
    assert.deepEqual(second.addedItems.map((item) => item.label), ["Bread"]);
    assert.equal(second.skippedCount, 1);
    assert.deepEqual(second.shoppingList.items.map((item) => item.label), ["Milk", "Dish soap", "Bread"]);

    const milk = second.shoppingList.items[0];
    setShoppingItemChecked(milk.id, true);
    assert.deepEqual(getShoppingList(second.shoppingList.id)!.items.map((item) => item.label), ["Dish soap", "Bread", "Milk"]);
    setShoppingItemChecked(milk.id, false);
    assert.deepEqual(getShoppingList(second.shoppingList.id)!.items.map((item) => item.label), ["Milk", "Dish soap", "Bread"]);

    addShoppingItems(["Apples"], "codex", second.shoppingList.id, true);
    assert.deepEqual(getShoppingList(second.shoppingList.id)!.items.map((item) => item.label), ["Apples", "Milk", "Dish soap", "Bread"]);

    const secondList = createShoppingList("Hardware store");
    assert.deepEqual(getShoppingOverview().current.map((list) => list.id), [second.shoppingList.id, secondList.id]);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

import { Router } from "express";
import { z } from "zod";
import { getAuthenticatedUser } from "../auth.js";
import { acquireShoppingLock, addShoppingItems, archiveCurrentShoppingList, createShoppingList, getShoppingList, getShoppingOverview, importShoppingItems, releaseShoppingLock, renewShoppingLock, setShoppingItemChecked, ShoppingLockedError, updateCurrentShoppingList } from "../shoppingRepository.js";

export const shoppingRouter = Router();
const lockToken = (value: string | undefined) => z.string().uuid().parse(value);

shoppingRouter.get("/shopping-lists", (_req, res) => res.json(getShoppingOverview()));
shoppingRouter.post("/shopping-lists", (req, res, next) => { try { const { title } = z.object({ title: z.string().trim().min(1).max(120) }).parse(req.body); res.status(201).json({ shoppingList: createShoppingList(title) }); } catch (error) { next(error); } });
shoppingRouter.get("/shopping-lists/:id", (req, res) => { const list = getShoppingList(req.params.id); if (!list) return res.status(404).json({ error: "Shopping list not found" }); res.json({ shoppingList: list }); });
shoppingRouter.post("/shopping-lists/:id/items", (req, res, next) => { try { const user = getAuthenticatedUser(req)!; const { label } = z.object({ label: z.string().trim().min(1).max(300) }).parse(req.body); const result = addShoppingItems([label], user.email, req.params.id, true); if (!result) return res.status(404).json({ error: "Current shopping list not found" }); res.status(201).json(result); } catch (error) { next(error); } });
shoppingRouter.patch("/shopping-items/:id", (req, res, next) => { try { const { checked } = z.object({ checked: z.boolean() }).parse(req.body); const item = setShoppingItemChecked(req.params.id, checked); if (!item) return res.status(404).json({ error: "Current shopping item not found" }); res.json({ item }); } catch (error) { next(error); } });

shoppingRouter.post("/shopping/current/lock", (req, res) => {
  const user = getAuthenticatedUser(req)!;
  try { const { listId } = z.object({ listId: z.string().uuid().optional() }).parse(req.body ?? {}); res.json({ lock: acquireShoppingLock(user.email, user.name, listId) }); } catch (error) { if (error instanceof ShoppingLockedError) return res.status(409).json({ error: error.message, ownerName: error.ownerName, expiresAt: error.expiresAt }); throw error; }
});
shoppingRouter.post("/shopping/current/lock/renew", (req, res, next) => { try { const user = getAuthenticatedUser(req)!; res.json({ expiresAt: renewShoppingLock(user.email, lockToken(req.headers["x-shopping-lock"] as string | undefined)) }); } catch (error) { if (error instanceof ShoppingLockedError) return res.status(409).json({ error: error.message }); next(error); } });
shoppingRouter.delete("/shopping/current/lock", (req, res, next) => { try { const user = getAuthenticatedUser(req)!; releaseShoppingLock(user.email, lockToken(req.headers["x-shopping-lock"] as string | undefined)); res.status(204).end(); } catch (error) { next(error); } });

shoppingRouter.put("/shopping/current", (req, res, next) => { try { const user = getAuthenticatedUser(req)!; const input = z.object({ title: z.string().trim().min(1).max(120), items: z.array(z.string().trim().min(1).max(300)).max(300) }).parse(req.body); res.json({ shoppingList: updateCurrentShoppingList(user.email, lockToken(req.headers["x-shopping-lock"] as string | undefined), input.title, input.items) }); } catch (error) { if (error instanceof ShoppingLockedError) return res.status(409).json({ error: error.message }); next(error); } });
shoppingRouter.post("/shopping/current/import", (req, res, next) => { try { const user = getAuthenticatedUser(req)!; const input = z.object({ sourceListId: z.string().uuid(), mode: z.enum(["all", "unchecked"]) }).parse(req.body); const result = importShoppingItems(user.email, lockToken(req.headers["x-shopping-lock"] as string | undefined), input.sourceListId, input.mode); if (!result) return res.status(404).json({ error: "Archived shopping list not found" }); res.json(result); } catch (error) { if (error instanceof ShoppingLockedError) return res.status(409).json({ error: error.message }); next(error); } });
shoppingRouter.post("/shopping/current/archive", (req, res, next) => { try { const user = getAuthenticatedUser(req)!; res.json({ shoppingList: archiveCurrentShoppingList(user.email, lockToken(req.headers["x-shopping-lock"] as string | undefined)) }); } catch (error) { if (error instanceof ShoppingLockedError) return res.status(409).json({ error: error.message }); next(error); } });

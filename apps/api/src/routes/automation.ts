import crypto from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { config } from "../config.js";
import {
  completeChecklistRun,
  createChecklist,
  getChecklist,
  getChecklistRun,
  listChecklists,
  startChecklistRun,
  updateChecklist,
  updateRunItem
} from "../checklistRepository.js";
import { createSavedItem, deleteSavedItem, listCaptureStreams, listSavedItems } from "../captureRepository.js";
import { addShoppingItems, getShoppingList, getShoppingOverview, setShoppingItemChecked } from "../shoppingRepository.js";
import { createTodo, createTodoList, getSharedTodoList, getTodoList, listTodoLists, renameTodoList, setTodoCompleted } from "../todoRepository.js";
import { listTravelEmails } from "../travelEmailRepository.js";
import { createTravelPlan, getTravelPlan, listTravelPlans, updateTravelRow } from "../travelRepository.js";
import { deleteVoiceNote, getVoiceNote, listVoiceNotes } from "../voiceNoteRepository.js";

export const automationRouter = Router();

type JsonSchema = Record<string, unknown>;
type Action = {
  description: string;
  input: JsonSchema;
  parse: (value: unknown) => Record<string, unknown>;
  run: (input: Record<string, unknown>, owner: string) => unknown;
};
type Module = {
  id: string;
  name: string;
  description: string;
  contentDescription: string;
  ownerScoped?: boolean;
  actions: Record<string, Action>;
  content: (owner: string) => unknown;
};

const objectSchema = (properties: Record<string, unknown>, required: string[] = []): JsonSchema => ({
  type: "object",
  additionalProperties: false,
  properties,
  ...(required.length ? { required } : {})
});
const string = (description: string, extra: Record<string, unknown> = {}): JsonSchema => ({ type: "string", description, ...extra });
const boolean = (description: string): JsonSchema => ({ type: "boolean", description });
const strings = (description: string, maxItems: number): JsonSchema => ({ type: "array", description, items: { type: "string", minLength: 1 }, maxItems });
const action = <T extends z.ZodType<Record<string, unknown>>>(description: string, input: JsonSchema, schema: T, run: Action["run"]): Action => ({
  description,
  input,
  parse: (value) => schema.parse(value),
  run
});
const notFound = (message: string): never => { throw new AutomationNotFoundError(message); };
const required = <T>(value: T | null, message: string): T => value ?? notFound(message);
class AutomationNotFoundError extends Error {}

const checklistInput = z.object({ title: z.string().trim().min(1).max(120), description: z.string().trim().max(1000).optional(), items: z.array(z.string().trim().min(1).max(300)).min(1).max(200) });
const checklistJson = objectSchema({ title: string("Checklist title", { maxLength: 120 }), description: string("Optional description", { maxLength: 1000 }), items: strings("Ordered checklist item labels", 200) }, ["title", "items"]);
const idSchema = z.object({ id: z.string().uuid() });
const idJson = objectSchema({ id: string("Resource UUID", { format: "uuid" }) }, ["id"]);

export const automationModules: Module[] = [
  {
    id: "checklists",
    name: "Checklists",
    description: "Reusable checklist templates and immutable run history.",
    contentDescription: "Templates with their ordered items and run summaries.",
    content: () => ({ checklists: listChecklists().map((item) => getChecklist(item.id)) }),
    actions: {
      create: action("Create a checklist template.", checklistJson, checklistInput, (input) => ({ checklist: createChecklist(input as z.infer<typeof checklistInput>) })),
      update: action("Replace a checklist template's title, description, and ordered items.", objectSchema({ id: string("Checklist UUID", { format: "uuid" }), ...checklistJson.properties as Record<string, unknown> }, ["id", "title", "items"]), checklistInput.extend({ id: z.string().uuid() }), (input) => {
        const { id, ...values } = input as z.infer<typeof checklistInput> & { id: string };
        return { checklist: required(updateChecklist(id, values), "Checklist not found") };
      }),
      startRun: action("Start a run using the template's current items.", objectSchema({ checklistId: string("Checklist UUID", { format: "uuid" }) }, ["checklistId"]), z.object({ checklistId: z.string().uuid() }), ({ checklistId }) => ({ checklistRun: required(startChecklistRun(String(checklistId)), "Checklist not found") })),
      setRunItemChecked: action("Check or uncheck an item in an active run.", objectSchema({ id: string("Run item UUID", { format: "uuid" }), checked: boolean("Desired checked state") }, ["id", "checked"]), z.object({ id: z.string().uuid(), checked: z.boolean() }), ({ id, checked }) => ({ item: required(updateRunItem(String(id), Boolean(checked)), "Checklist run item not found") })),
      completeRun: action("Mark a checklist run complete.", idJson, idSchema, ({ id }) => ({ checklistRun: required(completeChecklistRun(String(id)), "Checklist run not found") })),
      getRun: action("Read a checklist run including its items.", idJson, idSchema, ({ id }) => ({ checklistRun: required(getChecklistRun(String(id)), "Checklist run not found") }))
    }
  },
  {
    id: "todos",
    name: "To-dos",
    description: "Personal lists plus the shared household to-do list.",
    contentDescription: "All accessible lists with their open and completed to-dos.",
    ownerScoped: true,
    content: (owner) => {
      const summaries = listTodoLists(owner);
      const shared = getSharedTodoList();
      return { todoLists: [...summaries.map((item) => getTodoList(owner, item.id)), shared] };
    },
    actions: {
      createList: action("Create a personal to-do list.", objectSchema({ title: string("List title", { maxLength: 120 }) }, ["title"]), z.object({ title: z.string().trim().min(1).max(120) }), ({ title }, owner) => ({ todoList: createTodoList(owner, String(title)) })),
      renameList: action("Rename a personal list (the shared list cannot be renamed).", objectSchema({ id: string("List UUID", { format: "uuid" }), title: string("New title", { maxLength: 120 }) }, ["id", "title"]), z.object({ id: z.string().uuid(), title: z.string().trim().min(1).max(120) }), ({ id, title }, owner) => ({ todoList: required(renameTodoList(owner, String(id), String(title)), "To-do list not found") })),
      addTodo: action("Add an open to-do to a personal or shared list.", objectSchema({ listId: string("List UUID", { format: "uuid" }), text: string("To-do text", { maxLength: 500 }) }, ["listId", "text"]), z.object({ listId: z.string().uuid(), text: z.string().trim().min(1).max(500) }), ({ listId, text }, owner) => ({ todo: required(createTodo(owner, String(listId), String(text)), "To-do list not found") })),
      setCompleted: action("Complete or reopen a to-do.", objectSchema({ id: string("To-do UUID", { format: "uuid" }), completed: boolean("Desired completion state") }, ["id", "completed"]), z.object({ id: z.string().uuid(), completed: z.boolean() }), ({ id, completed }, owner) => ({ todo: required(setTodoCompleted(owner, String(id), Boolean(completed)), "To-do not found") }))
    }
  },
  {
    id: "shopping",
    name: "Shopping",
    description: "The shared current shopping list and archived lists.",
    contentDescription: "The full current list and full archived list history.",
    content: () => {
      const overview = getShoppingOverview();
      return { current: overview.current, archived: overview.archived.map((item) => getShoppingList(item.id)) };
    },
    actions: {
      addItems: action("Append unchecked items to the oldest active list, skipping case-insensitive duplicates.", objectSchema({ items: strings("Shopping item labels", 50) }, ["items"]), z.object({ items: z.array(z.string().trim().min(1).max(300)).min(1).max(50) }), ({ items }) => addShoppingItems(items as string[], "agent")!),
      setItemChecked: action("Check or uncheck an item on the current list.", objectSchema({ id: string("Shopping item UUID", { format: "uuid" }), checked: boolean("Desired checked state") }, ["id", "checked"]), z.object({ id: z.string().uuid(), checked: z.boolean() }), ({ id, checked }) => ({ item: required(setShoppingItemChecked(String(id), Boolean(checked)), "Current shopping item not found") }))
    }
  },
  {
    id: "travel",
    name: "Travel",
    description: "Travel plans, dated itinerary rows, and the forwarded-confirmation inbox.",
    contentDescription: "All plans with their rows, plus received travel emails and attachment metadata.",
    content: () => ({ travelPlans: listTravelPlans().map((plan) => getTravelPlan(plan.id)), inbox: listTravelEmails() }),
    actions: {
      createPlan: action("Create a plan with one row for every date in the inclusive range.", objectSchema({ title: string("Plan title", { maxLength: 120 }), startDate: string("Start date", { format: "date" }), endDate: string("End date", { format: "date" }) }, ["title", "startDate", "endDate"]), z.object({ title: z.string().trim().min(1).max(120), startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }), (input) => ({ travelPlan: createTravelPlan(input as { title: string; startDate: string; endDate: string }) })),
      updateRow: action("Partially update a dated itinerary row.", objectSchema({ id: string("Travel row UUID", { format: "uuid" }), theme: string("Day theme", { maxLength: 240 }), hotel: string("Accommodation", { maxLength: 240 }), notes: string("Markdown notes", { maxLength: 20000 }) }, ["id"]), z.object({ id: z.string().uuid(), theme: z.string().max(240).optional(), hotel: z.string().max(240).optional(), notes: z.string().max(20000).optional() }), ({ id, ...input }) => ({ travelRow: required(updateTravelRow(String(id), input), "Travel row not found") }))
    }
  },
  {
    id: "bookmarks",
    name: "Bookmarks",
    description: "Shared saved links, text, and image attachment metadata.",
    contentDescription: "Capture streams and every saved item. Attachment bodies remain on the authenticated browser API.",
    content: (owner) => ({ streams: listCaptureStreams(owner), items: listSavedItems() }),
    actions: {
      create: action("Save a link or text item. Binary attachment upload is not supported by this JSON endpoint.", objectSchema({ title: string("Optional title", { maxLength: 300 }), text: string("Optional text", { maxLength: 20000 }), url: string("Optional HTTP(S) URL", { maxLength: 4000 }), source: string("Optional source label", { maxLength: 80 }) }), z.object({ title: z.string().trim().max(300).optional(), text: z.string().trim().max(20000).optional(), url: z.string().trim().max(4000).refine((value) => !value || /^https?:\/\//i.test(value)).optional(), source: z.string().trim().max(80).optional() }).refine((value) => value.title || value.text || value.url, "Saved item is empty"), (input, owner) => ({ item: required(createSavedItem(owner, { ...input, streamId: "bookmarks" }), "Could not create saved item") })),
      delete: action("Permanently delete a saved item and its attachments.", idJson, idSchema, ({ id }, owner) => deleteSavedItem(owner, String(id)) ? { deleted: true, id } : notFound("Saved item not found"))
    }
  },
  {
    id: "voice-notes",
    name: "Voice notes",
    description: "Recorded audio notes and their transcription state and text.",
    contentDescription: "The user's note metadata and transcripts. Audio bodies and binary upload remain on the authenticated browser API.",
    ownerScoped: true,
    content: (owner) => ({ voiceNotes: listVoiceNotes(owner) }),
    actions: {
      get: action("Read one voice note's metadata and transcript.", idJson, idSchema, ({ id }, owner) => ({ voiceNote: required(getVoiceNote(owner, String(id)), "Voice note not found") })),
      delete: action("Permanently delete a voice note and its audio file.", idJson, idSchema, ({ id }, owner) => deleteVoiceNote(owner, String(id)) ? { deleted: true, id } : notFound("Voice note not found"))
    }
  }
];

function publicModule(module: Module) {
  return {
    id: module.id,
    name: module.name,
    description: module.description,
    content: { method: "GET", path: `/api/internal/modules/${module.id}/content`, description: module.contentDescription },
    ownerScoped: Boolean(module.ownerScoped),
    actions: Object.fromEntries(Object.entries(module.actions).map(([id, item]) => [id, {
      method: "POST",
      path: `/api/internal/modules/${module.id}/actions/${id}`,
      description: item.description,
      inputSchema: item.input
    }]))
  };
}

function requireAutomationToken(req: Request, res: Response, next: NextFunction) {
  const supplied = String(req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  const expected = config.codexWorkerToken;
  if (expected && supplied.length === expected.length && crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return next();
  res.status(404).end();
}

function automationOwner(req: Request, module: Module) {
  const supplied = String(req.header("X-HomeOS-User") ?? "").trim().toLowerCase();
  if (supplied && !config.allowedEmails.includes(supplied)) throw new AutomationOwnerError();
  const owner = supplied || config.allowedEmails[0] || "agent@homeos.local";
  if (module.ownerScoped && config.allowedEmails.length > 1 && !supplied) throw new AutomationOwnerRequiredError();
  return owner;
}
class AutomationOwnerError extends Error {}
class AutomationOwnerRequiredError extends Error {}

automationRouter.use("/internal/modules", requireAutomationToken);
automationRouter.get("/internal/modules", (_req, res) => res.json({ modules: automationModules.map(publicModule) }));
automationRouter.get("/internal/modules/:module", (req, res) => {
  const module = automationModules.find((item) => item.id === req.params.module);
  if (!module) return res.status(404).json({ error: "Module not found" });
  res.json({ module: publicModule(module) });
});
automationRouter.get("/internal/modules/:module/content", (req, res, next) => {
  try {
    const module = automationModules.find((item) => item.id === req.params.module);
    if (!module) return res.status(404).json({ error: "Module not found" });
    res.json({ module: module.id, content: module.content(automationOwner(req, module)) });
  } catch (error) { next(error); }
});
automationRouter.post("/internal/modules/:module/actions/:action", (req, res, next) => {
  try {
    const module = automationModules.find((item) => item.id === req.params.module);
    if (!module) return res.status(404).json({ error: "Module not found" });
    const selected = module.actions[req.params.action];
    if (!selected) return res.status(404).json({ error: "Module action not found" });
    const result = selected.run(selected.parse(req.body), automationOwner(req, module));
    res.json({ module: module.id, action: req.params.action, result });
  } catch (error) { next(error); }
});

automationRouter.use("/internal/modules", (error: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (error instanceof AutomationNotFoundError) return res.status(404).json({ error: error.message });
  if (error instanceof AutomationOwnerError) return res.status(403).json({ error: "X-HomeOS-User is not an allowed account" });
  if (error instanceof AutomationOwnerRequiredError) return res.status(400).json({ error: "X-HomeOS-User is required for user-scoped modules when multiple accounts are configured" });
  next(error);
});

import type {
  Checklist,
  ChecklistRun,
  ChecklistRunItem,
  ChecklistSummary,
  CaptureStream,
  CreateSavedItemInput,
  CreateChecklistInput,
  CreateTravelPlanInput,
  TravelPlan,
  TravelPlanSummary,
  TravelEmail,
  TravelRow,
  SavedAttachment,
  SavedItem,
  ShoppingEditLock,
  ShoppingItem,
  ShoppingList,
  ShoppingListSummary,
  Todo,
  TodoList,
  TodoListSummary,
  UpdateChecklistInput,
  UpdateTravelRowInput
} from "@homeos/shared";
import { cacheTravelPlan, cacheTravelRow, configureOfflineAccount, markTravelAvailableOffline, markTravelDownloadStarted, offlineAccountMatches, offlineDataCache, removeOfflineTravelPlan, waitForOfflineShell } from "./offline";
import { notesHtml } from "./components/RichNotes";

export type AuthUser = { email: string; name: string; picture?: string; developer?: boolean };
export type CodexRequest = { id:string; kind:string; prompt:string; status:string; response:string|null; error:string|null; createdAt:string; startedAt:string|null; completedAt:string|null };
export type ServerVoiceNote = { id: string; title: string; createdAt: string; durationSeconds: number; mimeType: string; size: number; transcriptionStatus: "pending" | "processing" | "complete" | "failed"; transcript: string | null; transcriptionError: string | null; audioUrl: string };
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const method = (options?.method ?? "GET").toUpperCase();
  if (method !== "GET" && !navigator.onLine) throw new Error("Offline mode is read-only. Reconnect before making changes.");
  const response = await fetch(path, {
    cache: "no-store",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers
    }
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function getAuthConfig() {
  return request<{ googleClientId: string }>("/api/auth/config");
}

export async function getCurrentUser() {
  const result = await request<{ user: AuthUser }>("/api/auth/me");
  await configureOfflineAccount(result.user.email, result.user).catch(error => console.warn("Offline identity could not be saved", error));
  return result;
}

export async function listAuthAccounts() {
  return request<{ accounts: { email: string }[] }>("/api/auth/accounts");
}

export async function switchAccount(email: string) {
  return request<{ user: AuthUser }>("/api/auth/switch-account", {
    method: "POST",
    body: JSON.stringify({ email })
  });
}

export async function signInWithGoogle(credential: string) {
  return request<{ user: AuthUser }>("/api/auth/google", {
    method: "POST",
    body: JSON.stringify({ credential })
  });
}

export async function logout() {
  if (!navigator.onLine) throw new Error("Reconnect before signing out.");
  const response = await fetch("/api/auth/logout", { method: "POST" });
  if (!response.ok) throw new Error("Sign out failed");
}

export async function listTravelPlans() {
  return request<{ travelPlans: TravelPlanSummary[] }>("/api/travel-plans");
}

export async function createTravelPlan(input: CreateTravelPlanInput) {
  const result = await request<{ travelPlan: TravelPlan }>("/api/travel-plans", {
    method: "POST",
    body: JSON.stringify(input)
  });
  await cacheTravelPlan(result.travelPlan).catch(error => console.warn("Offline trip could not be updated", error));
  return result;
}

export async function getTravelPlan(id: string) {
  const result = await request<{ travelPlan: TravelPlan }>(`/api/travel-plans/${id}`);
  await cacheTravelPlan(result.travelPlan).catch(error => console.warn("Offline trip could not be updated", error));
  return result;
}

export async function deleteTravelPlan(id: string) {
  if (!navigator.onLine) throw new Error("Offline mode is read-only. Reconnect before deleting trips.");
  const response = await fetch(`/api/travel-plans/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!response.ok) throw new Error(response.status === 404 ? "Travel plan not found" : "Could not delete trip");
  await removeOfflineTravelPlan(id).catch(error => console.warn("Offline trip could not be removed", error));
}

export async function updateTravelRow(id: string, input: UpdateTravelRowInput) {
  const result = await request<{ travelRow: TravelRow }>(`/api/travel-rows/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
  await cacheTravelRow(result.travelRow).catch(error => console.warn("Offline day could not be updated", error));
  return result;
}

export async function getTravelInbox() {
  return request<{ address: string; configured: boolean; emails: TravelEmail[] }>("/api/travel-inbox");
}

export async function getTripEmails(id: string) {
  return request<{ emails: TravelEmail[] }>(`/api/travel-plans/${encodeURIComponent(id)}/emails`);
}

export async function listChecklists() {
  return request<{ checklists: ChecklistSummary[] }>("/api/checklists");
}

export async function getChecklist(id: string) {
  return request<{ checklist: Checklist }>(`/api/checklists/${id}`);
}

export async function createChecklist(input: CreateChecklistInput) {
  return request<{ checklist: Checklist }>("/api/checklists", { method: "POST", body: JSON.stringify(input) });
}

export async function updateChecklist(id: string, input: UpdateChecklistInput) {
  return request<{ checklist: Checklist }>(`/api/checklists/${id}`, { method: "PUT", body: JSON.stringify(input) });
}

export async function startChecklistRun(id: string) {
  return request<{ checklistRun: ChecklistRun }>(`/api/checklists/${id}/runs`, { method: "POST" });
}

export async function getChecklistRun(id: string) {
  return request<{ checklistRun: ChecklistRun }>(`/api/checklist-runs/${id}`);
}

export async function updateChecklistRunItem(id: string, checked: boolean) {
  return request<{ item: ChecklistRunItem }>(`/api/checklist-run-items/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ checked })
  });
}

export async function completeChecklistRun(id: string) {
  return request<{ checklistRun: ChecklistRun }>(`/api/checklist-runs/${id}/complete`, { method: "POST" });
}

export async function listCaptureStreams() {
  return request<{ streams: CaptureStream[] }>("/api/capture-streams");
}

export async function listSavedItems(streamId?: string) {
  const query = streamId ? `?streamId=${encodeURIComponent(streamId)}` : "";
  return request<{ items: SavedItem[] }>(`/api/saved-items${query}`);
}

export async function createSavedItem(input: CreateSavedItemInput) {
  return request<{ item: SavedItem }>("/api/saved-items", { method: "POST", body: JSON.stringify(input) });
}

export async function uploadSavedFile(file: File) {
  return request<{ attachment: SavedAttachment }>("/api/share-attachments", {
    method: "POST",
    headers: { "Content-Type": file.type || "application/octet-stream", "X-File-Name": encodeURIComponent(file.name || "attachment") },
    body: file
  });
}

export async function deleteSavedItem(id: string) {
  if (!navigator.onLine) throw new Error("Offline mode is read-only. Reconnect before deleting items.");
  const response = await fetch(`/api/saved-items/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!response.ok) throw new Error(response.status === 404 ? "Saved item not found" : "Could not delete saved item");
}

export async function getShoppingOverview() { return request<{ current: ShoppingList[]; archived: ShoppingListSummary[] }>("/api/shopping-lists"); }
export async function createShoppingList(title: string) { return request<{ shoppingList: ShoppingList }>("/api/shopping-lists", { method: "POST", body: JSON.stringify({ title }) }); }
export async function addShoppingItem(listId: string, label: string) { return request<{ shoppingList: ShoppingList; addedItems: ShoppingItem[]; skippedCount: number }>(`/api/shopping-lists/${listId}/items`, { method: "POST", body: JSON.stringify({ label }) }); }
export async function getShoppingList(id: string) { return request<{ shoppingList: ShoppingList }>(`/api/shopping-lists/${id}`); }
export async function updateShoppingItem(id: string, checked: boolean) { return request<{ item: ShoppingItem }>(`/api/shopping-items/${id}`, { method: "PATCH", body: JSON.stringify({ checked }) }); }
export async function acquireShoppingLock(listId: string) { return request<{ lock: ShoppingEditLock }>("/api/shopping/current/lock", { method: "POST", body: JSON.stringify({ listId }) }); }
export async function renewShoppingLock(token: string) { return request<{ expiresAt: string }>("/api/shopping/current/lock/renew", { method: "POST", headers: { "X-Shopping-Lock": token } }); }
export async function releaseShoppingLock(token: string) { await fetch("/api/shopping/current/lock", { method: "DELETE", headers: { "X-Shopping-Lock": token } }); }
export async function updateCurrentShoppingList(token: string, title: string, items: string[]) { return request<{ shoppingList: ShoppingList }>("/api/shopping/current", { method: "PUT", headers: { "X-Shopping-Lock": token }, body: JSON.stringify({ title, items }) }); }
export async function importShoppingItems(token: string, sourceListId: string, mode: "all" | "unchecked") { return request<{ shoppingList: ShoppingList; addedCount: number }>("/api/shopping/current/import", { method: "POST", headers: { "X-Shopping-Lock": token }, body: JSON.stringify({ sourceListId, mode }) }); }
export async function archiveCurrentShoppingList(token: string) { return request<{ shoppingList: ShoppingList }>("/api/shopping/current/archive", { method: "POST", headers: { "X-Shopping-Lock": token } }); }

export async function listTodoLists() { return request<{ todoLists: TodoListSummary[]; sharedTodoList: TodoListSummary }>("/api/todo-lists"); }
export async function createTodoList(title: string) { return request<{ todoList: TodoListSummary }>("/api/todo-lists", { method: "POST", body: JSON.stringify({ title }) }); }
export async function getTodoList(id: string) { return request<{ todoList: TodoList }>(`/api/todo-lists/${id}`); }
export async function renameTodoList(id: string, title: string) { return request<{ todoList: TodoList }>(`/api/todo-lists/${id}`, { method: "PATCH", body: JSON.stringify({ title }) }); }
export async function createTodo(listId: string, text: string) { return request<{ todo: Todo }>(`/api/todo-lists/${listId}/todos`, { method: "POST", body: JSON.stringify({ text }) }); }
export async function updateTodo(id: string, completed: boolean) { return request<{ todo: Todo }>(`/api/todos/${id}`, { method: "PATCH", body: JSON.stringify({ completed }) }); }
export async function listCodexRequests() { return request<{requests:CodexRequest[]}>("/api/dev/codex-requests"); }
export async function createCodexRequest(prompt:string) { return request<{request:CodexRequest}>("/api/dev/codex-requests",{method:"POST",body:JSON.stringify({prompt})}); }
export async function requestDeploy() { return request<{request:CodexRequest}>("/api/dev/deploy",{method:"POST"}); }
export async function requestPush() { return request<{request:CodexRequest}>("/api/dev/push",{method:"POST"}); }
export async function listVoiceNotes() { return request<{ voiceNotes: ServerVoiceNote[] }>("/api/voice-notes"); }
export async function uploadVoiceNote(note: { id: string; title: string; createdAt: string; durationSeconds: number; mimeType: string; audio: Blob }) {
  const response = await fetch("/api/voice-notes", { method: "POST", headers: { "Content-Type": note.mimeType, "X-Voice-Id": note.id, "X-Voice-Title": encodeURIComponent(note.title), "X-Voice-Created-At": note.createdAt, "X-Voice-Duration": String(note.durationSeconds) }, body: note.audio });
  if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error ?? "Upload failed"); }
  return response.json() as Promise<{ voiceNote: ServerVoiceNote }>;
}
export async function deleteServerVoiceNote(id: string) { const response = await fetch(`/api/voice-notes/${encodeURIComponent(id)}`, { method: "DELETE" }); if (!response.ok && response.status !== 404) throw new Error("Could not delete uploaded recording"); }
const travelDownloads = new Map<string, Promise<string>>();
export function warmTravelOfflineCache(email: string): Promise<string> {
  const pending = travelDownloads.get(email);
  if (pending) return pending;
  const download = downloadTravel(email).finally(() => travelDownloads.delete(email));
  travelDownloads.set(email, download);
  return download;
}
async function downloadTravel(email: string): Promise<string> {
  const cache = await offlineDataCache();
  if (!cache) throw new Error("Offline storage is unavailable in this browser.");
  if (!offlineAccountMatches(email)) throw new Error("Account changed during download.");
  await markTravelDownloadStarted(cache);
  const get = async <T,>(path: string): Promise<T> => {
    if (!navigator.onLine || !offlineAccountMatches(email)) throw new Error("Reconnect to finish downloading your trips.");
    let response = await fetch(path, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
    if (response.status === 429) {
      await new Promise(resolve => setTimeout(resolve, 1_000));
      response = await fetch(path, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
    }
    if (!response.ok || response.headers.get("X-HomeOS-Offline") === "1") throw new Error("Reconnect to finish downloading your trips.");
    if (!offlineAccountMatches(email)) throw new Error("Account changed during download.");
    await cache.put(path, response.clone());
    return response.json() as Promise<T>;
  };
  // Save responses explicitly: on a first visit the worker may not control the
  // page yet. Travel is independent of downloads for other household modules.
  await get("/api/auth/config");
  await get("/api/auth/me");
  const { travelPlans } = await get<{ travelPlans: TravelPlanSummary[] }>("/api/travel-plans");
  const images = new Set<string>();
  for (const plan of travelPlans) {
    const { travelPlan } = await get<{ travelPlan: TravelPlan }>(`/api/travel-plans/${encodeURIComponent(plan.id)}`);
    await get(`/api/travel-plans/${encodeURIComponent(plan.id)}/emails`);
    for (const row of travelPlan.rows) {
      const document = new DOMParser().parseFromString(notesHtml(row.notes), "text/html");
      for (const image of document.querySelectorAll("img[src]")) {
        const url = new URL(image.getAttribute("src")!, window.location.origin);
        if (["http:", "https:"].includes(url.protocol)) images.add(url.href);
      }
    }
  }
  await get("/api/travel-inbox");
  for (const url of images) {
    if (!offlineAccountMatches(email)) throw new Error("Account changed during download.");
    const response = await fetch(url, { mode: new URL(url).origin === window.location.origin ? "same-origin" : "no-cors", signal: AbortSignal.timeout(20_000) });
    if (!response.ok && response.type !== "opaque") throw new Error("Some trip images could not be downloaded. Reconnect to retry.");
    await cache.put(url, response);
  }
  await waitForOfflineShell();
  if (!offlineAccountMatches(email)) throw new Error("Account changed during download.");
  return markTravelAvailableOffline(cache);
}

export async function warmOfflineCache() {
  if (!navigator.onLine) return;
  const get = async <T>(path: string) => {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) throw new Error(`Could not download ${path}`);
    return response.json() as Promise<T>;
  };
  const [{ checklists }, inbox, { streams }, shopping, { todoLists, sharedTodoList }] = await Promise.all([
    get<{ checklists: ChecklistSummary[] }>("/api/checklists"),
    get<{ address: string; configured: boolean; emails: TravelEmail[] }>("/api/travel-inbox"),
    get<{ streams: CaptureStream[] }>("/api/capture-streams"),
    get<{ current: ShoppingList[]; archived: ShoppingListSummary[] }>("/api/shopping-lists"),
    get<{ todoLists: TodoListSummary[]; sharedTodoList: TodoListSummary }>("/api/todo-lists")
  ]);
  void inbox;
  await get("/api/weekend-chores");
  const [checklistDetails, savedGroups] = await Promise.all([
    Promise.all(checklists.map((checklist) => get<{ checklist: Checklist }>(`/api/checklists/${checklist.id}`))),
    Promise.all(streams.map((stream) => get<{ items: SavedItem[] }>(`/api/saved-items?streamId=${encodeURIComponent(stream.id)}`)))
  ]);
  await Promise.all([
    ...checklistDetails.flatMap(({ checklist }) => checklist.runs.map((run) => get(`/api/checklist-runs/${run.id}`))),
    ...shopping.archived.map((list) => get(`/api/shopping-lists/${list.id}`)),
    get(`/api/todo-lists/${sharedTodoList.id}`),
    ...todoLists.map((list) => get(`/api/todo-lists/${list.id}`)),
    ...savedGroups.flatMap(({ items }) => items.flatMap((item) => item.attachments.map((attachment) => fetch(attachment.url).then((response) => { if (!response.ok) throw new Error(`Could not download ${attachment.name}`); }))))
  ]);
}

export const deleteChecklist = (id: string) => request<{ deleted: boolean }>(`/api/checklists/${encodeURIComponent(id)}`, { method: "DELETE" });
export const deleteChecklistItem = (id: string) => request<{ checklist: Checklist }>(`/api/checklist-items/${encodeURIComponent(id)}`, { method: "DELETE" });
export const deleteChecklistRun = (id: string) => request<{ deleted: boolean }>(`/api/checklist-runs/${encodeURIComponent(id)}`, { method: "DELETE" });
export const deleteTodoList = (id: string) => request<{ deleted: boolean }>(`/api/todo-lists/${encodeURIComponent(id)}`, { method: "DELETE" });
export const deleteTodo = (id: string) => request<{ todoList: TodoList }>(`/api/todos/${encodeURIComponent(id)}`, { method: "DELETE" });

export function getWeekendChores() { return request<{ chores: import("@homeos/shared").WeekendChore[] }>("/api/weekend-chores"); }
export function addWeekendChore(text: string) { return request<{ chores: import("@homeos/shared").WeekendChore[] }>("/api/weekend-chores", { method: "POST", body: JSON.stringify({ text }) }); }
export function changeWeekendChore(id: string, input: { action: "done" } | { action: "move"; day: string | null; beforeId?: string }) { return request<{ chores: import("@homeos/shared").WeekendChore[] }>(`/api/weekend-chores/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) }); }
export function removeWeekendChore(id: string) { return request<{ chores: import("@homeos/shared").WeekendChore[] }>(`/api/weekend-chores/${encodeURIComponent(id)}`, { method: "DELETE" }); }

export type CodexTerminalSession = { id: string; createdAt: string; ended: boolean };
export function listCodexTerminalSessions() { return request<{ sessions: CodexTerminalSession[] }>("/api/dev/terminal/sessions"); }
export function createCodexTerminalSession() { return request<{ session: CodexTerminalSession }>("/api/dev/terminal/sessions", { method: "POST", body: JSON.stringify({ cols: 100, rows: 30 }) }); }
export function endCodexTerminalSession(id: string) { return request<{ ended: boolean }>(`/api/dev/terminal/sessions/${encodeURIComponent(id)}`, { method: "DELETE" }); }

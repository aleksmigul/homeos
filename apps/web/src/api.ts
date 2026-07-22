import type {
  Checklist,
  ChecklistRun,
  ChecklistRunItem,
  ChecklistSummary,
  CaptureStream,
  CreateCaptureStreamInput,
  CreateSavedItemInput,
  CreateChecklistInput,
  CreateTravelPlanInput,
  TravelPlan,
  TravelPlanSummary,
  TravelEmail,
  TravelRow,
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

export type AuthUser = { email: string; name: string; picture?: string };

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
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
  return request<{ user: AuthUser }>("/api/auth/me");
}

export async function signInWithGoogle(credential: string) {
  return request<{ user: AuthUser }>("/api/auth/google", {
    method: "POST",
    body: JSON.stringify({ credential })
  });
}

export async function logout() {
  const response = await fetch("/api/auth/logout", { method: "POST" });
  if (!response.ok) throw new Error("Sign out failed");
}

export async function listTravelPlans() {
  return request<{ travelPlans: TravelPlanSummary[] }>("/api/travel-plans");
}

export async function createTravelPlan(input: CreateTravelPlanInput) {
  return request<{ travelPlan: TravelPlan }>("/api/travel-plans", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function getTravelPlan(id: string) {
  return request<{ travelPlan: TravelPlan }>(`/api/travel-plans/${id}`);
}

export async function updateTravelRow(id: string, input: UpdateTravelRowInput) {
  return request<{ travelRow: TravelRow }>(`/api/travel-rows/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export async function getTravelInbox() {
  return request<{ address: string; configured: boolean; emails: TravelEmail[] }>("/api/travel-inbox");
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

export async function createCaptureStream(input: CreateCaptureStreamInput) {
  return request<{ stream: CaptureStream }>("/api/capture-streams", { method: "POST", body: JSON.stringify(input) });
}

export async function listSavedItems(streamId?: string) {
  const query = streamId ? `?streamId=${encodeURIComponent(streamId)}` : "";
  return request<{ items: SavedItem[] }>(`/api/saved-items${query}`);
}

export async function createSavedItem(input: CreateSavedItemInput) {
  return request<{ item: SavedItem }>("/api/saved-items", { method: "POST", body: JSON.stringify(input) });
}

export async function deleteSavedItem(id: string) {
  const response = await fetch(`/api/saved-items/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!response.ok) throw new Error(response.status === 404 ? "Saved item not found" : "Could not delete saved item");
}

export async function getShoppingOverview() { return request<{ current: ShoppingList; archived: ShoppingListSummary[] }>("/api/shopping-lists"); }
export async function getShoppingList(id: string) { return request<{ shoppingList: ShoppingList }>(`/api/shopping-lists/${id}`); }
export async function updateShoppingItem(id: string, checked: boolean) { return request<{ item: ShoppingItem }>(`/api/shopping-items/${id}`, { method: "PATCH", body: JSON.stringify({ checked }) }); }
export async function acquireShoppingLock() { return request<{ lock: ShoppingEditLock }>("/api/shopping/current/lock", { method: "POST" }); }
export async function renewShoppingLock(token: string) { return request<{ expiresAt: string }>("/api/shopping/current/lock/renew", { method: "POST", headers: { "X-Shopping-Lock": token } }); }
export async function releaseShoppingLock(token: string) { await fetch("/api/shopping/current/lock", { method: "DELETE", headers: { "X-Shopping-Lock": token } }); }
export async function updateCurrentShoppingList(token: string, title: string, items: string[]) { return request<{ shoppingList: ShoppingList }>("/api/shopping/current", { method: "PUT", headers: { "X-Shopping-Lock": token }, body: JSON.stringify({ title, items }) }); }
export async function importShoppingItems(token: string, sourceListId: string, mode: "all" | "unchecked") { return request<{ shoppingList: ShoppingList; addedCount: number }>("/api/shopping/current/import", { method: "POST", headers: { "X-Shopping-Lock": token }, body: JSON.stringify({ sourceListId, mode }) }); }
export async function archiveCurrentShoppingList(token: string) { return request<{ shoppingList: ShoppingList }>("/api/shopping/current/archive", { method: "POST", headers: { "X-Shopping-Lock": token } }); }

export async function listTodoLists() { return request<{ todoLists: TodoListSummary[] }>("/api/todo-lists"); }
export async function createTodoList(title: string) { return request<{ todoList: TodoListSummary }>("/api/todo-lists", { method: "POST", body: JSON.stringify({ title }) }); }
export async function getTodoList(id: string) { return request<{ todoList: TodoList }>(`/api/todo-lists/${id}`); }
export async function renameTodoList(id: string, title: string) { return request<{ todoList: TodoList }>(`/api/todo-lists/${id}`, { method: "PATCH", body: JSON.stringify({ title }) }); }
export async function createTodo(listId: string, text: string) { return request<{ todo: Todo }>(`/api/todo-lists/${listId}/todos`, { method: "POST", body: JSON.stringify({ text }) }); }
export async function updateTodo(id: string, completed: boolean) { return request<{ todo: Todo }>(`/api/todos/${id}`, { method: "PATCH", body: JSON.stringify({ completed }) }); }

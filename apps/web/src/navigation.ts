export type AppModule = "checklists" | "todos" | "shopping" | "travel" | "bookmarks" | "voice-notes" | "weekend" | "dev" | "codex-terminal";
export type ChecklistScreenState = { kind: "library" } | { kind: "detail"; id: string } | { kind: "run"; id: string };

export interface HomeNavigationState {
  module?: AppModule;
  travelScreen?: "library" | "inbox" | "plan";
  travelPlanId?: string;
  travelRowId?: string;
  checklist?: ChecklistScreenState;
  imageId?: string;
  emailId?: string;
  dialog?: "shopping-editor";
  weekendHistory?: boolean;
  todoListId?: string;
  noteId?: string;
}

const modules = new Set<AppModule>(["checklists", "todos", "shopping", "travel", "bookmarks", "voice-notes", "weekend", "dev", "codex-terminal"]);

/** Read a canonical app URL into the same state used by the in-app navigator. */
export function navigationFromPath(pathname: string): HomeNavigationState | null {
  const parts = pathname.split("/").filter(Boolean).map(decodePathPart);
  if (parts.some((part) => part === null)) return null;
  const [module, section, id, extra] = parts as string[];

  if (!module) return { module: "checklists", checklist: { kind: "library" } };
  if (module === "share") return { module: "bookmarks" };
  if (!modules.has(module as AppModule)) return null;
  if (module === "travel" && section === "plans" && id && extra === "days" && parts[4] && parts.length === 5) return { module, travelScreen: "plan", travelPlanId: id, travelRowId: parts[4] as string };
  if (extra) return null;

  if (module === "checklists") {
    if (!section) return { module, checklist: { kind: "library" } };
    if (section === "runs" && id) return { module, checklist: { kind: "run", id } };
    if (!id) return { module, checklist: { kind: "detail", id: section } };
    return null;
  }
  if (module === "weekend") return !id && (!section || section === "history") ? { module, weekendHistory: section === "history" } : null;
  if (module === "todos") return id || section === "runs" ? null : { module, todoListId: section };
  if (module === "travel") {
    if (!section) return { module, travelScreen: "library" };
    if (section === "inbox" && !extra) return { module, travelScreen: "inbox", emailId: id };
    if (section === "plans" && id) return { module, travelScreen: "plan", travelPlanId: id };
    return null;
  }
  if (module === "bookmarks") {
    if (!section) return { module };
    return section === "images" && id ? { module, imageId: id } : null;
  }
  return section ? null : { module: module as AppModule };
}

/** Produce a stable, refreshable URL for a navigation state. */
export function pathFromNavigation(state: HomeNavigationState): string {
  switch (state.module) {
    case "todos": return state.todoListId ? `/todos/${encodeURIComponent(state.todoListId)}` : "/todos";
    case "weekend": return state.weekendHistory ? "/weekend/history" : "/weekend";
    case "shopping": return "/shopping";
    case "travel":
      if (state.travelScreen === "plan" && state.travelPlanId) return `/travel/plans/${encodeURIComponent(state.travelPlanId)}${state.travelRowId ? `/days/${encodeURIComponent(state.travelRowId)}` : ""}`;
      if (state.travelScreen === "inbox") return state.emailId ? `/travel/inbox/${encodeURIComponent(state.emailId)}` : "/travel/inbox";
      return "/travel";
    case "bookmarks": return state.imageId ? `/bookmarks/images/${encodeURIComponent(state.imageId)}` : "/bookmarks";
    case "voice-notes": return "/voice-notes";
    case "dev": return "/dev";
    case "codex-terminal": return "/codex-terminal";
    case "checklists":
    default:
      if (state.checklist?.kind === "detail") return `/checklists/${encodeURIComponent(state.checklist.id)}`;
      if (state.checklist?.kind === "run") return `/checklists/runs/${encodeURIComponent(state.checklist.id)}`;
      return "/";
  }
}

export function currentNavigation(): HomeNavigationState {
  const fromPath = navigationFromPath(window.location.pathname);
  const historyState: HomeNavigationState = window.history.state?.homeos ?? {};
  // Dialogs are deliberately not deep-linkable, but still need a history entry
  // so the browser Back button can dismiss them.
  const state = fromPath
    ? { ...fromPath, dialog: fromPath.module === "shopping" ? historyState.dialog : undefined }
    : historyState;
  const legacyModule = (state as { module?: string }).module;
  if (legacyModule === "schools" || legacyModule === "rentals") return { module: "checklists", checklist: { kind: "library" } };
  if (legacyModule === "notes" || legacyModule === "saved") return { ...state, module: "bookmarks", noteId: undefined };
  return state;
}

export function pushNavigation(patch: Partial<HomeNavigationState>) {
  const navigation = { ...currentNavigation(), ...patch };
  window.history.pushState({ ...window.history.state, homeos: navigation }, "", pathFromNavigation(navigation));
}

export function replaceNavigation(patch: Partial<HomeNavigationState>) {
  const navigation = { ...currentNavigation(), ...patch };
  window.history.replaceState({ ...window.history.state, homeos: navigation }, "", pathFromNavigation(navigation));
}

function decodePathPart(part: string): string | null {
  try { return decodeURIComponent(part); }
  catch { return null; }
}

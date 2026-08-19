export type AppModule = "checklists" | "todos" | "shopping" | "travel" | "bookmarks" | "voice-notes" | "dev";
export type ChecklistScreenState = { kind: "library" } | { kind: "detail"; id: string } | { kind: "run"; id: string };

export interface HomeNavigationState {
  module?: AppModule;
  travelScreen?: "library" | "inbox" | "plan";
  travelPlanId?: string;
  checklist?: ChecklistScreenState;
  imageId?: string;
  emailId?: string;
  dialog?: "shopping-editor";
  todoListId?: string;
  noteId?: string;
}

export function currentNavigation(): HomeNavigationState {
  const state = window.history.state?.homeos ?? {};
  if (state.module === "notes" || state.module === "saved") return { ...state, module: "bookmarks", noteId: undefined };
  return state;
}

export function pushNavigation(patch: Partial<HomeNavigationState>) {
  window.history.pushState({ ...window.history.state, homeos: { ...currentNavigation(), ...patch } }, "");
}

export function replaceNavigation(patch: Partial<HomeNavigationState>, url?: string) {
  window.history.replaceState({ ...window.history.state, homeos: { ...currentNavigation(), ...patch } }, "", url);
}

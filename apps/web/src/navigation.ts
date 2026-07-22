export type AppModule = "checklists" | "todos" | "shopping" | "travel" | "saved";
export type ChecklistScreenState = { kind: "library" } | { kind: "detail"; id: string } | { kind: "run"; id: string };

export interface HomeNavigationState {
  module?: AppModule;
  travelView?: "plans" | "inbox";
  checklist?: ChecklistScreenState;
  imageId?: string;
  emailId?: string;
  dialog?: "shopping-editor";
}

export function currentNavigation(): HomeNavigationState {
  return window.history.state?.homeos ?? {};
}

export function pushNavigation(patch: Partial<HomeNavigationState>) {
  window.history.pushState({ ...window.history.state, homeos: { ...currentNavigation(), ...patch } }, "");
}

export function replaceNavigation(patch: Partial<HomeNavigationState>, url?: string) {
  window.history.replaceState({ ...window.history.state, homeos: { ...currentNavigation(), ...patch } }, "", url);
}

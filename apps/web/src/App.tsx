import { AlertTriangle, ArrowLeft, Bookmark, CalendarPlus, ChevronRight, Code2, HardDrive, Inbox, ListChecks, ListTodo, Loader2, LogOut, Menu, NotebookPen, Plane, Plus, Save, ShoppingCart, StickyNote, WifiOff, X } from "lucide-react";
import { FormEvent, TouchEvent as ReactTouchEvent, useEffect, useMemo, useRef, useState } from "react";
import type { CreateTravelPlanInput, TravelPlan, TravelPlanSummary, TravelRow } from "@homeos/shared";
import { createTravelPlan, getAuthConfig, getCurrentUser, getTravelPlan, listTravelPlans, logout, signInWithGoogle, updateTravelRow, warmOfflineCache, type AuthUser } from "./api";
import { MarkdownNotesEditor } from "./components/MarkdownNotesEditor";
import { ChecklistModule } from "./ChecklistModule";
import { TravelInbox } from "./TravelInbox";
import { SavedModule, type SharedDraft } from "./SavedModule";
import { currentNavigation, pushNavigation, replaceNavigation, type AppModule } from "./navigation";
import { ShoppingModule } from "./ShoppingModule";
import { TodoModule } from "./TodoModule";
import { NotesModule } from "./NotesModule";
import { DevModule } from "./DevModule";
import { clearOfflineAccount, configureOfflineAccount, storagePressure } from "./offline";

const today = new Date().toISOString().slice(0, 10);
const baseModules: AppModule[] = ["checklists", "todos", "notes", "shopping", "travel", "saved"];

export function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [clientId, setClientId] = useState("");
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    Promise.all([getAuthConfig(), getCurrentUser().catch(() => null)])
      .then(([config, current]) => {
        setClientId(config.googleClientId);
        setUser(current?.user ?? null);
      })
      .catch((error: unknown) => setAuthError(error instanceof Error ? error.message : "Authentication failed"))
      .finally(() => setAuthLoading(false));
  }, []);

  if (authLoading) return <AuthLoading />;
  if (!user) return <LoginPage clientId={clientId} error={authError} onError={setAuthError} onSignIn={setUser} />;

  return <Planner user={user} onLogout={() => logout().then(clearOfflineAccount).then(() => setUser(null))} />;
}

function Planner({ user, onLogout }: { user: AuthUser; onLogout: () => void }) {
  const [sharedDraft, setSharedDraft] = useState<SharedDraft | null>(() => readSharedDraft());
  const [activeModule, setActiveModule] = useState<AppModule>(() => readSharedDraft() ? "saved" : currentNavigation().module ?? "checklists");
  const [travelScreen, setTravelScreen] = useState<"library" | "inbox" | "plan">(() => currentNavigation().travelScreen ?? "library");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [plans, setPlans] = useState<TravelPlanSummary[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<TravelPlan | null>(null);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState("Ready");
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [storageWarning, setStorageWarning] = useState("");
  const titleSwipe = useRef<{ x: number; y: number } | null>(null);
  const selectedRow = selectedPlan?.rows.find((row) => row.id === selectedRowId) ?? selectedPlan?.rows[0] ?? null;
  const modules = user.developer ? [...baseModules, "dev" as const] : baseModules;

  useEffect(() => {
    void bootstrap();
    replaceNavigation({ module: activeModule, travelScreen }, window.location.pathname === "/share" ? "/" : undefined);
    const onPopState = () => {
      const navigation = currentNavigation();
      setActiveModule(navigation.module ?? "checklists");
      setTravelScreen(navigation.travelScreen ?? "library");
      setIsMobileMenuOpen(false);
      if (navigation.travelScreen === "plan" && navigation.travelPlanId) void loadPlan(navigation.travelPlanId);
      else setSelectedPlan(null);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    const sync = async () => {
      setIsOffline(false);
      try {
        await configureOfflineAccount(user.email);
        await warmOfflineCache();
      } catch (cause) {
        console.warn("Offline snapshot could not be fully updated", cause);
      }
      const storage = await storagePressure().catch(() => null);
      setStorageWarning(storage && storage.ratio >= 0.8 ? `Offline storage is ${Math.round(storage.ratio * 100)}% full.` : "");
    };
    const offline = () => setIsOffline(true);
    const online = () => void sync();
    window.addEventListener("offline", offline); window.addEventListener("online", online);
    navigator.serviceWorker?.addEventListener("controllerchange", online);
    if (navigator.onLine) void sync();
    return () => { window.removeEventListener("offline", offline); window.removeEventListener("online", online); navigator.serviceWorker?.removeEventListener("controllerchange", online); };
  }, [user.email]);

  function navigateModule(module: AppModule) {
    if (module !== activeModule || (module === "travel" && travelScreen !== "library")) {
      pushNavigation({ module, checklist: undefined, imageId: undefined, emailId: undefined, dialog: undefined, todoListId: undefined, noteId: undefined, travelScreen: module === "travel" ? "library" : undefined, travelPlanId: undefined });
    }
    setActiveModule(module);
    if (module === "travel") { setTravelScreen("library"); setSelectedPlan(null); }
    setIsMobileMenuOpen(false);
  }

  function startTitleSwipe(event: ReactTouchEvent<HTMLElement>) {
    const target = event.target instanceof Element ? event.target : null;
    const isTitleBar = target?.closest(".topbar, .run-header");
    if (!isTitleBar || target?.closest("button, a, input, textarea, select, label") || !window.matchMedia("(max-width: 760px)").matches) {
      titleSwipe.current = null;
      return;
    }
    const touch = event.touches[0];
    titleSwipe.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  }

  function finishTitleSwipe(event: ReactTouchEvent<HTMLElement>) {
    const start = titleSwipe.current;
    titleSwipe.current = null;
    const touch = event.changedTouches[0];
    if (!start || !touch) return;
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaX) < 55 || Math.abs(deltaX) < Math.abs(deltaY) * 1.25) return;
    const currentIndex = modules.indexOf(activeModule);
    const nextIndex = currentIndex + (deltaX < 0 ? 1 : -1);
    const nextModule = modules[nextIndex];
    if (nextModule) navigateModule(nextModule);
  }

  function openTravelInbox() {
    pushNavigation({ module: "travel", travelScreen: "inbox", travelPlanId: undefined, emailId: undefined });
    setTravelScreen("inbox");
    setSelectedPlan(null);
  }

  async function openTravelPlan(id: string) {
    await loadPlan(id);
    pushNavigation({ module: "travel", travelScreen: "plan", travelPlanId: id, emailId: undefined });
    setTravelScreen("plan");
  }

  async function bootstrap() {
    setIsLoading(true);
    try {
      const { travelPlans } = await listTravelPlans();
      setPlans(travelPlans);
      const navigation = currentNavigation();
      if (navigation.travelScreen === "plan" && navigation.travelPlanId) await loadPlan(navigation.travelPlanId);
    } finally {
      setIsLoading(false);
    }
  }

  async function loadPlan(id: string) {
    const { travelPlan } = await getTravelPlan(id);
    setSelectedPlan(travelPlan);
    setSelectedRowId(travelPlan.rows[0]?.id ?? null);
  }

  function replaceRow(row: TravelRow) {
    setSelectedPlan((plan) => {
      if (!plan) {
        return plan;
      }

      return {
        ...plan,
        rows: plan.rows.map((item) => (item.id === row.id ? row : item)),
        updatedAt: row.updatedAt
      };
    });
  }

  function patchLocalRow(id: string, patch: Partial<TravelRow>) {
    setSelectedPlan((plan) => {
      if (!plan) {
        return plan;
      }

      return {
        ...plan,
        rows: plan.rows.map((row) => (row.id === id ? { ...row, ...patch } : row))
      };
    });
  }

  async function saveRow(row: TravelRow) {
    setStatus("Saving");
    try {
      const { travelRow } = await updateTravelRow(row.id, {
        theme: row.theme,
        hotel: row.hotel,
        notes: row.notes
      });
      replaceRow(travelRow);
      setStatus("Saved");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Save failed");
    }
  }

  async function handleCreate(input: CreateTravelPlanInput) {
    setStatus("Creating");
    const { travelPlan } = await createTravelPlan(input);
    setPlans((items) => [
      {
        id: travelPlan.id,
        title: travelPlan.title,
        startDate: travelPlan.startDate,
        endDate: travelPlan.endDate,
        rowCount: travelPlan.rowCount,
        updatedAt: travelPlan.updatedAt
      },
      ...items
    ]);
    setSelectedPlan(travelPlan);
    setSelectedRowId(travelPlan.rows[0]?.id ?? null);
    pushNavigation({ module: "travel", travelScreen: "plan", travelPlanId: travelPlan.id, emailId: undefined });
    setTravelScreen("plan");
    setIsCreateOpen(false);
    setStatus("Created");
  }

  return (
    <main className="shell" onTouchStart={startTitleSwipe} onTouchEnd={finishTitleSwipe} onTouchCancel={() => { titleSwipe.current = null; }}>
      <aside className={isMobileMenuOpen ? "sidebar mobile-menu-open" : "sidebar"}>
        <div className="brand">
          <img className="app-mark" src="/favicon.png" alt="" />
          <span>The Annexation</span>
        </div>
        <button className="mobile-menu-toggle" type="button" aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"} aria-expanded={isMobileMenuOpen} onClick={() => setIsMobileMenuOpen((open) => !open)}>
          {isMobileMenuOpen ? <X size={21} /> : <Menu size={21} />}
        </button>
        <div className="sidebar-content">
          <p className="mobile-menu-label">Modules</p>
          <nav className="module-nav" aria-label="Modules">
            <button className={activeModule === "checklists" ? "active" : ""} onClick={() => navigateModule("checklists")}><ListChecks size={17} /><span>Checklists</span></button>
            <button className={activeModule === "todos" ? "active" : ""} onClick={() => navigateModule("todos")}><ListTodo size={17} /><span>To-dos</span></button>
            <button className={activeModule === "notes" ? "active" : ""} onClick={() => navigateModule("notes")}><StickyNote size={17} /><span>Notes</span></button>
            <button className={activeModule === "shopping" ? "active" : ""} onClick={() => navigateModule("shopping")}><ShoppingCart size={17} /><span>Shopping</span></button>
            <button className={activeModule === "travel" ? "active" : ""} onClick={() => navigateModule("travel")}><Plane size={17} /><span>Travel</span></button>
            <button className={activeModule === "saved" ? "active" : ""} onClick={() => navigateModule("saved")}><Bookmark size={17} /><span>Saved</span></button>
            {user.developer ? <button className={activeModule === "dev" ? "active" : ""} onClick={() => navigateModule("dev")}><Code2 size={17} /><span>Dev</span></button> : null}
          </nav>
        </div>
        <div className="account-card">
          {user.picture ? <img src={user.picture} alt="" referrerPolicy="no-referrer" /> : null}
          <span><strong>{user.name}</strong><small>{user.email}</small></span>
          <button type="button" aria-label="Sign out" onClick={onLogout}><LogOut size={16} /></button>
        </div>
      </aside>

      {activeModule === "checklists" ? <ChecklistModule /> : activeModule === "todos" ? <TodoModule /> : activeModule === "notes" ? <NotesModule /> : activeModule === "shopping" ? <ShoppingModule /> : activeModule === "saved" ? <SavedModule sharedDraft={sharedDraft} onSharedDraftDone={() => setSharedDraft(null)} /> : activeModule === "dev" ? <DevModule /> : <section className="workspace travel-workspace">
        {travelScreen === "library" ? <>
          <header className="topbar checklist-topbar">
            <div><p className="eyebrow">Trips & reservations</p><h1>Travel</h1></div>
            <button className="primary-button add-action" type="button" onClick={() => setIsCreateOpen(true)}><Plus size={17} /><span>New trip</span></button>
          </header>
          <div className="travel-library">
            <button className="travel-inbox-card" type="button" onClick={openTravelInbox}>
              <span className="travel-card-icon"><Inbox size={20} /></span>
              <span><strong>Travel inbox</strong><small>Forward reservations and travel emails here</small></span>
              <ChevronRight size={18} />
            </button>
            <div className="section-heading">
              <div><h2>Your trips</h2><p>Open a trip to view and edit its itinerary.</p></div>
              <span>{plans.length} {plans.length === 1 ? "trip" : "trips"}</span>
            </div>
            {isLoading ? <div className="travel-loading"><Loader2 className="spin" size={22} />Loading trips</div> : plans.length ? <div className="travel-card-grid">
              {plans.map((plan) => <button className="travel-card" type="button" key={plan.id} onClick={() => void openTravelPlan(plan.id)}>
                <span className="travel-card-icon"><Plane size={20} /></span>
                <span className="travel-card-copy"><strong>{plan.title}</strong><small>{formatDate(plan.startDate)} – {formatDate(plan.endDate)}</small></span>
                <span className="travel-card-meta">{plan.rowCount} {plan.rowCount === 1 ? "day" : "days"}</span>
                <ChevronRight size={18} />
              </button>)}
            </div> : <EmptyState onCreate={() => setIsCreateOpen(true)} />}
          </div>
        </> : travelScreen === "inbox" ? <>
          <header className="topbar detail-topbar travel-detail-topbar">
            <button className="icon-button" type="button" aria-label="Back to travel" onClick={() => window.history.back()}><ArrowLeft size={20} /></button>
            <div className="detail-title"><p className="eyebrow">Travel</p><h1>Inbox</h1></div>
          </header>
          <TravelInbox />
        </> : selectedPlan ? <>
          <header className="topbar detail-topbar travel-detail-topbar">
            <button className="icon-button" type="button" aria-label="Back to travel" onClick={() => window.history.back()}><ArrowLeft size={20} /></button>
            <div className="detail-title"><p>{formatDate(selectedPlan.startDate)} – {formatDate(selectedPlan.endDate)}</p><h1>{selectedPlan.title}</h1></div>
            <div className="status-pill">{isLoading ? <Loader2 className="spin" size={14} /> : <Save size={14} />}{status}</div>
          </header>
          <div className="planner-grid">
            <TravelTable
              rows={selectedPlan.rows}
              selectedRowId={selectedRow?.id ?? null}
              onSelect={setSelectedRowId}
              onLocalChange={patchLocalRow}
              onSave={saveRow}
            />
            <RowPage row={selectedRow} onChange={patchLocalRow} onSave={saveRow} />
          </div>
        </> : null}
      </section>}

      {isCreateOpen ? <CreateTravelDialog onClose={() => setIsCreateOpen(false)} onCreate={handleCreate} /> : null}
      {isOffline ? <div className="connection-banner offline"><WifiOff size={16} /><span><strong>Offline</strong> Showing the downloaded copy. Changes are disabled.</span></div> : storageWarning ? <div className="connection-banner storage"><AlertTriangle size={16} /><span><strong>Storage warning</strong> {storageWarning}</span><HardDrive size={15} /></div> : null}
    </main>
  );
}

function readSharedDraft(): SharedDraft | null {
  if (window.location.pathname !== "/share") return null;
  const params = new URLSearchParams(window.location.search);
  const draft = { title: params.get("title")?.trim() ?? "", text: params.get("text")?.trim() ?? "", url: params.get("url")?.trim() ?? "", attachmentIds: params.getAll("attachment"), error: params.get("shareError") ?? "" };
  return draft.title || draft.text || draft.url || draft.attachmentIds.length || draft.error ? draft : null;
}

function AuthLoading() {
  return <main className="auth-page"><Loader2 className="spin" size={28} /></main>;
}

function LoginPage({ clientId, error, onError, onSignIn }: {
  clientId: string;
  error: string;
  onError: (message: string) => void;
  onSignIn: (user: AuthUser) => void;
}) {
  const buttonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!clientId) return;
    const initialize = () => {
      const google = window.google;
      if (!google || !buttonRef.current) return;
      google.accounts.id.initialize({
        client_id: clientId,
        callback: ({ credential }) => {
          signInWithGoogle(credential).then(({ user }) => onSignIn(user)).catch((cause: unknown) => {
            onError(cause instanceof Error ? cause.message : "Sign in failed");
          });
        }
      });
      google.accounts.id.renderButton(buttonRef.current, { theme: "outline", size: "large", width: 280 });
    };

    const existing = document.querySelector<HTMLScriptElement>('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      if (window.google) initialize(); else existing.addEventListener("load", initialize, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = initialize;
    script.onerror = () => onError("Could not load Google Sign-In");
    document.head.appendChild(script);
  }, [clientId, onError, onSignIn]);

  return (
    <main className="auth-page">
      <section className="login-card">
        <img className="login-app-mark" src="/favicon.png" alt="" />
        <p className="eyebrow">Welcome home</p>
        <h1>The Annexation</h1>
        <p className="login-copy">Sign in with an approved Google account.</p>
        {clientId ? <div ref={buttonRef} className="google-button" /> : <p className="auth-error">Google Sign-In still needs its client ID.</p>}
        {error ? <p className="auth-error">{error}</p> : null}
      </section>
    </main>
  );
}

function TravelTable({
  rows,
  selectedRowId,
  onSelect,
  onLocalChange,
  onSave
}: {
  rows: TravelRow[];
  selectedRowId: string | null;
  onSelect: (id: string) => void;
  onLocalChange: (id: string, patch: Partial<TravelRow>) => void;
  onSave: (row: TravelRow) => Promise<void>;
}) {
  return (
    <section className="table-wrap" aria-label="Travel itinerary table">
      <div className="table-header row">
        <span>Date</span>
        <span>Theme</span>
        <span>Hotel</span>
        <span />
      </div>
      {rows.map((row) => (
        <button
          className={row.id === selectedRowId ? "itinerary-row row selected" : "itinerary-row row"}
          key={row.id}
          type="button"
          onClick={() => onSelect(row.id)}
        >
          <span className="date-cell">
            <strong>{formatWeekday(row.date)}</strong>
            <small>{formatDate(row.date)}</small>
          </span>
          <input
            aria-label={`Theme for ${row.date}`}
            value={row.theme}
            placeholder="Theme"
            onChange={(event) => onLocalChange(row.id, { theme: event.target.value })}
            onBlur={() => void onSave(row)}
            onClick={(event) => event.stopPropagation()}
          />
          <input
            aria-label={`Hotel for ${row.date}`}
            value={row.hotel}
            placeholder="Hotel"
            onChange={(event) => onLocalChange(row.id, { hotel: event.target.value })}
            onBlur={() => void onSave(row)}
            onClick={(event) => event.stopPropagation()}
          />
          <ChevronRight size={16} />
        </button>
      ))}
    </section>
  );
}

function RowPage({
  row,
  onChange,
  onSave
}: {
  row: TravelRow | null;
  onChange: (id: string, patch: Partial<TravelRow>) => void;
  onSave: (row: TravelRow) => Promise<void>;
}) {
  if (!row) {
    return (
      <aside className="row-page">
        <NotebookPen size={18} />
      </aside>
    );
  }

  return (
    <aside className="row-page">
      <div className="row-page-title">
        <CalendarPlus size={18} />
        <div>
          <p>
            {formatWeekday(row.date)}, {formatDate(row.date)}
          </p>
          <h2>{row.theme || "Untitled day"}</h2>
        </div>
      </div>
      <label>
        Theme
        <input
          value={row.theme}
          placeholder="Coffee, museums, slow dinner..."
          onChange={(event) => onChange(row.id, { theme: event.target.value })}
          onBlur={() => void onSave(row)}
        />
      </label>
      <label>
        Hotel
        <input
          value={row.hotel}
          placeholder="Where you sleep"
          onChange={(event) => onChange(row.id, { hotel: event.target.value })}
          onBlur={() => void onSave(row)}
        />
      </label>
      <div className="notes-label">
        <span className="field-label">Notes</span>
        <MarkdownNotesEditor
          value={row.notes}
          onChange={(notes) => onChange(row.id, { notes })}
          onCommit={(notes) => void onSave({ ...row, notes })}
        />
      </div>
    </aside>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <section className="empty-state">
      <Plane size={28} />
      <h2>Start with a trip</h2>
      <button className="primary-button add-action" type="button" onClick={onCreate}>
        <Plus size={16} />
        <span>New travel</span>
      </button>
    </section>
  );
}

function CreateTravelDialog({
  onClose,
  onCreate
}: {
  onClose: () => void;
  onCreate: (input: CreateTravelPlanInput) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [error, setError] = useState("");
  const canSubmit = useMemo(() => title.trim() && startDate && endDate, [title, startDate, endDate]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await onCreate({ title, startDate, endDate });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create travel plan");
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <form className="modal" onSubmit={(event) => void submit(event)} onMouseDown={(event) => event.stopPropagation()}>
        <h2>New travel</h2>
        <label>
          Title
          <input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Japan spring trip" />
        </label>
        <div className="date-pair">
          <label>
            Start
            <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </label>
          <label>
            End
            <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          </label>
        </div>
        {error ? <p className="form-error">{error}</p> : null}
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" type="submit" disabled={!canSubmit}>
            Create
          </button>
        </div>
      </form>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(`${value}T00:00:00`));
}

function formatWeekday(value: string) {
  return new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(new Date(`${value}T00:00:00`));
}

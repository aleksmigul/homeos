import { AlertTriangle, ArrowLeft, Bookmark, CalendarPlus, ChevronDown, ChevronRight, Code2, HardDrive, Inbox, ListChecks, ListTodo, Loader2, LogOut, Menu, Mic, NotebookPen, Pencil, Plane, Plus, Save, RefreshCw, ShoppingCart, Trash2, UserRound, WifiOff, X } from "lucide-react";
import { FormEvent, TouchEvent as ReactTouchEvent, useEffect, useMemo, useRef, useState } from "react";
import type { CreateTravelPlanInput, TravelPlan, TravelPlanSummary, TravelRow } from "@homeos/shared";
import { createTravelPlan, deleteTravelPlan, getAuthConfig, getCurrentUser, getTravelPlan, listAuthAccounts, listTravelPlans, logout, signInWithGoogle, switchAccount, updateTravelRow, warmOfflineCache, warmTravelOfflineCache, type AuthUser } from "./api";
import { RichNotes } from "./components/RichNotes";
import { StackEditNotesEditor } from "./components/StackEditNotesEditor";
import { ChecklistModule } from "./ChecklistModule";
import { TravelInbox } from "./TravelInbox";
import { TripEmails } from "./TripEmails";
import { BookmarksModule, type SharedDraft } from "./SavedModule";
import { currentNavigation, pushNavigation, replaceNavigation, type AppModule } from "./navigation";
import { ShoppingModule } from "./ShoppingModule";
import { WeekendModule } from "./WeekendModule";
import { TodoModule } from "./TodoModule";
import { DevModule } from "./DevModule";
import { CodexTerminalModule } from "./CodexTerminalModule";
import { VoiceNotesModule } from "./VoiceNotesModule";
import { clearOfflineAccount, configureOfflineAccount, forceRefreshApp, offlineTravelSavedAt, storagePressure } from "./offline";

const today = new Date().toISOString().slice(0, 10);
const baseModules: AppModule[] = ["checklists", "todos", "weekend", "shopping", "travel", "bookmarks", "voice-notes"];

export function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [clientId, setClientId] = useState("");
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    Promise.all([getAuthConfig().catch(() => ({ googleClientId: "" })), getCurrentUser().catch(() => null)])
      .then(([config, current]) => {
        setClientId(config.googleClientId);
        setUser(current?.user ?? null);
      })
      .catch((error: unknown) => setAuthError(error instanceof Error ? error.message : "Authentication failed"))
      .finally(() => setAuthLoading(false));
  }, []);

  if (authLoading) return <AuthLoading />;
  if (!user) return <LoginPage clientId={clientId} error={authError} onError={setAuthError} onSignIn={setUser} />;

  return <Planner key={user.email} user={user} onUserChange={setUser} onLogout={() => logout().then(clearOfflineAccount).then(() => setUser(null))} />;
}

function Planner({ user, onUserChange, onLogout }: { user: AuthUser; onUserChange: (user: AuthUser) => void; onLogout: () => void }) {
  const [sharedDraft, setSharedDraft] = useState<SharedDraft | null>(() => readSharedDraft());
  const [activeModule, setActiveModule] = useState<AppModule>(() => {
    const requested = readSharedDraft() ? "bookmarks" : currentNavigation().module ?? "checklists";
    return (requested === "dev" || requested === "codex-terminal") && !user.developer ? "checklists" : requested;
  });
  const [travelScreen, setTravelScreen] = useState<"library" | "inbox" | "plan">(() => currentNavigation().travelScreen ?? "library");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [plans, setPlans] = useState<TravelPlanSummary[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<TravelPlan | null>(null);
  const [editingRowId, setEditingRowId] = useState<string | null>(() => currentNavigation().travelRowId ?? null);
  const [expandedRowIds, setExpandedRowIds] = useState<Set<string>>(() => new Set());
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState("Ready");
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [storageWarning, setStorageWarning] = useState("");
  const [travelOffline, setTravelOffline] = useState("Preparing offline copy…");
  const [travelOfflineTime, setTravelOfflineTime] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [accounts, setAccounts] = useState<{ email: string }[]>([]);
  const [accountError, setAccountError] = useState("");
  const titleSwipe = useRef<{ x: number; y: number } | null>(null);
  const modules = user.developer ? [...baseModules, "dev" as const, "codex-terminal" as const] : baseModules;

  async function openAccountMenu() {
    if (!user.developer) return;
    const open = !accountMenuOpen;
    setAccountMenuOpen(open);
    setAccountError("");
    if (open && user.developer && accounts.length === 0) {
      try { setAccounts((await listAuthAccounts()).accounts); }
      catch (error) { setAccountError(error instanceof Error ? error.message : "Could not load accounts"); }
    }
  }

  async function selectAccount(email: string) {
    if (email === user.email) { setAccountMenuOpen(false); return; }
    setAccountError("");
    try {
      const { user: nextUser } = await switchAccount(email);
      await clearOfflineAccount();
      onUserChange(nextUser);
    } catch (error) {
      setAccountError(error instanceof Error ? error.message : "Could not switch accounts");
    }
  }

  useEffect(() => {
    void bootstrap();
    replaceNavigation({ module: activeModule, travelScreen });
    const onPopState = () => {
      const navigation = currentNavigation();
      setActiveModule((navigation.module === "dev" || navigation.module === "codex-terminal") && !user.developer ? "checklists" : navigation.module ?? "checklists");
      setTravelScreen(navigation.travelScreen ?? "library");
      setIsMobileMenuOpen(false);
      setEditingRowId(navigation.travelRowId ?? null);
      if (navigation.travelScreen === "plan" && navigation.travelPlanId) void loadPlan(navigation.travelPlanId);
      else setSelectedPlan(null);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    let active = true;
    const sync = async () => {
      if (!navigator.onLine) return;
      setIsOffline(false);
      setTravelOffline("Downloading trips for offline use…");
      try {
        await configureOfflineAccount(user.email, user);
        const savedAt = await warmTravelOfflineCache(user.email);
        if (active) { setTravelOffline("Available offline"); setTravelOfflineTime(savedAt); }
        void warmOfflineCache().catch(cause => console.warn("Other offline modules could not be fully updated", cause));
      } catch (cause) {
        if (active) setTravelOffline("Offline download incomplete. Reopen online to retry.");
        console.warn("Offline snapshot could not be fully updated", cause);
      }
      const storage = await storagePressure().catch(() => null);
      setStorageWarning(storage && storage.ratio >= 0.8 ? `Offline storage is ${Math.round(storage.ratio * 100)}% full.` : "");
    };
    const offline = () => setIsOffline(true);
    const online = () => void sync();
    window.addEventListener("offline", offline); window.addEventListener("online", online);
    navigator.serviceWorker?.addEventListener("controllerchange", online);
    void offlineTravelSavedAt().then(savedAt => {
      if (!active) return;
      setTravelOfflineTime(savedAt);
      if (!navigator.onLine) setTravelOffline(savedAt ? "Available offline" : "No complete offline copy saved yet.");
    }).catch(() => { if (active) setTravelOffline("Offline storage is unavailable in this browser."); });
    if (navigator.onLine) void sync();
    return () => { active = false; window.removeEventListener("offline", offline); window.removeEventListener("online", online); navigator.serviceWorker?.removeEventListener("controllerchange", online); };
  }, [user.email]);

  const offlineStatus = <small className="travel-offline-status" role="status" title={travelOfflineTime ? `Last complete download: ${new Date(travelOfflineTime).toLocaleString()}` : undefined}>{travelOffline}</small>;

  async function refreshApp() {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshError("");
    try { await forceRefreshApp(); }
    catch (cause) {
      setRefreshError(cause instanceof Error ? cause.message : "Could not refresh the app.");
      setRefreshing(false);
    }
  }

  function navigateModule(module: AppModule) {
    if (module !== activeModule || (module === "travel" && travelScreen !== "library")) {
      pushNavigation({ module, weekendHistory: undefined, checklist: undefined, imageId: undefined, emailId: undefined, dialog: undefined, todoListId: undefined, noteId: undefined, travelScreen: module === "travel" ? "library" : undefined, travelPlanId: undefined, travelRowId: undefined });
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
    pushNavigation({ module: "travel", travelScreen: "plan", travelPlanId: id, travelRowId: undefined, emailId: undefined });
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
    setExpandedRowIds(new Set());
    setEditingRowId(currentNavigation().travelRowId ?? null);
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
      setSelectedPlan(plan => plan ? { ...plan, rows: plan.rows.map(item => item.id === row.id && item.theme === row.theme && item.hotel === row.hotel && item.notes === row.notes ? travelRow : item) } : plan);
      setStatus("Saved");
      return true;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Save failed");
      return false;
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
    setExpandedRowIds(new Set());
    setEditingRowId(currentNavigation().travelRowId ?? null);
    pushNavigation({ module: "travel", travelScreen: "plan", travelPlanId: travelPlan.id, travelRowId: undefined, emailId: undefined });
    setTravelScreen("plan");
    setIsCreateOpen(false);
    setStatus("Created");
  }

  async function handleDeletePlan(plan: TravelPlan) {
    if (!window.confirm(`Delete “${plan.title}”? This cannot be undone.`)) return;
    setStatus("Deleting");
    try {
      await deleteTravelPlan(plan.id);
      setPlans((items) => items.filter((item) => item.id !== plan.id));
      setSelectedPlan(null);
      setExpandedRowIds(new Set());
      pushNavigation({ module: "travel", travelScreen: "library", travelPlanId: undefined, emailId: undefined });
      setTravelScreen("library");
      setStatus("Ready");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Delete failed");
    }
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
            <button className={activeModule === "weekend" ? "active" : ""} onClick={() => navigateModule("weekend")}><CalendarPlus size={17} /><span>Weekends</span></button>
            <button className={activeModule === "shopping" ? "active" : ""} onClick={() => navigateModule("shopping")}><ShoppingCart size={17} /><span>Shopping</span></button>
            <button className={activeModule === "travel" ? "active" : ""} onClick={() => navigateModule("travel")}><Plane size={17} /><span>Travel</span></button>
            <button className={activeModule === "bookmarks" ? "active" : ""} onClick={() => navigateModule("bookmarks")}><Bookmark size={17} /><span>Bookmarks</span></button>
            <button className={activeModule === "voice-notes" ? "active" : ""} onClick={() => navigateModule("voice-notes")}><Mic size={17} /><span>Voice notes</span></button>
            {user.developer ? <button className={activeModule === "dev" ? "active" : ""} onClick={() => navigateModule("dev")}><Code2 size={17} /><span>Dev</span></button> : null}
            {user.developer ? <button className={activeModule === "codex-terminal" ? "active" : ""} onClick={() => navigateModule("codex-terminal")}><Code2 size={17} /><span>Codex Terminal</span></button> : null}
          </nav>
        </div>
        <div className="account-card-wrap">
        <button className="app-refresh" type="button" aria-label={refreshing ? "Refreshing app" : "Force refresh app"} aria-busy={refreshing} disabled={refreshing || isOffline} onClick={() => void refreshApp()} title="Reload the latest app and shared data. Save any edits first."><RefreshCw size={17} className={refreshing ? "spin" : undefined} /><span>{refreshing ? "Refreshing…" : "Force refresh"}</span></button>
        {refreshError ? <p className="account-menu-error app-refresh-error" role="alert">{refreshError}</p> : null}
        {accountMenuOpen ? <div className="account-menu">
          <p>Debug as</p>
          {accounts.map((account) => <button className={account.email === user.email ? "active" : ""} type="button" key={account.email} onClick={() => void selectAccount(account.email)}><UserRound size={15} /><span>{account.email}</span>{account.email === user.email ? <small>Current</small> : null}</button>)}
          {accountError ? <div className="account-menu-error">{accountError}</div> : null}
        </div> : null}
        <div className="account-card">
          <button className="account-identity" type="button" aria-label={user.developer ? "Switch account" : "Account"} aria-expanded={user.developer ? accountMenuOpen : undefined} disabled={!user.developer} onClick={() => void openAccountMenu()}>
          {user.picture ? <img src={user.picture} alt="" referrerPolicy="no-referrer" /> : <span className="account-avatar"><UserRound size={17} /></span>}
          <span><strong>{user.name}</strong><small>{user.email}</small></span>
          {user.developer ? <ChevronDown size={14} /> : null}
          </button>
          <button className="account-logout" type="button" aria-label="Sign out" onClick={onLogout}><LogOut size={16} /></button>
        </div>
        </div>
      </aside>

      {activeModule === "checklists" ? <ChecklistModule /> : activeModule === "todos" ? <TodoModule /> : activeModule === "weekend" ? <WeekendModule /> : activeModule === "shopping" ? <ShoppingModule /> : activeModule === "bookmarks" ? <BookmarksModule sharedDraft={sharedDraft} onSharedDraftDone={() => setSharedDraft(null)} /> : activeModule === "voice-notes" ? <VoiceNotesModule /> : activeModule === "dev" ? <DevModule /> : activeModule === "codex-terminal" && user.developer ? <CodexTerminalModule /> : <section className="workspace travel-workspace">
        {travelScreen === "library" ? <>
          <header className="topbar checklist-topbar">
            <div><p className="eyebrow">Trips & reservations</p><h1>Travel</h1>{offlineStatus}</div>
            <button className="primary-button add-action" type="button" disabled={isOffline} onClick={() => setIsCreateOpen(true)}><Plus size={17} /><span>New trip</span></button>
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
            <div className="detail-title"><p className="eyebrow">Travel</p><h1>Inbox</h1>{offlineStatus}</div>
          </header>
          <TravelInbox />
        </> : selectedPlan ? <>
          <header className="topbar detail-topbar travel-detail-topbar">
            <button className="icon-button" type="button" aria-label="Back to travel" onClick={() => window.history.back()}><ArrowLeft size={20} /></button>
            <div className="detail-title"><p>{formatDate(selectedPlan.startDate)} – {formatDate(selectedPlan.endDate)}</p><h1>{selectedPlan.title}</h1>{offlineStatus}</div>
            <div className="travel-plan-actions">
              <button className="icon-button danger" type="button" disabled={isOffline} aria-label={`Delete ${selectedPlan.title}`} title="Delete trip" onClick={() => void handleDeletePlan(selectedPlan)}><Trash2 size={18} /></button>
              <div className="status-pill">{isLoading ? <Loader2 className="spin" size={14} /> : <Save size={14} />}{status}</div>
            </div>
          </header>
          {editingRowId && !isOffline ? <RowPage key={editingRowId} row={selectedPlan.rows.find(row => row.id === editingRowId) ?? null} onChange={patchLocalRow} onSave={saveRow} onClose={() => { setEditingRowId(null); replaceNavigation({ travelRowId: undefined }); }} /> : <>
            <TravelTable rows={selectedPlan.rows} expandedRowIds={expandedRowIds} readOnly={isOffline}
              onToggle={id => setExpandedRowIds(current => {
                const next = new Set(current);
                if (next.has(id)) next.delete(id); else next.add(id);
                return next;
              })}
              onToggleAll={expand => setExpandedRowIds(new Set(expand ? selectedPlan.rows.map(row => row.id) : []))}
              onEdit={id => { setEditingRowId(id); pushNavigation({ travelRowId: id }); window.scrollTo(0, 0); }} />
            <TripEmails key={selectedPlan.id} planId={selectedPlan.id} />
          </>}
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
        {clientId ? <div ref={buttonRef} className="google-button" /> : <p className="auth-error">{navigator.onLine ? "Google Sign-In still needs its client ID." : "Connect to the internet to sign in and download trips."}</p>}
        {error ? <p className="auth-error">{error}</p> : null}
      </section>
    </main>
  );
}

function TravelTable({ rows, expandedRowIds, readOnly, onToggle, onToggleAll, onEdit }: {
  rows: TravelRow[]; expandedRowIds: ReadonlySet<string>; onToggle: (id: string) => void;
  readOnly: boolean;
  onToggleAll: (expand: boolean) => void; onEdit: (id: string) => void;
}) {
  const allExpanded = rows.length > 0 && rows.every(row => expandedRowIds.has(row.id));
  return <section className="table-wrap" aria-label="Travel itinerary table">
    <div className="itinerary-controls">
      <h2>Itinerary</h2>
      <button type="button" className="secondary-button" aria-expanded={allExpanded} aria-controls="travel-days" disabled={!rows.length} onClick={() => onToggleAll(!allExpanded)}>
        {allExpanded ? <ChevronRight size={16} /> : <ChevronDown size={16} />}{allExpanded ? "Collapse all days" : "Expand all days"}
      </button>
    </div>
    <div className="table-header row"><span>Date</span><span>Theme</span><span /></div>
    <div id="travel-days">{rows.map(row => <div key={row.id} className="itinerary-day">
      <div className={expandedRowIds.has(row.id) ? "itinerary-row row selected" : "itinerary-row row"}>
        <span className="date-cell"><strong>{formatWeekday(row.date)}</strong><small>{formatDate(row.date)}</small></span>
        <button type="button" className="day-theme" aria-expanded={expandedRowIds.has(row.id)} aria-controls={`notes-${row.id}`} onClick={() => onToggle(row.id)}>
          {expandedRowIds.has(row.id) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}<span>{row.theme || "View day details"}</span>
        </button>
        <button type="button" className="day-edit" disabled={readOnly} aria-label={`Edit day ${row.date}`} title="Edit day" onClick={() => onEdit(row.id)}><Pencil size={14} aria-hidden="true" /></button>
      </div>
      {expandedRowIds.has(row.id) && <div className="day-details" id={`notes-${row.id}`}><p className="day-hotel"><strong>Hotel:</strong> {row.hotel || "—"}</p><RichNotes value={row.notes} /></div>}
    </div>)}</div>
  </section>;
}

function RowPage({
  row,
  onChange,
  onSave,
  onClose
}: {
  row: TravelRow | null;
  onChange: (id: string, patch: Partial<TravelRow>) => void;
  onSave: (row: TravelRow) => Promise<boolean>;
  onClose: () => void;
}) {
  const [editingNotes, setEditingNotes] = useState(false);
  if (!row) {
    return (
      <aside className="row-page">
        <NotebookPen size={18} />
      </aside>
    );
  }

  return (
    <aside className="row-page travel-day-editor">
      <button className="secondary-button" type="button" disabled={editingNotes} onClick={onClose}><ArrowLeft size={16} /> Back to itinerary</button>
      <div className="row-page-title">
        <CalendarPlus size={18} />
        <div>
          <p>
            {formatWeekday(row.date)}, {formatDate(row.date)}
          </p>
          <h2>Edit day</h2>
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
        <StackEditNotesEditor
          key={row.id}
          onBusyChange={setEditingNotes}
          value={row.notes}
          onChange={(notes) => onChange(row.id, { notes })}
          onCommit={async (notes) => { if (await onSave({ ...row, notes }) === false) throw new Error("Could not save notes. Please retry."); }}
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

import { Archive, Check, ChevronDown, ChevronRight, History, ListPlus, Loader2, Lock, Pencil, Plus, ShoppingCart, X } from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { ShoppingEditLock, ShoppingList, ShoppingListSummary } from "@homeos/shared";
import { acquireShoppingLock, archiveCurrentShoppingList, getShoppingList, getShoppingOverview, importShoppingItems, releaseShoppingLock, renewShoppingLock, updateCurrentShoppingList, updateShoppingItem } from "./api";
import { currentNavigation, pushNavigation } from "./navigation";

export function ShoppingModule() {
  const [current, setCurrent] = useState<ShoppingList | null>(null);
  const [archived, setArchived] = useState<ShoppingListSummary[]>([]);
  const [expanded, setExpanded] = useState<ShoppingList | null>(null);
  const [editing, setEditing] = useState<{ lock: ShoppingEditLock } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const editingRef = useRef(false);

  async function refresh(silent = false) {
    if (!silent) setLoading(true);
    try { const result = await getShoppingOverview(); setCurrent(result.current); setArchived(result.archived); }
    catch (cause) { setError(message(cause)); }
    finally { if (!silent) setLoading(false); }
  }

  useEffect(() => { void refresh(); const timer = window.setInterval(() => { if (!editingRef.current) void refresh(true); }, 15000); return () => window.clearInterval(timer); }, []);
  useEffect(() => {
    if (!editing) return;
    const onPopState = () => { if (currentNavigation().dialog !== "shopping-editor") void finishEditing(); };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [editing]);

  async function toggleItem(id: string, checked: boolean) {
    if (!current) return;
    setCurrent({ ...current, checkedCount: current.checkedCount + (checked ? 1 : -1), items: current.items.map((item) => item.id === id ? { ...item, checked } : item) });
    try { const { item } = await updateShoppingItem(id, checked); setCurrent((list) => list ? { ...list, items: list.items.map((entry) => entry.id === id ? item : entry) } : list); }
    catch (cause) { setError(message(cause)); await refresh(true); }
  }

  async function beginEditing() {
    setError("");
    try { const { lock } = await acquireShoppingLock(); editingRef.current = true; setEditing({ lock }); pushNavigation({ module: "shopping", dialog: "shopping-editor" }); }
    catch (cause) { setError(message(cause)); }
  }

  async function finishEditing() {
    const token = editing?.lock.token; editingRef.current = false; setEditing(null);
    if (token) await releaseShoppingLock(token);
  }

  function closeEditor() { if (currentNavigation().dialog === "shopping-editor") window.history.back(); else void finishEditing(); }

  async function importFrom(source: ShoppingListSummary, mode: "all" | "unchecked") {
    setError("");
    try {
      const { lock } = await acquireShoppingLock();
      try { const result = await importShoppingItems(lock.token, source.id, mode); setCurrent(result.shoppingList); setError(result.addedCount ? `Added ${result.addedCount} item${result.addedCount === 1 ? "" : "s"}.` : "Nothing new to add."); }
      finally { await releaseShoppingLock(lock.token); }
      await refresh(true);
    } catch (cause) { setError(message(cause)); }
  }

  async function toggleArchived(list: ShoppingListSummary) {
    if (expanded?.id === list.id) { setExpanded(null); return; }
    try { setExpanded((await getShoppingList(list.id)).shoppingList); } catch (cause) { setError(message(cause)); }
  }

  return <section className="workspace shopping-workspace">
    <header className="topbar shopping-topbar"><div><p className="eyebrow">Shared household list</p><h1>Shopping</h1></div><button className="primary-button touch-button add-action" onClick={() => void beginEditing()}><Plus size={18} /><span>Add or edit</span></button></header>
    <div className="shopping-layout">
      {error ? <p className={error.startsWith("Added") || error.startsWith("Nothing") ? "inline-notice" : "inline-error"}>{error}</p> : null}
      {loading || !current ? <div className="skeleton-card" /> : <article className="current-shopping-card">
        <header><div><span className="pinned-label"><ShoppingCart size={14} />Current list</span><h2>{current.title}</h2><p>{current.checkedCount} of {current.itemCount} picked up</p></div><button className="secondary-button touch-button" onClick={() => void beginEditing()}><Pencil size={16} />Edit</button></header>
        <div className="shopping-progress"><span style={{ width: `${current.itemCount ? current.checkedCount / current.itemCount * 100 : 0}%` }} /></div>
        {current.items.length ? <div className="shopping-items">{current.items.map((item) => <button className={item.checked ? "shopping-item checked" : "shopping-item"} key={item.id} onClick={() => void toggleItem(item.id, !item.checked)}><span>{item.checked ? <Check size={18} strokeWidth={3} /> : null}</span><strong>{item.label}</strong></button>)}</div> : <div className="shopping-empty"><ShoppingCart size={28} /><h3>Your list is empty</h3><p>Add one item per line and it will be ready for both of you.</p></div>}
      </article>}

      <section className="shopping-history"><div className="section-heading"><div><p className="eyebrow">Previous trips</p><h2>List history</h2></div><History size={19} /></div>
        {!loading && !archived.length ? <p className="history-empty">Finished shopping lists will appear here.</p> : null}
        <div className="shopping-history-list">{archived.map((list) => <article key={list.id} className="shopping-history-card">
          <button className="shopping-history-summary" onClick={() => void toggleArchived(list)}><span><strong>{list.title}</strong><small>{formatDate(list.archivedAt ?? list.createdAt)} · {list.checkedCount}/{list.itemCount} picked up</small></span>{expanded?.id === list.id ? <ChevronDown size={18} /> : <ChevronRight size={18} />}</button>
          {expanded?.id === list.id ? <div className="archived-shopping-items">{expanded.items.map((item) => <span className={item.checked ? "checked" : ""} key={item.id}><i>{item.checked ? <Check size={13} /> : null}</i>{item.label}</span>)}</div> : null}
          <footer><button onClick={() => void importFrom(list, "unchecked")}><ListPlus size={15} />Add unchecked</button><button onClick={() => void importFrom(list, "all")}><ListPlus size={15} />Add all</button></footer>
        </article>)}</div>
      </section>
    </div>
    {editing && current ? <ShoppingEditor list={current} lock={editing.lock} onClose={closeEditor} onSaved={async (list) => { setCurrent(list); closeEditor(); await refresh(true); }} onArchived={async (list) => { setCurrent(list); closeEditor(); await refresh(); }} /> : null}
  </section>;
}

function ShoppingEditor({ list, lock, onClose, onSaved, onArchived }: { list: ShoppingList; lock: ShoppingEditLock; onClose: () => void; onSaved: (list: ShoppingList) => Promise<void>; onArchived: (list: ShoppingList) => Promise<void> }) {
  const [title, setTitle] = useState(list.title);
  const [itemsText, setItemsText] = useState(list.items.map((item) => item.label).join("\n"));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const labels = useMemo(() => [...new Map(itemsText.split(/\r?\n/).map((value) => value.trim()).filter(Boolean).map((value) => [value.toLocaleLowerCase(), value])).values()], [itemsText]);

  useEffect(() => { const timer = window.setInterval(() => void renewShoppingLock(lock.token).catch(() => setError("Your edit lock expired. Close and reopen the editor.")), 45000); return () => window.clearInterval(timer); }, [lock.token]);

  async function save(event: FormEvent) { event.preventDefault(); setSaving(true); setError(""); try { await onSaved((await updateCurrentShoppingList(lock.token, title.trim(), labels)).shoppingList); } catch (cause) { setError(message(cause)); setSaving(false); } }
  async function archive() { if (!window.confirm("Finish this shopping trip and start a fresh list?")) return; setSaving(true); try { await onArchived((await archiveCurrentShoppingList(lock.token)).shoppingList); } catch (cause) { setError(message(cause)); setSaving(false); } }

  return <div className="modal-backdrop editor-backdrop"><form className="checklist-editor shopping-editor" onSubmit={(event) => void save(event)}><header><div><p className="eyebrow"><Lock size={12} />Locked for you while editing</p><h2>Edit current list</h2></div><button type="button" className="icon-button" onClick={onClose}><X size={20} /></button></header><label>List name<input value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} /></label><label>Items <span className="optional">One item per line</span><textarea className="items-textarea" autoFocus value={itemsText} onChange={(event) => setItemsText(event.target.value)} placeholder={'Milk\nBread\nCoffee'} /></label>{error ? <p className="inline-error">{error}</p> : null}<footer className="shopping-editor-actions"><button type="button" className="archive-list-button" disabled={saving} onClick={() => void archive()}><Archive size={16} />Finish list</button><span /><button type="button" className="secondary-button touch-button" onClick={onClose}>Cancel</button><button className="primary-button touch-button" disabled={saving || !title.trim()}>{saving ? <Loader2 className="spin" size={17} /> : null}Save</button></footer></form></div>;
}

function message(cause: unknown) { return cause instanceof Error ? cause.message : "Something went wrong"; }
function formatDate(value: string) { return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value)); }

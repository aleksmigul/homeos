import { Archive, Check, ChevronDown, ChevronRight, History, ListPlus, Loader2, Lock, Pencil, Plus, ShoppingCart, X } from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { ShoppingEditLock, ShoppingItem, ShoppingList, ShoppingListSummary } from "@homeos/shared";
import { acquireShoppingLock, addShoppingItem, archiveCurrentShoppingList, createShoppingList, getShoppingList, getShoppingOverview, importShoppingItems, releaseShoppingLock, renewShoppingLock, updateCurrentShoppingList, updateShoppingItem } from "./api";
import { currentNavigation, pushNavigation } from "./navigation";

const orderItems = (items: ShoppingItem[]) => [...items].sort((a, b) => Number(a.checked) - Number(b.checked) || a.sortOrder - b.sortOrder);

export function ShoppingModule() {
  const [current, setCurrent] = useState<ShoppingList[]>([]);
  const [archived, setArchived] = useState<ShoppingListSummary[]>([]);
  const [expanded, setExpanded] = useState<ShoppingList | null>(null);
  const [editing, setEditing] = useState<{ list: ShoppingList; lock: ShoppingEditLock } | null>(null);
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

  function replaceList(list: ShoppingList) { setCurrent((lists) => lists.map((entry) => entry.id === list.id ? list : entry)); }

  async function toggleItem(listId: string, id: string, checked: boolean) {
    setCurrent((lists) => lists.map((list) => list.id !== listId ? list : { ...list, checkedCount: list.checkedCount + (checked ? 1 : -1), items: orderItems(list.items.map((item) => item.id === id ? { ...item, checked } : item)) }));
    try { const { item } = await updateShoppingItem(id, checked); setCurrent((lists) => lists.map((list) => list.id !== listId ? list : { ...list, items: orderItems(list.items.map((entry) => entry.id === id ? item : entry)) })); }
    catch (cause) { setError(message(cause)); await refresh(true); }
  }

  async function quickAdd(listId: string, label: string) {
    setError("");
    try { const result = await addShoppingItem(listId, label); replaceList(result.shoppingList); if (result.skippedCount) setError("That item is already on this list."); }
    catch (cause) { setError(message(cause)); }
  }

  async function beginEditing(list: ShoppingList) {
    setError("");
    try { const { lock } = await acquireShoppingLock(list.id); editingRef.current = true; setEditing({ list, lock }); pushNavigation({ module: "shopping", dialog: "shopping-editor" }); }
    catch (cause) { setError(message(cause)); }
  }

  async function addList() {
    const title = window.prompt("Name this shopping list", "Shopping list")?.trim();
    if (!title) return;
    try { const { shoppingList } = await createShoppingList(title); setCurrent((lists) => [...lists, shoppingList]); }
    catch (cause) { setError(message(cause)); }
  }

  async function finishEditing() { const token = editing?.lock.token; editingRef.current = false; setEditing(null); if (token) await releaseShoppingLock(token); }
  function closeEditor() { if (currentNavigation().dialog === "shopping-editor") window.history.back(); else void finishEditing(); }

  async function importFrom(source: ShoppingListSummary, mode: "all" | "unchecked") {
    const target = current.length === 1 ? current[0] : current.find((list) => list.title.toLocaleLowerCase() === window.prompt(`Add to which list?\n${current.map((list) => list.title).join("\n")}`)?.trim().toLocaleLowerCase());
    if (!target) return;
    setError("");
    try { const { lock } = await acquireShoppingLock(target.id); try { const result = await importShoppingItems(lock.token, source.id, mode); replaceList(result.shoppingList); setError(result.addedCount ? `Added ${result.addedCount} item${result.addedCount === 1 ? "" : "s"}.` : "Nothing new to add."); } finally { await releaseShoppingLock(lock.token); } }
    catch (cause) { setError(message(cause)); }
  }

  async function toggleArchived(list: ShoppingListSummary) { if (expanded?.id === list.id) { setExpanded(null); return; } try { setExpanded((await getShoppingList(list.id)).shoppingList); } catch (cause) { setError(message(cause)); } }

  return <section className="workspace shopping-workspace">
    <header className="topbar shopping-topbar"><div><p className="eyebrow">Shared household lists</p><h1>Shopping</h1></div><button className="primary-button touch-button add-action" onClick={() => void addList()}><Plus size={18} /><span>New list</span></button></header>
    <div className="shopping-layout">
      {error ? <p className={error.startsWith("Added") || error.startsWith("Nothing") ? "inline-notice" : "inline-error"}>{error}</p> : null}
      {loading ? <div className="skeleton-card" /> : <div className="current-shopping-lists">{current.map((list) => <article className="current-shopping-card" key={list.id}>
        <header><div><span className="pinned-label"><ShoppingCart size={14} />Active list</span><h2>{list.title}</h2><p>{list.checkedCount} of {list.itemCount} picked up</p></div><button className="secondary-button touch-button" onClick={() => void beginEditing(list)}><Pencil size={16} />Bulk edit</button></header>
        <QuickAdd onAdd={(label) => quickAdd(list.id, label)} />
        <div className="shopping-progress"><span style={{ width: `${list.itemCount ? list.checkedCount / list.itemCount * 100 : 0}%` }} /></div>
        {list.items.length ? <div className="shopping-items">{list.items.map((item) => <button className={item.checked ? "shopping-item checked" : "shopping-item"} key={item.id} onClick={() => void toggleItem(list.id, item.id, !item.checked)}><span>{item.checked ? <Check size={18} strokeWidth={3} /> : null}</span><strong>{item.label}</strong></button>)}</div> : <div className="shopping-empty"><ShoppingCart size={28} /><h3>Your list is empty</h3><p>Quick-add an item to get started.</p></div>}
      </article>)}</div>}
      <section className="shopping-history"><div className="section-heading"><div><p className="eyebrow">Previous trips</p><h2>List history</h2></div><History size={19} /></div>
        {!loading && !archived.length ? <p className="history-empty">Finished shopping lists will appear here.</p> : null}
        <div className="shopping-history-list">{archived.map((list) => <article key={list.id} className="shopping-history-card"><button className="shopping-history-summary" onClick={() => void toggleArchived(list)}><span><strong>{list.title}</strong><small>{formatDate(list.archivedAt ?? list.createdAt)} · {list.checkedCount}/{list.itemCount} picked up</small></span>{expanded?.id === list.id ? <ChevronDown size={18} /> : <ChevronRight size={18} />}</button>{expanded?.id === list.id ? <div className="archived-shopping-items">{expanded.items.map((item) => <span className={item.checked ? "checked" : ""} key={item.id}><i>{item.checked ? <Check size={13} /> : null}</i>{item.label}</span>)}</div> : null}<footer><button onClick={() => void importFrom(list, "unchecked")}><ListPlus size={15} />Add unchecked</button><button onClick={() => void importFrom(list, "all")}><ListPlus size={15} />Add all</button></footer></article>)}</div>
      </section>
    </div>
    {editing ? <ShoppingEditor list={editing.list} lock={editing.lock} onClose={closeEditor} onSaved={async (list) => { replaceList(list); closeEditor(); await refresh(true); }} onArchived={async () => { closeEditor(); await refresh(); }} /> : null}
  </section>;
}

function QuickAdd({ onAdd }: { onAdd: (label: string) => Promise<void> }) {
  const [label, setLabel] = useState(""); const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); const value = label.trim(); if (!value) return; setSaving(true); await onAdd(value); setLabel(""); setSaving(false); }
  return <form className="shopping-quick-add" onSubmit={(event) => void submit(event)}><input aria-label="Quick add item" maxLength={300} placeholder="Add an item" value={label} onChange={(event) => setLabel(event.target.value)} /><button className="primary-button" disabled={saving || !label.trim()}><Plus size={16} />Add</button></form>;
}

function ShoppingEditor({ list, lock, onClose, onSaved, onArchived }: { list: ShoppingList; lock: ShoppingEditLock; onClose: () => void; onSaved: (list: ShoppingList) => Promise<void>; onArchived: () => Promise<void> }) {
  const [title, setTitle] = useState(list.title); const [itemsText, setItemsText] = useState([...list.items].sort((a, b) => a.sortOrder - b.sortOrder).map((item) => item.label).join("\n")); const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  const labels = useMemo(() => [...new Map(itemsText.split(/\r?\n/).map((value) => value.trim()).filter(Boolean).map((value) => [value.toLocaleLowerCase(), value])).values()], [itemsText]);
  useEffect(() => { const timer = window.setInterval(() => void renewShoppingLock(lock.token).catch(() => setError("Your edit lock expired. Close and reopen the editor.")), 45000); return () => window.clearInterval(timer); }, [lock.token]);
  async function save(event: FormEvent) { event.preventDefault(); setSaving(true); setError(""); try { await onSaved((await updateCurrentShoppingList(lock.token, title.trim(), labels)).shoppingList); } catch (cause) { setError(message(cause)); setSaving(false); } }
  async function archive() { if (!window.confirm("Finish this shopping list?")) return; setSaving(true); try { await archiveCurrentShoppingList(lock.token); await onArchived(); } catch (cause) { setError(message(cause)); setSaving(false); } }
  return <div className="modal-backdrop editor-backdrop"><form className="checklist-editor shopping-editor" onSubmit={(event) => void save(event)}><header><div><p className="eyebrow"><Lock size={12} />Locked for you while editing</p><h2>Bulk edit list</h2></div><button type="button" className="icon-button" onClick={onClose}><X size={20} /></button></header><label>List name<input value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} /></label><label>Items <span className="optional">One item per line</span><textarea className="items-textarea" autoFocus value={itemsText} onChange={(event) => setItemsText(event.target.value)} placeholder={'Milk\nBread\nCoffee'} /></label>{error ? <p className="inline-error">{error}</p> : null}<footer className="shopping-editor-actions"><button type="button" className="archive-list-button" disabled={saving} onClick={() => void archive()}><Archive size={16} />Finish list</button><span /><button type="button" className="secondary-button touch-button" onClick={onClose}>Cancel</button><button className="primary-button touch-button" disabled={saving || !title.trim()}>{saving ? <Loader2 className="spin" size={17} /> : null}Save</button></footer></form></div>;
}

function message(cause: unknown) { return cause instanceof Error ? cause.message : "Something went wrong"; }
function formatDate(value: string) { return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value)); }

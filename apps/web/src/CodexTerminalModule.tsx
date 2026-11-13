import { useEffect, useRef, useState, type FormEvent } from "react";
import { Plus, RefreshCw, SquareTerminal, Trash2, Send, Loader2 } from "lucide-react";
import type { Terminal } from "@xterm/xterm";
import { listCodexTerminalSessions, createCodexTerminalSession, endCodexTerminalSession, type CodexTerminalSession } from "./api";
import "@xterm/xterm/css/xterm.css";

const selectionKey = "homeos-codex-terminal-session";
export function CodexTerminalModule() {
  const [sessions, setSessions] = useState<CodexTerminalSession[]>([]);
  const [selected, setSelected] = useState(() => localStorage.getItem(selectionKey) ?? "");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [connection, setConnection] = useState("Disconnected");
  const [retry, setRetry] = useState(0);
  const [draft, setDraft] = useState("");
  const host = useRef<HTMLDivElement>(null);
  const socket = useRef<WebSocket | null>(null);
  const terminal = useRef<Terminal | null>(null);
  const current = sessions.find(session => session.id === selected);

  async function refresh() {
    try {
      const { sessions: items } = await listCodexTerminalSessions();
      setSessions(items);
      setSelected(value => items.some(item => item.id === value) ? value : items[0]?.id ?? "");
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load sessions"); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (selected) localStorage.setItem(selectionKey, selected);
    else localStorage.removeItem(selectionKey);
  }, [selected]);

  useEffect(() => {
    if (!selected || !host.current) return;
    let disposed = false;
    let cleanup = () => {};
    setConnection("Connecting…");
    void Promise.all([import("@xterm/xterm"), import("@xterm/addon-fit")]).then(([{ Terminal }, { FitAddon }]) => {
      if (disposed || !host.current) return;
      const term = new Terminal({
        cursorBlink: true, fontSize: 14, lineHeight: 1.2, scrollback: 10000,
        fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
        theme: { background: "#101923", foreground: "#dce6f1", cursor: "#8ab9eb", selectionBackground: "#31577b" },
        allowProposedApi: false, screenReaderMode: true, disableStdin: true
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(host.current);
      fit.fit();
      terminal.current = term;
      const endpoint = new URL(`/api/dev/terminal/sessions/${selected}/socket`, window.location.href);
      endpoint.protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(endpoint);
      ws.binaryType = "arraybuffer";
      socket.current = ws;
      const send = (message: unknown) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message)); };
      const size = () => { fit.fit(); send({ type: "resize", cols: Math.max(20, Math.min(400, term.cols)), rows: Math.max(5, Math.min(200, term.rows)) }); };
      ws.onopen = () => { if (disposed) return; setConnection("Connected"); term.options.disableStdin = false; size(); };
      ws.onmessage = event => {
        if (disposed) return;
        if (event.data instanceof ArrayBuffer) term.write(new Uint8Array(event.data));
        else term.write(event.data);
      };
      ws.onclose = event => {
        if (disposed) return;
        term.options.disableStdin = true;
        setConnection("Disconnected");
        if (event.code !== 1000) setError("Connection lost. Reconnect to the same session to continue.");
        void refresh();
      };
      ws.onerror = () => { if (!disposed) setError("Could not connect to the terminal. Reconnect or check the bridge service."); };
      const input = term.onData(data => send({ type: "input", data }));
      const binary = term.onBinary(data => send({ type: "input", data }));
      const observer = new ResizeObserver(size);
      observer.observe(host.current);
      cleanup = () => {
        observer.disconnect(); input.dispose(); binary.dispose();
        ws.onclose = null; ws.onerror = null; ws.onopen = null; ws.onmessage = null;
        ws.close(); term.dispose();
        if (socket.current === ws) socket.current = null;
        if (terminal.current === term) terminal.current = null;
      };
    }).catch(() => { if (!disposed) { setConnection("Disconnected"); setError("Could not load the terminal. Refresh to retry."); } });
    return () => { disposed = true; cleanup(); };
  }, [selected, retry]);

  async function create() {
    setBusy(true); setError("");
    try {
      const { session } = await createCodexTerminalSession();
      setSessions(items => [session, ...items]);
      setSelected(session.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not start session"); }
    finally { setBusy(false); }
  }
  async function end() {
    if (!current || !window.confirm("End this Codex session? Any running work in this terminal will stop.")) return;
    setBusy(true); setError("");
    try { await endCodexTerminalSession(current.id); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not end session"); }
    finally { setBusy(false); }
  }
  function key(data: string) {
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify({ type: "input", data }));
    terminal.current?.focus();
  }
  function sendPrompt(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim() || connection !== "Connected") return;
    terminal.current?.paste(draft);
    key("\r");
    setDraft("");
  }

  return <section className="workspace codex-terminal-workspace">
    <header className="topbar dev-topbar">
      <div><p className="eyebrow">Interactive developer tools</p><h1>Codex Terminal</h1></div>
      <button className="secondary-button add-action" type="button" aria-label="New session" title="New Codex session" disabled={busy || loading} onClick={() => void create()}>{busy ? <Loader2 className="spin" size={17} /> : <Plus size={17} />}<span>New session</span></button>
    </header>
    <div className="codex-terminal-layout">
      <div className="codex-session-bar">
        <label>Session<select aria-label="Codex session" value={selected} disabled={!sessions.length || busy} onChange={event => { setSelected(event.target.value); setDraft(""); }}>
          {!sessions.length && <option value="">No sessions</option>}
          {sessions.map(item => <option key={item.id} value={item.id}>{new Date(item.createdAt).toLocaleString()} · {item.id.slice(3, 9)}{item.ended ? " · Ended" : ""}</option>)}
        </select></label>
        <span className={`codex-connection ${connection === "Connected" ? "connected" : ""}`} role="status">{current ? current.ended ? "Ended" : connection : loading ? "Loading…" : "No active session"}</span>
        <button className="terminal-icon" type="button" aria-label="Reconnect session" title="Reconnect to this session" disabled={!selected || busy} onClick={() => { setError(""); setRetry(value => value + 1); }}><RefreshCw size={17} /></button>
        <button className="terminal-icon" type="button" aria-label="End session" title="End this session" disabled={!selected || busy} onClick={() => void end()}><Trash2 size={17} /></button>
      </div>
      {error && <p className="inline-error" role="alert">{error}</p>}
      <p className="codex-session-help">Your session keeps running when you leave. Reopen it here to continue.</p>
      <div className="codex-terminal-frame">
        <div className="codex-terminal-host" ref={host} aria-label="Interactive Codex terminal" />
        {!selected && <div className="codex-terminal-empty"><SquareTerminal size={36} /><h2>{loading ? "Loading sessions…" : "Start a Codex session"}</h2><p>Use the real Codex CLI with live output, approvals and slash commands.</p></div>}
      </div>
      <div className="codex-terminal-keys" aria-label="Terminal keys">
        {[['Esc', '\x1b'], ['Tab', '\t'], ['↑', '\x1b[A'], ['↓', '\x1b[B'], ['Enter', '\r'], ['Ctrl+C', '\x03']].map(([label, value]) => <button key={label} type="button" disabled={connection !== "Connected" || !selected} onClick={() => key(value)}>{label}</button>)}
      </div>
      {selected && <form className="codex-terminal-composer" onSubmit={sendPrompt}>
        <label htmlFor="terminal-prompt">Message to this session</label>
        <textarea id="terminal-prompt" value={draft} onChange={event => setDraft(event.target.value)} placeholder="Type here, or use the terminal directly…" onKeyDown={event => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
        <button className="primary-button" type="submit" disabled={connection !== "Connected" || !draft.trim()}><Send size={16} />Send</button>
      </form>}
    </div>
  </section>;
}

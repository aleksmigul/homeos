import { Code2, GitBranch, Loader2, Rocket, Send } from "lucide-react";
import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { createCodexRequest, listCodexRequests, requestDeploy, requestPush, type CodexRequest } from "./api";

export function DevModule() {
  const [items, setItems] = useState<CodexRequest[]>([]);
  const [prompt, setPrompt] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const latestRequest = useRef<HTMLElement>(null);
  const chronologicalItems = useMemo(() => [...items].reverse(), [items]);
  const latestId = chronologicalItems.at(-1)?.id;

  async function refresh() {
    try {
      setItems((await listCodexRequests()).requests);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load requests");
    }
  }

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    latestRequest.current?.scrollIntoView({ block: "end" });
  }, [latestId]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) return;
    setSending(true);
    setError("");
    try {
      await createCodexRequest(prompt);
      setPrompt("");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not queue request");
    } finally {
      setSending(false);
    }
  }

  function submitWithShortcut(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      e.currentTarget.form?.requestSubmit();
    }
  }

  async function deploy() {
    if (!window.confirm("Deploy the current HomeOS workspace? Checks will run first and a rollback backup will be created.")) return;
    setSending(true);
    setError("");
    try {
      await requestDeploy();
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not queue deployment");
    } finally {
      setSending(false);
    }
  }
  async function push(){if(!window.confirm("Push committed changes on main to GitHub?"))return;setSending(true);setError("");try{await requestPush();await refresh();}catch(cause){setError(cause instanceof Error?cause.message:"Could not queue push");}finally{setSending(false);}}

  return <section className="workspace dev-workspace">
    <header className="topbar dev-topbar">
      <div><p className="eyebrow">Private developer tools</p><h1>Codex</h1></div>
      <div className="topbar-actions"><button className="secondary-button add-action" disabled={sending} onClick={() => void push()}><GitBranch size={17} /><span>Push</span></button><button className="secondary-button add-action" disabled={sending} onClick={() => void deploy()}><Rocket size={17} /><span>Deploy</span></button></div>
    </header>
    <div className="dev-layout">
      <div className="dev-jobs" aria-live="polite">
        {chronologicalItems.map((item, index) => <article className="dev-job" key={item.id} ref={index === chronologicalItems.length - 1 ? latestRequest : undefined}>
          <header><span className={`dev-status ${item.status}`}>{item.kind === "deploy" || item.kind === "push" ? `${item.kind} · ${item.status}` : item.status}</span><time>{new Date(item.createdAt).toLocaleString()}</time></header>
          <p><span className="dev-prompt-marker">$</span>{item.prompt}</p>
          {item.response ? <pre>{item.response}</pre> : null}
          {item.error ? <pre className="dev-error">{item.error}</pre> : null}
        </article>)}
        {!items.length ? <div className="todo-empty dev-empty"><Code2 size={30} /><h2>No requests yet</h2><p>Queued work and Codex responses will appear here.</p></div> : null}
      </div>
      <div className="dev-composer">
        {error ? <p className="inline-error">{error}</p> : null}
        <form className="dev-prompt" onSubmit={submit}>
          <label htmlFor="dev-request">Request</label>
          <textarea id="dev-request" autoFocus value={prompt} onChange={(e) => setPrompt(e.target.value)} onKeyDown={submitWithShortcut} placeholder="Describe the change you want Codex to make…" />
          <div className="dev-prompt-actions"><span>Ctrl/⌘ + Enter to send</span><button className="primary-button" disabled={sending || !prompt.trim()}>{sending ? <Loader2 className="spin" size={17} /> : <Send size={17} />}Queue request</button></div>
        </form>
      </div>
    </div>
  </section>;
}

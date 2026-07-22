import { ArrowLeft, Inbox, Mail, Paperclip } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { TravelEmail } from "@homeos/shared";
import { getTravelInbox } from "./api";
import { currentNavigation, pushNavigation } from "./navigation";

export function TravelInbox() {
  const [emails, setEmails] = useState<TravelEmail[]>([]);
  const [address, setAddress] = useState("travel@os.theannexation.fun");
  const [configured, setConfigured] = useState(false);
  const [selected, setSelected] = useState<TravelEmail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getTravelInbox()
      .then((result) => {
        setEmails(result.emails);
        setAddress(result.address);
        setConfigured(result.configured);
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load travel inbox"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const syncEmail = () => { const id = currentNavigation().emailId; setSelected(id ? emails.find((email) => email.id === id) ?? null : null); };
    syncEmail();
    window.addEventListener("popstate", syncEmail);
    return () => window.removeEventListener("popstate", syncEmail);
  }, [emails]);

  if (selected) return <EmailReader email={selected} onBack={() => window.history.back()} />;

  return (
    <section className="travel-inbox">
      <div className="inbox-address-card">
        <span><Mail size={20} /></span>
        <div><small>Forward travel confirmations to</small><strong>{address}</strong></div>
        <span className={configured ? "inbox-live" : "inbox-pending"}>{configured ? "Live" : "Setup pending"}</span>
      </div>
      {error ? <p className="inline-error">{error}</p> : null}
      <div className="inbox-heading"><div><h2>Received mail</h2><p>Confirmations, tickets, bookings, and anything else you forward.</p></div><span>{emails.length}</span></div>
      {loading ? <div className="skeleton-card" /> : null}
      {!loading && emails.length === 0 ? <div className="inbox-empty"><Inbox size={30} /><h2>Nothing received yet</h2><p>Messages sent to the address above will show up here.</p></div> : null}
      <div className="email-list">
        {emails.map((email) => (
          <button type="button" className="email-row" key={email.id} onClick={() => { pushNavigation({ module: "travel", travelView: "inbox", emailId: email.id }); setSelected(email); }}>
            <span className="email-avatar">{senderInitial(email.sender)}</span>
            <span className="email-summary"><strong>{email.subject}</strong><small>{email.sender}</small><span>{preview(email)}</span></span>
            <span className="email-meta"><time>{formatInboxDate(email.receivedAt)}</time>{email.attachments.length ? <small><Paperclip size={12} />{email.attachments.length}</small> : null}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function EmailReader({ email, onBack }: { email: TravelEmail; onBack: () => void }) {
  const body = useMemo(() => email.text?.trim() || htmlToText(email.html) || "This message has no readable body.", [email]);
  return (
    <article className="email-reader">
      <button className="email-back" type="button" onClick={onBack}><ArrowLeft size={18} />Inbox</button>
      <header><p className="eyebrow">Received {formatDateTime(email.receivedAt)}</p><h2>{email.subject}</h2><div className="email-participants"><strong>From</strong><span>{email.sender}</span><strong>To</strong><span>{email.recipients.join(", ")}</span></div></header>
      {email.attachments.length ? <div className="attachment-list">{email.attachments.map((attachment) => <span key={attachment.id}><Paperclip size={14} /><span>{attachment.filename}<small>{formatBytes(attachment.size)}</small></span></span>)}</div> : null}
      <pre className="email-body">{body}</pre>
    </article>
  );
}

function htmlToText(html: string | null) {
  if (!html) return "";
  return new DOMParser().parseFromString(html, "text/html").body.textContent?.trim() ?? "";
}

function preview(email: TravelEmail) {
  return (email.text?.trim() || htmlToText(email.html)).replace(/\s+/g, " ").slice(0, 140);
}

function senderInitial(sender: string) {
  return sender.replace(/^.*?([\w])[^<]*<.*$/, "$1").charAt(0).toUpperCase() || "@";
}

function formatInboxDate(value: string) {
  const date = new Date(value);
  const today = new Date();
  return date.toDateString() === today.toDateString()
    ? new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date)
    : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

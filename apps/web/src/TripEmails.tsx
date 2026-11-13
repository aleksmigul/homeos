import { useEffect, useState } from "react";
import { Mail, Paperclip } from "lucide-react";
import type { TravelEmail } from "@homeos/shared";
import { getTripEmails } from "./api";
import { EmailReader } from "./TravelInbox";

export function TripEmails({ planId }: { planId: string }) {
  const [emails, setEmails] = useState<TravelEmail[]>([]);
  const [selected, setSelected] = useState<TravelEmail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    getTripEmails(planId)
      .then((result) => { if (active) setEmails(result.emails); })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "Could not load trip emails"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [planId]);

  return <section className="trip-emails" aria-label="Trip emails">
    <div className="inbox-heading"><div><h2>Trip emails</h2><p>Messages mentioning a date during this trip.</p></div><span>{emails.length}</span></div>
    {error ? <p className="inline-error">{error}</p> : loading ? <p>Loading emails…</p> : selected ?
      <EmailReader email={selected} onBack={() => setSelected(null)} backLabel="Trip emails" /> :
      emails.length ? <div className="email-list">
        {emails.map((email) => <button className="email-row" type="button" key={email.id} onClick={() => setSelected(email)}>
          <span className="email-avatar"><Mail size={18} /></span>
          <span className="email-summary"><strong>{email.subject}</strong><small>{email.sender}</small></span>
          <span className="email-meta"><time>{new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(email.receivedAt))}</time>
            {email.attachments.length ? <small><Paperclip size={12} />{email.attachments.length}</small> : null}
          </span>
        </button>)}
      </div> : <p className="trip-emails-empty">No matching emails yet. Emails without recognizable travel dates remain in the travel inbox.</p>}
  </section>;
}

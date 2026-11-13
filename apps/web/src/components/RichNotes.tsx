import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const stackEditPrefix = "<!--homeos-stackedit-->";
function stackEditContent(value: string): { text: string; html: string } | null {
  if (!value.startsWith(stackEditPrefix)) return null;
  try {
    const content = JSON.parse(value.slice(stackEditPrefix.length));
    return typeof content?.text === "string" && typeof content?.html === "string" ? content : null;
  } catch { return null; }
}
export function notesSource(value: string): string {
  return stackEditContent(value)?.text ?? (value.startsWith(prefix) ? sanitizeNotes(value.slice(prefix.length)) : value);
}
// One-way, deliberately simple migration when legacy HTML notes are opened.
export function notesMarkdown(value: string): string {
  const saved = stackEditContent(value);
  if (saved) return saved.text;
  const rich = value.startsWith(prefix);
  const source = rich ? value.slice(prefix.length) : value;
  if (!rich && !/^\s*<(?:p|div|h[1-6]|ul|ol|table|blockquote|img|pre)\b/i.test(source)) return source;
  const doc = new DOMParser().parseFromString(sanitizeNotes(source), "text/html");
  function text(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
    const el = node as Element;
    const content = Array.from(node.childNodes).map(text).join("");
    if (el.tagName === "BR") return "\n";
    if (el.tagName === "IMG") return `![Image](${el.getAttribute("src")})`;
    if (el.tagName === "LI") return `- ${content.trim()}\n`;
    if (/^H[1-6]$/.test(el.tagName)) return `${"#".repeat(Number(el.tagName[1]))} ${content.trim()}\n\n`;
    if (["P", "DIV", "UL", "OL", "PRE", "BLOCKQUOTE", "TABLE", "TR"].includes(el.tagName)) return `${content.trim()}\n\n`;
    return content;
  }
  return Array.from(doc.body.childNodes).map(text).join("").replace(/\n{3,}/g, "\n\n").trim();
}
export function encodeStackEditNotes(text: string, html: string): string {
  return stackEditPrefix + JSON.stringify({ text, html: sanitizeNotes(html) });
}
const prefix = "<!--homeos-rich-text-->";
export function sanitizeNotes(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const allowed = new Set(["P", "DIV", "BR", "H1", "H2", "H3", "STRONG", "B", "EM", "I", "U", "UL", "OL", "LI", "A", "IMG", "BLOCKQUOTE", "PRE", "CODE", "HR", "H4", "H5", "H6", "DEL", "TABLE", "THEAD", "TBODY", "TR", "TH", "TD"]);
  for (const el of Array.from(doc.body.querySelectorAll("*"))) {
    if (["SCRIPT", "STYLE", "IFRAME", "OBJECT", "SVG", "MATH"].includes(el.tagName)) { el.remove(); continue; }
    // Clipboard HTML and some browsers express formatting as inline CSS.
    // Convert just these text styles to semantic markup before removing styles.
    if (el instanceof HTMLElement && el.tagName !== "IMG") {
      const tags = [
        /^(bold|bolder|[6-9]00)$/.test(el.style.fontWeight) ? "strong" : "",
        el.style.fontStyle === "italic" ? "em" : "",
        /(^|\s)underline(\s|$)/.test(el.style.textDecorationLine || el.style.textDecoration) ? "u" : ""
      ].filter(Boolean);
      for (const tag of tags) {
        const wrapper = doc.createElement(tag);
        wrapper.append(...Array.from(el.childNodes));
        el.append(wrapper);
      }
    }
    if (!allowed.has(el.tagName)) { el.replaceWith(...Array.from(el.childNodes)); continue; }
    const href = el.getAttribute("href");
    const src = el.getAttribute("src");
    const alt = el.getAttribute("alt");
    const width = el.getAttribute("width");
    for (const attr of Array.from(el.attributes)) el.removeAttribute(attr.name);
    if (el.tagName === "A" && href && /^(https?:\/\/|mailto:|\/api\/saved-attachments\/)/i.test(href)) { el.setAttribute("href", href); el.setAttribute("rel", "noopener noreferrer"); }
    if (el.tagName === "IMG") {
      if (src && /^(https?:\/\/|\/api\/saved-attachments\/)/i.test(src)) {
        el.setAttribute("src", src);
        el.setAttribute("alt", alt || "Image");
        // Preserve only bounded pixel widths; never retain arbitrary styles from paste.
        if (width && /^\d{1,4}$/.test(width) && Number(width) >= 1 && Number(width) <= 2400) el.setAttribute("width", String(Number(width)));
      }
      else el.remove();
    }
  }
  return doc.body.innerHTML;
}
export function notesHtml(value: string) {
  const content = stackEditContent(value);
  if (content) return sanitizeNotes(content.html);
  return sanitizeNotes(value.startsWith(prefix) ? value.slice(prefix.length) : renderToStaticMarkup(<ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>));
}
export function encodeNotes(html: string) { return prefix + sanitizeNotes(html); }
export function RichNotes({ value }: { value: string }) {
  return value.trim() ? <div className="rich-notes" dangerouslySetInnerHTML={{ __html: notesHtml(value) }} /> : <p className="empty-notes">No notes yet.</p>;
}

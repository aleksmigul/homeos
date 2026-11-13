import { highlightMarkdown } from "./markdownHighlight";

const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Zero-text decorations keep CLeditor's source offsets and undo history intact.
// Only standalone Markdown images are decorated; code examples stay literal.
export function markdownSourceHtml(source: string): string {
  const images = new Map<number, string>();
  let offset = 0;
  let fence = "";
  for (const line of source.split(/(?<=\n)/)) {
    offset += line.length;
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (marker && (!fence || (marker[1][0] === fence[0] && marker[1].length >= fence.length))) {
      fence = fence ? "" : marker[1];
      continue;
    }
    if (fence) continue;
    const image = line.match(/^ {0,3}!\[[^\]\n]*\]\(\s*(https?:\/\/[^\s<>"()]+|\/api\/saved-attachments\/[a-zA-Z0-9-]+)(?:\s+"[^"\n]*")?\s*\)\s*$/i);
    if (image) images.set(offset, image[1]);
  }
  offset = 0;
  return highlightMarkdown(source).map(token => token.text.split(/(?<=\n)/).map(part => {
    offset += part.length;
    const classes = token.style.split(" ").filter(Boolean).map(style => `md-${style}`).join(" ");
    const html = `<span class="${classes}">${escape(part)}</span>`;
    const url = images.get(offset);
    return html + (url ? `<img class="md-image-preview" src="${escape(url)}" alt="Image in notes" contenteditable="false" draggable="false">` : "");
  }).join("")).join("");
}

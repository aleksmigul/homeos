import { formattingRegions } from "./markdownFormatting";

export type MarkdownToken = { text: string; style: string };

// Decoration only: every source character is retained, including unfinished syntax.
export function highlightMarkdown(source: string): MarkdownToken[] {
  const tokens: MarkdownToken[] = [];
  const listLines = new Set(formattingRegions(source).filter(region => region.format === "list")
    .map(region => source.lastIndexOf("\n", region.start - 1) + 1));
  const add = (text: string, style = "") => { if (text) tokens.push({ text, style }); };
  function inline(text: string, style = "") {
    const pattern = /(`+)([^`\n]+?)\1|(!?\[)([^\]\n]*)(\]\()([^\n)]*)(\))|(\*\*|__|~~|\*|_)(?=\S)(.+?)\8|\\([\\`*{}\[\]()#+\-.!_>~|])/g;
    let offset = 0;
    for (const match of text.matchAll(pattern)) {
      add(text.slice(offset, match.index), style);
      if (match[1]) {
        add(match[1], "syntax"); add(match[2], "code"); add(match[1], "syntax");
      } else if (match[3]) {
        add(match[3], "syntax"); inline(match[4], "link"); add(match[5], "syntax"); add(match[6], "syntax");
        add(match[7], "syntax");
      } else if (match[8]) {
        add(match[8], "syntax");
        inline(match[9], `${style} ${match[8].length === 2 ? match[8] === "~~" ? "strike" : "strong" : "emphasis"}`.trim());
        add(match[8], "syntax");
      } else { add("\\", "syntax"); add(match[10], style); }
      offset = match.index! + match[0].length;
    }
    add(text.slice(offset), style);
  }
  let fence = "";
  let lineOffset = 0;
  for (const line of source.split(/(?<=\n)/)) {
    const listLine = listLines.has(lineOffset);
    lineOffset += line.length;
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (marker && (!fence || (marker[1][0] === fence[0] && marker[1].length >= fence.length))) {
      fence = fence ? "" : marker[1]; add(line, "syntax"); continue;
    }
    if (fence || (!listLine && /^(?: {4}|\t)/.test(line))) { add(line, "code"); continue; }
    if (/^ {0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,}|=+\s*)$/.test(line.trimEnd())) { add(line, "syntax"); continue; }
    const prefix = line.match(/^( {0,3}#{1,6})([ \t]+)|^([ \t]*(?:>[ \t]*)+(?:(?:[-+*]|\d+[.)])[ \t]+)?(?:\[[ xX]\][ \t]+)?|[ \t]*(?:[-+*]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]+)?)/);
    if (prefix) {
      const bullet = listLine && /^(?:[ \t]*>[ \t]*)*[ \t]*[-+*][ \t]+/.test(prefix[0]);
      add(prefix[0], bullet ? "syntax list-marker" : "syntax");
      inline(line.slice(prefix[0].length), prefix[1] ? `heading heading-${prefix[1].trim().length}` : line.trimStart().startsWith(">") ? "quote" : "");
    } else inline(line);
  }
  return tokens;
}

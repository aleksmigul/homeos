import { fromMarkdown } from "mdast-util-from-markdown";

export type NoteFormat = "bold" | "italic" | `heading${1 | 2 | 3 | 4 | 5 | 6}` | "list" | "link";
type Edit = { start: number; end: number; text: string };
export type FormattingRegion = {
  format: NoteFormat; start: number; end: number;
  contentStart: number; contentEnd: number; markers: Edit[];
};
type MarkdownNode = {
  type: string;
  depth?: number;
  position?: { start: { offset?: number }; end: { offset?: number } };
  children?: MarkdownNode[];
};

// Use the same CommonMark parser as the preview, so escaped markers and code
// never look like formatting, and nested emphasis keeps its original offsets.
export function formattingRegions(source: string): FormattingRegion[] {
  const regions: FormattingRegion[] = [];
  function visit(node: MarkdownNode) {
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (start !== undefined && end !== undefined) {
      const raw = source.slice(start, end);
      const add = (format: NoteFormat, contentStart: number, contentEnd: number) => {
        regions.push({ format, start, end, contentStart, contentEnd, markers: [
          { start, end: contentStart, text: "" },
          { start: contentEnd, end, text: "" },
        ].filter(edit => edit.start !== edit.end) });
      };
      if (node.type === "strong" || node.type === "emphasis") {
        const width = node.type === "strong" ? 2 : 1;
        add(node.type === "strong" ? "bold" : "italic", start + width, end - width);
      } else if ((node.type === "link" || node.type === "linkReference") && raw.startsWith("[")) {
        // Child positions retain escapes and any emphasis inside the label.
        const labelEnd = node.children?.at(-1)?.position?.end.offset ?? start + 1;
        add("link", start + 1, labelEnd);
      } else if (node.type === "heading") {
        const prefix = raw.match(/^#{1,6}(?:[ \t]+|$)/);
        const suffix = prefix ? raw.match(/[ \t]+#+[ \t]*$/) : raw.match(/\r?\n[ \t]*[=-]+[ \t]*$/);
        const contentStart = start + (prefix?.[0].length ?? 0);
        add(`heading${node.depth}` as NoteFormat, contentStart, Math.max(contentStart, end - (suffix?.[0].length ?? 0)));
      } else if (node.type === "listItem") {
        const prefix = raw.match(/^(?:[-+*]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]+)?/);
        if (prefix) add("list", start + prefix[0].length, end);
      }
    }
    node.children?.forEach(visit);
  }
  visit(fromMarkdown(source));
  return regions;
}

export function formattingAt(regions: FormattingRegion[], anchor: number, focus: number) {
  const start = Math.min(anchor, focus);
  const end = Math.max(anchor, focus);
  const active: Partial<Record<NoteFormat, FormattingRegion>> = {};
  for (const region of regions) {
    const inside = start === end
      ? start >= region.contentStart && start <= region.contentEnd
      : start >= region.start && end <= region.end && start < region.contentEnd && end > region.contentStart;
    // Descendants follow their parents, so toggling removes the innermost span.
    if (inside) active[region.format] = region;
  }
  return active;
}

export function toggleFormatting(source: string, anchor: number, focus: number, format: NoteFormat, regions = formattingRegions(source)) {
  const start = Math.min(anchor, focus);
  const end = Math.max(anchor, focus);
  const formats = formattingAt(regions, anchor, focus);
  const active = formats[format];
  const heading = Object.values(formats).find(region => region.format.startsWith("heading"));
  let edits: Edit[];
  let selectionStart = anchor;
  let selectionEnd = focus;
  if (active) {
    edits = active.markers;
  } else if (format.startsWith("heading") && heading) {
    edits = [
      { start: heading.start, end: heading.contentStart, text: "#".repeat(Number(format.at(-1))) + " " },
      { start: heading.contentEnd, end: heading.end, text: "" },
    ];
  } else if (format.startsWith("heading") || format === "list") {
    const firstLine = start === 0 ? 0 : source.lastIndexOf("\n", start - 1) + 1;
    const lastLine = source.indexOf("\n", Math.max(start, end - 1));
    const blockEnd = lastLine < 0 ? source.length : lastLine;
    edits = [];
    let offset = firstLine;
    for (const line of source.slice(firstLine, blockEnd).split("\n")) {
      const indent = line.match(/^[ \t]*/)![0].length;
      edits.push({ start: offset + indent, end: offset + indent, text: format === "list" ? "- " : "#".repeat(Number(format.at(-1))) + " " });
      offset += line.length + 1;
    }
  } else {
    const [before, after, placeholder] = format === "bold" ? ["**", "**", "text"]
      : format === "italic" ? ["*", "*", "text"] : ["[", "](https://example.com)", "Link"];
    const selected = source.slice(start, end) || placeholder;
    return { start, end, text: before + selected + after, selectionStart: start + before.length, selectionEnd: start + before.length + selected.length };
  }
  edits.sort((a, b) => a.start - b.start);
  const editStart = edits[0].start;
  const editEnd = edits.at(-1)!.end;
  let text = "";
  let offset = editStart;
  for (const edit of edits) {
    text += source.slice(offset, edit.start) + edit.text;
    offset = edit.end;
  }
  text += source.slice(offset, editEnd);
  function mapPosition(position: number) {
    let delta = 0;
    for (const edit of edits) {
      if (position < edit.start) break;
      if (position < edit.end) return edit.start + delta + edit.text.length;
      delta += edit.text.length - (edit.end - edit.start);
    }
    return position + delta;
  }
  selectionStart = mapPosition(selectionStart);
  selectionEnd = mapPosition(selectionEnd);
  return { start: editStart, end: editEnd, text, selectionStart, selectionEnd };
}

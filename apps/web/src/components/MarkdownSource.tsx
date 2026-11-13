import { useEffect, useRef } from "react";
import DiffMatchPatch from "diff-match-patch";
import { markdownSourceHtml } from "./markdownSourceHtml";

type SourceMarker = { offset: number };
export type SourceBookmark = { getRange(): { start: number; end: number }; release(): void };
export type SourceEditor = {
  getContent(): string;
  replace(start: number, end: number, text: string): void;
  setSelection(start: number, end: number): void;
  focus(): void;
  bookmarkSelection(): SourceBookmark;
  selectionMgr: {
    selectionStart: number; selectionEnd: number;
    saveSelectionState(): void;
    on(event: string, listener: () => void): void;
    off(event: string, listener: () => void): void;
  };
  undoMgr: { undo(): void; redo(): void };
};
type Engine = Omit<SourceEditor, "bookmarkSelection"> & {
  addMarker(marker: SourceMarker): void;
  removeMarker(marker: SourceMarker): void;
  init(options: { content: string; sectionHighlighter: (section: { text: string }) => string }): void;
  on(event: string, listener: (text: string) => void): void;
  off(event: string, listener: (text: string) => void): void;
};
declare global {
  interface Window {
    diff_match_patch: typeof DiffMatchPatch;
    cledit: {
      (element: HTMLElement, scroller: HTMLElement): Engine;
      Marker: new (offset: number, trailing: boolean) => SourceMarker;
    };
  }
}

// CLeditor is the open-source contenteditable engine used by the StackEdit family.
// Style the editable source directly so the caret follows the displayed text.
export function MarkdownSource({ initial, onChange, onSelectionChange, editorRef, onFiles, onError }: {
  initial: string; onChange: (text: string) => void;
  onSelectionChange: () => void;
  editorRef: React.RefObject<SourceEditor | null>;
  onFiles: (files: File[]) => void; onError: (message: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onChange, onSelectionChange, onFiles, onError });
  callbacks.current = { onChange, onSelectionChange, onFiles, onError };
  useEffect(() => {
    let cancelled = false;
    let cleanup = () => {};
    window.diff_match_patch = DiffMatchPatch;
    void import("cledit").then(() => {
      if (cancelled || !host.current) return;
      const element = document.createElement("pre");
      element.className = "markdown-source";
      element.setAttribute("role", "textbox");
      element.setAttribute("aria-label", "Markdown source");
      element.setAttribute("aria-multiline", "true");
      element.spellcheck = true;
      host.current.append(element);
      const engine = window.cledit(element, host.current);
      engine.init({ content: initial, sectionHighlighter: ({ text }) => markdownSourceHtml(text) });
      engine.on("contentChanged", changed);
      editorRef.current = Object.assign(engine, {
        bookmarkSelection(): SourceBookmark {
          engine.selectionMgr.saveSelectionState();
          const { selectionStart, selectionEnd } = engine.selectionMgr;
          // Stay before text typed at this position while an upload is pending.
          const start = new window.cledit.Marker(Math.min(selectionStart, selectionEnd), true);
          const end = new window.cledit.Marker(Math.max(selectionStart, selectionEnd), true);
          engine.addMarker(start);
          engine.addMarker(end);
          return {
            getRange: () => ({ start: start.offset, end: end.offset }),
            release() { engine.removeMarker(start); engine.removeMarker(end); },
          };
        },
      });
      engine.selectionMgr.on("selectionChanged", selectionChanged);
      // Native selection changes also cover touch caret placement and handles.
      function selectionChanged() { callbacks.current.onSelectionChange(); }
      function nativeSelectionChanged() {
        if (element.contains(document.getSelection()?.anchorNode ?? null)) engine.selectionMgr.saveSelectionState();
      }
      document.addEventListener("selectionchange", nativeSelectionChanged);
      selectionChanged();
      // Capture before CLeditor's plain-text paste handler.
      function paste(event: ClipboardEvent) {
        engine.selectionMgr.saveSelectionState();
        const files = Array.from(event.clipboardData?.files ?? []);
        if (files.length) { event.preventDefault(); event.stopImmediatePropagation(); callbacks.current.onFiles(files); }
      }
      function changed(text: string) { callbacks.current.onChange(text); selectionChanged(); }
      element.addEventListener("paste", paste, true);
      cleanup = () => {
        engine.off("contentChanged", changed);
        engine.selectionMgr.off("selectionChanged", selectionChanged);
        document.removeEventListener("selectionchange", nativeSelectionChanged);
        editorRef.current = null;
        element.remove();
        // CLeditor releases its window listeners and observer on the next mouseup
        // once its element has been removed from the document.
        window.dispatchEvent(new MouseEvent("mouseup"));
      };
    }).catch(() => callbacks.current.onError("Could not load the editor. Reload this page to retry."));
    return () => { cancelled = true; cleanup(); };
  }, []);
  return <div ref={host} className="local-notes-input" onDragOver={event => {
    if (event.dataTransfer.types.includes("Files")) event.preventDefault();
  }} onDrop={event => {
    if (event.dataTransfer.files.length) { event.preventDefault(); callbacks.current.onFiles(Array.from(event.dataTransfer.files)); }
  }} />;
}

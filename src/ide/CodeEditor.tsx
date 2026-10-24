/**
 * CodeEditor — CodeMirror 6 sketch editor.
 *
 * - JavaScript highlighting in the blueprint palette, line numbers, brackets,
 *   undo/redo, search (basicSetup).
 * - Autocomplete for the Arduino-style API with signatures and docs.
 * - Build problems underlined via the linter (the same checkSketch the
 *   Problems panel uses).
 * - The line a replay is on gets a highlighted background and gutter marker.
 * - Mod-Enter runs, F10 steps.
 *
 * The contenteditable carries data-testid="code-editor".
 */
import React, { useEffect, useRef } from "react";
import { EditorView, basicSetup } from "codemirror";
import { EditorState, RangeSetBuilder, StateEffect, StateField, type Extension } from "@codemirror/state";
import { Decoration, GutterMarker, gutter, keymap, type DecorationSet } from "@codemirror/view";
import { javascript, javascriptLanguage } from "@codemirror/lang-javascript";
import { completeFromList, snippetCompletion } from "@codemirror/autocomplete";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { linter, forceLinting, type Diagnostic } from "@codemirror/lint";
import { tags as t } from "@lezer/highlight";
import type { Board } from "../model/board-model";
import { checkSketch } from "../build/checkSketch";
import { currentCode, useStore } from "../store/useStore";
import { runnerRef } from "./useRunner";
import { tokens } from "../ui/tokens";

// ─── theme ───────────────────────────────────────────────────────────────────

const theme = EditorView.theme(
  {
    // Transparent so the workspace gradient shows behind the code.
    "&": { height: "100%", backgroundColor: "transparent", color: tokens.text, fontSize: "13px" },
    ".cm-scroller": { fontFamily: tokens.fontMono, lineHeight: "1.55" },
    ".cm-content": { caretColor: tokens.phosphor, padding: "8px 0" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: tokens.phosphor },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": { backgroundColor: "#1a3c66 !important" },
    ".cm-gutters": { backgroundColor: "transparent", color: "#3d5878", border: "none", borderRight: `1px solid ${tokens.hairline}` },
    ".cm-activeLineGutter": { backgroundColor: "transparent", color: "#8aa8c4" },
    ".cm-activeLine": { backgroundColor: "rgba(79,216,255,0.04)" },
    ".cm-matchingBracket": { backgroundColor: "rgba(79,216,255,0.18)", outline: "none" },
    ".cm-trace-line": { backgroundColor: "rgba(79,216,255,0.16)", boxShadow: `inset 3px 0 0 ${tokens.phosphor}` },
    ".cm-trace-gutter": { width: "14px" },
    ".cm-trace-marker": { color: tokens.phosphor, fontSize: "10px", paddingLeft: "3px" },
    ".cm-tooltip": { backgroundColor: tokens.panel, border: `1px solid ${tokens.panelBorder}`, color: tokens.text },
    ".cm-tooltip-autocomplete ul li[aria-selected]": { backgroundColor: "#12335a", color: tokens.text },
    ".cm-completionDetail": { color: tokens.textDim, fontStyle: "normal", marginLeft: "0.6em" },
    ".cm-completionInfo": { maxWidth: "280px", fontFamily: tokens.fontMono, fontSize: "12px", lineHeight: "1.4" },
    ".cm-diagnostic": { fontFamily: tokens.fontMono, fontSize: "12px", padding: "4px 8px" },
    ".cm-diagnostic-error": { borderLeftColor: tokens.danger },
    ".cm-diagnostic-warning": { borderLeftColor: tokens.amber },
    ".cm-lintRange-error": { backgroundImage: "none", textDecoration: `underline wavy ${tokens.danger}`, textUnderlineOffset: "3px" },
    ".cm-lintRange-warning": { backgroundImage: "none", textDecoration: `underline wavy ${tokens.amber}`, textUnderlineOffset: "3px" },
    ".cm-panels": { backgroundColor: tokens.panel, color: tokens.text },
    ".cm-searchMatch": { backgroundColor: "rgba(255,200,87,0.25)" },
  },
  { dark: true },
);

const highlight = HighlightStyle.define([
  { tag: t.comment, color: "#4f6a88", fontStyle: "italic" },
  { tag: [t.keyword, t.controlKeyword, t.definitionKeyword, t.modifier], color: "#7ab8ff" },
  { tag: [t.string, t.special(t.string)], color: "#ffc857" },
  { tag: [t.number, t.bool, t.null], color: "#ff9e7a" },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: tokens.phosphor },
  { tag: [t.variableName, t.propertyName], color: tokens.text },
  { tag: [t.definition(t.variableName)], color: "#d8f2ff" },
  { tag: [t.operator, t.punctuation, t.bracket], color: "#8aa8c4" },
  { tag: t.invalid, color: tokens.danger },
]);

// ─── API autocomplete ───────────────────────────────────────────────────────

const apiCompletions = completeFromList([
  snippetCompletion("pinMode(${pin}, \"${OUTPUT}\")", {
    label: "pinMode", type: "function", detail: '(pin, "INPUT" | "OUTPUT")',
    info: "Set a pin's direction. Outputs drive their net through about 25 Ω; inputs load it with 1 MΩ.",
  }),
  snippetCompletion("digitalWrite(${pin}, ${HIGH})", {
    label: "digitalWrite", type: "function", detail: "(pin, HIGH | LOW)",
    info: "Drive a pin to VCC (HIGH) or ground (LOW). Also makes the pin an output.",
  }),
  snippetCompletion("digitalRead(${pin})", {
    label: "digitalRead", type: "function", detail: "(pin) → 0 | 1",
    info: "Read a pin as HIGH (1) when its net is above VCC / 2.",
  }),
  snippetCompletion("analogRead(${\"A0\"})", {
    label: "analogRead", type: "function", detail: "(pin) → 0..1023",
    info: "Measure a pin's solved voltage with the 10-bit ADC: 0 V → 0, VCC → 1023.",
  }),
  snippetCompletion("log(${value})", {
    label: "log", type: "function", detail: "(...values)",
    info: "Print to the Console panel.",
  }),
  { label: "HIGH", type: "constant", detail: "= 1", info: "Logic high: the pin is driven to VCC." },
  { label: "LOW", type: "constant", detail: "= 0", info: "Logic low: the pin is driven to ground." },
]);

// ─── trace-line highlight ───────────────────────────────────────────────────

const setTraceLine = StateEffect.define<number | null>();

const traceLineDeco = Decoration.line({ class: "cm-trace-line" });

const traceLineField = StateField.define<number | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setTraceLine)) return e.value;
    return value;
  },
});

const traceDecorations = EditorView.decorations.compute([traceLineField], (state): DecorationSet => {
  const line = state.field(traceLineField);
  const builder = new RangeSetBuilder<Decoration>();
  if (line !== null && line >= 1 && line <= state.doc.lines) {
    const l = state.doc.line(line);
    builder.add(l.from, l.from, traceLineDeco);
  }
  return builder.finish();
});

class TraceMarker extends GutterMarker {
  override toDOM(): Node {
    const el = document.createElement("span");
    el.className = "cm-trace-marker";
    el.textContent = "▶";
    return el;
  }
}
const traceMarker = new TraceMarker();

const traceGutter = gutter({
  class: "cm-trace-gutter",
  lineMarker(view, block) {
    const line = view.state.field(traceLineField);
    if (line === null) return null;
    return view.state.doc.lineAt(block.from).number === line ? traceMarker : null;
  },
  lineMarkerChange: (update) => update.transactions.some((tr) => tr.effects.some((e) => e.is(setTraceLine))),
});

// ─── component ──────────────────────────────────────────────────────────────

export default function CodeEditor(): React.ReactElement {
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const boardRef = useRef<Board | null>(useStore.getState().board);

  const board = useStore((s) => s.board);
  const boardId = useStore((s) => s.boardId);
  const traceLine = useStore((s) => {
    const pb = s.playback;
    if (!pb || pb.index < 0 || pb.trace.length === 0) return null;
    // Only highlight while a replay is in progress or paused mid-way.
    if (pb.index >= pb.trace.length - 1 && !pb.playing && s.speed === 0) return null;
    return pb.trace[pb.index]?.line ?? null;
  });
  const editorJump = useStore((s) => s.editorJump);

  // Create the editor once.
  useEffect(() => {
    if (!host.current) return undefined;
    const lint = linter((view): Diagnostic[] => {
      const b = boardRef.current;
      if (!b) return [];
      const code = view.state.doc.toString();
      return checkSketch(code, b)
        .filter((p) => p.from !== undefined && p.severity !== "info")
        .map((p) => ({
          from: Math.min(p.from!, code.length),
          to: Math.min(Math.max(p.to ?? p.from! + 1, p.from! + 1), code.length),
          severity: p.severity === "error" ? "error" : "warning",
          message: p.message,
        }));
    }, { delay: 300 });

    const extensions: Extension[] = [
      basicSetup,
      javascript(),
      javascriptLanguage.data.of({ autocomplete: apiCompletions }),
      theme,
      syntaxHighlighting(highlight),
      lint,
      traceLineField,
      traceDecorations,
      traceGutter,
      keymap.of([
        { key: "Mod-Enter", run: () => { void runnerRef.current?.run(); return true; }, preventDefault: true },
        { key: "F10", run: () => { void runnerRef.current?.step(); return true; }, preventDefault: true },
      ]),
      EditorView.contentAttributes.of({ "data-testid": "code-editor", "aria-label": "Sketch code editor" }),
      EditorView.updateListener.of((update) => {
        if (!update.docChanged) return;
        const code = update.state.doc.toString();
        if (code !== currentCode(useStore.getState())) useStore.getState().setCode(code);
      }),
    ];

    const view = new EditorView({
      state: EditorState.create({ doc: currentCode(useStore.getState()), extensions }),
      parent: host.current,
    });
    viewRef.current = view;
    return () => { view.destroy(); viewRef.current = null; };
  }, []);

  // Load the board's sketch when the board changes; re-lint against the new pins.
  useEffect(() => {
    boardRef.current = board;
    const view = viewRef.current;
    if (!view) return;
    const code = currentCode(useStore.getState());
    if (view.state.doc.toString() !== code) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: code } });
    }
    forceLinting(view);
  }, [board, boardId]);

  // Highlight the replay line.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const effects: StateEffect<unknown>[] = [setTraceLine.of(traceLine)];
    if (traceLine !== null && traceLine <= view.state.doc.lines) {
      effects.push(EditorView.scrollIntoView(view.state.doc.line(traceLine).from, { y: "nearest" }));
    }
    view.dispatch({ effects });
  }, [traceLine]);

  // Jump to a line on request (Problems panel, Trace list).
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !editorJump) return;
    const n = Math.max(1, Math.min(editorJump.line, view.state.doc.lines));
    const line = view.state.doc.line(n);
    view.dispatch({ selection: { anchor: line.from }, effects: EditorView.scrollIntoView(line.from, { y: "center" }) });
    view.focus();
  }, [editorJump]);

  return <div ref={host} style={{ height: "100%", overflow: "hidden" }} />;
}

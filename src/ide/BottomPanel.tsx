/**
 * BottomPanel — Console (run output and logs), Problems (everything wrong, in
 * one list, click to go there), and Trace (every pin call of the last run,
 * click to jump the circuit to that moment).
 */
import React, { useEffect, useRef } from "react";
import { useStore, type BottomTab } from "../store/useStore";
import type { TraceEvent } from "../runtime/execute";
import { font, severityColor, severityGlyph } from "../ui/chrome";
import { tokens } from "../ui/tokens";
import MascotTalk from "../ui/brand/MascotTalk";
import type { ProblemSet } from "./useProblems";
import type { Problem } from "../build/problems";

interface Props {
  problems: ProblemSet;
}

export function describeEvent(ev: TraceEvent): string {
  switch (ev.kind) {
    case "pinMode": return `pinMode(${ev.pin}, ${ev.mode.toUpperCase()})`;
    case "digitalWrite": return `digitalWrite(${ev.pin}, ${ev.level ? "HIGH" : "LOW"})`;
    case "digitalRead": return `digitalRead(${ev.pin}) → ${ev.value ? "HIGH" : "LOW"}`;
    case "analogRead": return `analogRead(${ev.pin}) → ${ev.value}`;
    case "log": return `log: ${ev.text}`;
  }
}

const SOURCE_LABEL: Record<Problem["source"], string> = { code: "Code", board: "Board", run: "Run", sim: "Circuit" };

export default function BottomPanel({ problems }: Props): React.ReactElement {
  const tab = useStore((s) => s.bottomTab);
  const setTab = useStore((s) => s.setBottomTab);
  const playback = useStore((s) => s.playback);
  const errorCount = problems.all.filter((p) => p.severity === "error").length;
  const warnCount = problems.all.filter((p) => p.severity === "warning").length;

  const tabs: { id: BottomTab; text: string; badge?: string; badgeColor?: string }[] = [
    { id: "console", text: "Console" },
    {
      id: "problems",
      text: "Problems",
      ...(errorCount + warnCount > 0
        ? { badge: String(errorCount + warnCount), badgeColor: errorCount > 0 ? tokens.danger : tokens.amber }
        : {}),
    },
    { id: "trace", text: "Trace", ...(playback?.trace.length ? { badge: String(playback.trace.length), badgeColor: tokens.textFaint } : {}) },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "transparent" }}>
      <div role="tablist" style={{ display: "flex", alignItems: "stretch", height: "28px", borderBottom: `1px solid ${tokens.hairline}` }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            data-testid={`tab-${t.id}`}
            onClick={() => setTab(t.id)}
            style={{
              ...font,
              fontSize: "0.72rem",
              padding: "0 0.75rem",
              background: tab === t.id ? "#0c1a2e" : "transparent",
              color: tab === t.id ? tokens.text : tokens.textDim,
              border: "none",
              borderBottom: `2px solid ${tab === t.id ? tokens.phosphor : "transparent"}`,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
            }}
          >
            {t.text}
            {t.badge && (
              <span style={{ background: t.badgeColor, color: "#04121f", borderRadius: "8px", padding: "0 0.35rem", fontSize: "0.64rem", fontWeight: 700 }}>
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0.4rem 0.6rem" }}>
        {tab === "console" && <ConsoleView />}
        {tab === "problems" && <ProblemsView problems={problems} />}
        {tab === "trace" && <TraceView />}
      </div>
    </div>
  );
}

function ConsoleView(): React.ReactElement {
  const lastRun = useStore((s) => s.lastRun);
  const logs = useStore((s) => s.logs);
  const runError = useStore((s) => s.runError);
  const playback = useStore((s) => s.playback);
  const jumpToLine = useStore((s) => s.jumpToLine);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [logs.length, runError]);

  const line: React.CSSProperties = { ...font, fontSize: "0.74rem", lineHeight: 1.6, whiteSpace: "pre-wrap" };

  if (!lastRun) {
    return (
      <div style={{ ...line, color: tokens.textDim }} data-testid="console-empty">
        Press <b style={{ color: tokens.text }}>▶ Run</b> to execute the sketch, or <b style={{ color: tokens.text }}>⏭ Step</b> to
        go one pin call at a time. Output from log(...) appears here.
      </div>
    );
  }

  const replaying = playback && playback.index < playback.trace.length - 1;
  return (
    <div data-testid="console">
      <div style={{ ...line, color: tokens.textFaint }}>
        {lastRun.status === "blocked"
          ? `Run #${lastRun.n} · not started: fix ${lastRun.blockedErrors} build error${lastRun.blockedErrors === 1 ? "" : "s"} first (see Problems).`
          : `Run #${lastRun.n} · ${lastRun.events} pin call${lastRun.events === 1 ? "" : "s"}${lastRun.truncated ? " (trace truncated)" : ""} · ${lastRun.durationMs} ms`}
        {replaying && playback ? ` · replaying step ${playback.index + 1} of ${playback.trace.length}` : ""}
      </div>
      {logs.length > 0 && (
        <div data-testid="run-logs">
          {logs.map((l, i) => (
            <div key={i} style={{ ...line, color: tokens.text }}>
              <span style={{ color: tokens.textFaint }}>› </span>{String(l)}
            </div>
          ))}
        </div>
      )}
      {runError && (
        <div data-testid="run-error" role="alert" style={{ ...line, color: tokens.danger, marginTop: "0.2rem" }}>
          ✕ {runError}
          {lastRun.errorLine !== undefined && (
            <button
              onClick={() => jumpToLine(lastRun.errorLine!)}
              style={{ ...font, marginLeft: "0.5rem", fontSize: "0.7rem", color: tokens.phosphor, background: "transparent", border: "none", cursor: "pointer", textDecoration: "underline" }}
            >
              line {lastRun.errorLine}
            </button>
          )}
          <div style={{ color: tokens.textDim }}>The circuit was left as it was before this run.</div>
        </div>
      )}
      {!runError && lastRun.status === "ok" && logs.length === 0 && !replaying && (
        <div style={{ ...line, color: tokens.textDim }}>Done. The sketch printed nothing; the circuit now shows the final pin state.</div>
      )}
      <div ref={end} />
    </div>
  );
}

function ProblemsView({ problems }: Props): React.ReactElement {
  const jumpToLine = useStore((s) => s.jumpToLine);
  const setSelection = useStore((s) => s.setSelection);
  const mode = useStore((s) => s.mode);
  const setBuilderSelection = useStore((s) => s.setBuilderSelection);

  if (problems.all.length === 0) {
    return (
      <div data-testid="problems-empty" style={{ ...font, fontSize: "0.74rem", color: tokens.phosphor }}>
        <MascotTalk
          mood="happy"
          size={104}
          text="✓ No problems. The sketch builds, the board passes its rules check, and the circuit solves cleanly."
          textStyle={{ lineHeight: 1.55, paddingTop: "0.35rem" }}
        />
      </div>
    );
  }

  const go = (p: Problem): void => {
    if (p.line !== undefined) jumpToLine(p.line);
    else if (p.ref) {
      if (mode === "build") setBuilderSelection({ kind: "part", ref: p.ref });
      else setSelection({ kind: "part", ref: p.ref });
    }
  };

  const errors = problems.all.filter((p) => p.severity === "error").length;
  const n = problems.all.length;
  const summary = errors > 0
    ? `${errors === 1 ? "One thing stops" : `${errors} things stop`} this from running. Click a problem to jump to its line or part.`
    : `${n === 1 ? "One thing" : `${n} things`} worth a look, though it still runs. Click one to jump to it.`;

  return (
    <>
    <MascotTalk mood="oops" size={92} text={summary} style={{ marginBottom: "0.45rem" }} textStyle={{ ...font, fontSize: "0.72rem", color: tokens.textDim, lineHeight: 1.5, paddingTop: "0.3rem" }} />
    <ul data-testid="problems-panel" style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {problems.all.map((p) => {
        const clickable = p.line !== undefined || p.ref !== undefined;
        return (
          <li key={p.id}>
            <button
              data-testid={`problem-${p.source}`}
              onClick={() => go(p)}
              disabled={!clickable}
              style={{
                ...font,
                display: "flex",
                gap: "0.5rem",
                width: "100%",
                textAlign: "left",
                fontSize: "0.73rem",
                lineHeight: 1.45,
                padding: "0.2rem 0.2rem",
                background: "transparent",
                border: "none",
                borderRadius: "2px",
                color: tokens.text,
                cursor: clickable ? "pointer" : "default",
              }}
            >
              <span style={{ color: severityColor(p.severity), width: "0.9rem", flexShrink: 0, textAlign: "center" }}>{severityGlyph(p.severity)}</span>
              <span style={{ color: tokens.textFaint, width: "3.6rem", flexShrink: 0 }}>{SOURCE_LABEL[p.source]}</span>
              <span style={{ flex: 1 }}>{p.message}</span>
              {p.line !== undefined && <span style={{ color: tokens.textFaint, flexShrink: 0 }}>Ln {p.line}</span>}
              {p.line === undefined && p.ref && <span style={{ color: tokens.textFaint, flexShrink: 0 }}>{p.ref}</span>}
            </button>
          </li>
        );
      })}
    </ul>
    </>
  );
}

function TraceView(): React.ReactElement {
  const playback = useStore((s) => s.playback);
  const setPlaybackIndex = useStore((s) => s.setPlaybackIndex);
  const setPlaying = useStore((s) => s.setPlaying);
  const current = useRef<HTMLButtonElement>(null);
  useEffect(() => { current.current?.scrollIntoView({ block: "nearest" }); }, [playback?.index]);

  if (!playback || playback.trace.length === 0) {
    return (
      <div style={{ ...font, fontSize: "0.74rem", color: tokens.textDim }}>
        The trace lists every pin call a run makes, in order. Run the sketch, then click a row to see the circuit at that moment.
      </div>
    );
  }

  const last = playback.trace.length - 1;
  return (
    <div>
      <input
        type="range"
        data-testid="trace-scrubber"
        aria-label="Trace position"
        min={-1}
        max={last}
        step={1}
        value={playback.index}
        onChange={(e) => { setPlaying(false); setPlaybackIndex(Number(e.target.value)); }}
        style={{ width: "100%", accentColor: tokens.phosphor }}
      />
      <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {playback.trace.map((ev, i) => {
          const active = i === playback.index;
          const done = i < playback.index;
          return (
            <li key={i}>
              <button
                ref={active ? current : undefined}
                data-testid={`trace-row-${i}`}
                onClick={() => { setPlaying(false); setPlaybackIndex(i); }}
                style={{
                  ...font,
                  display: "flex",
                  gap: "0.6rem",
                  width: "100%",
                  fontSize: "0.72rem",
                  lineHeight: 1.55,
                  textAlign: "left",
                  padding: "0 0.3rem",
                  background: active ? "rgba(79,216,255,0.14)" : "transparent",
                  border: "none",
                  borderLeft: `2px solid ${active ? tokens.phosphor : "transparent"}`,
                  color: active ? tokens.text : done ? tokens.textDim : "#4f6a88",
                  cursor: "pointer",
                }}
              >
                <span style={{ width: "2.2rem", color: tokens.textFaint }}>#{i + 1}</span>
                <span style={{ width: "2.6rem", color: tokens.textFaint }}>Ln {ev.line}</span>
                <span>{describeEvent(ev)}</span>
              </button>
            </li>
          );
        })}
      </ol>
      {playback.truncated && (
        <div style={{ ...font, fontSize: "0.7rem", color: tokens.amber, marginTop: "0.3rem" }}>
          ▲ Trace stopped recording after {playback.trace.length} calls; the run itself finished.
        </div>
      )}
    </div>
  );
}

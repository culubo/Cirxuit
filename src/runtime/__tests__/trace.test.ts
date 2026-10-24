import { describe, expect, it } from "vitest";
import { demoBoard } from "../../solver/__tests__/fixtures";
import { applyTraceEvent, executeProgram, instrumentSketch, MAX_TRACE_EVENTS } from "../execute";

const empty = { modes: {}, outputs: {} };

describe("executeProgram trace", () => {
  it("records each pin call and log with its source line", () => {
    const code = [
      "// comment line",
      'pinMode(8, "OUTPUT");',
      "digitalWrite(8, HIGH);",
      'log("level", 1);',
    ].join("\n");
    const result = executeProgram(code, demoBoard(), empty);
    expect(result.error).toBeUndefined();
    expect(result.trace).toEqual([
      { kind: "pinMode", line: 2, pin: "D8", mode: "output" },
      { kind: "digitalWrite", line: 3, pin: "D8", level: 1 },
      { kind: "log", line: 4, text: "level 1" },
    ]);
  });

  it("attributes calls inside functions and loops to the line that made them", () => {
    const code = [
      "function blink(level) {",
      "  digitalWrite(8, level);",
      "}",
      "for (let i = 0; i < 2; i++) {",
      "  blink(i % 2);",
      "}",
    ].join("\n");
    const result = executeProgram(code, demoBoard(), empty);
    expect(result.trace.map((e) => e.line)).toEqual([2, 2]);
    expect(result.trace.map((e) => (e.kind === "digitalWrite" ? e.level : -1))).toEqual([0, 1]);
  });

  it("records the value an analogRead returned", () => {
    const result = executeProgram('analogRead("A0");', demoBoard(), empty);
    const read = result.trace[0];
    expect(read?.kind).toBe("analogRead");
    if (read?.kind === "analogRead") expect(read.value).toBeGreaterThan(500);
  });

  it("replaying the trace reproduces the final pin state", () => {
    const code = 'pinMode(8, "OUTPUT"); digitalWrite(8, HIGH); digitalWrite(8, LOW); digitalWrite(8, HIGH);';
    const result = executeProgram(code, demoBoard(), empty);
    const replayed = result.trace.reduce(applyTraceEvent, empty);
    expect(replayed).toEqual(result.mcuState);
  });

  it("reports the line that threw and keeps the trace up to it", () => {
    const code = ["digitalWrite(8, HIGH);", "", 'throw new Error("boom");'].join("\n");
    const result = executeProgram(code, demoBoard(), empty);
    expect(result.error).toContain("boom");
    expect(result.errorLine).toBe(3);
    expect(result.trace).toHaveLength(1);
  });

  it("caps the trace so a runaway loop cannot exhaust memory", () => {
    const code = "for (let i = 0; i < 20000; i++) digitalWrite(8, i % 2);";
    const result = executeProgram(code, demoBoard(), empty);
    expect(result.trace).toHaveLength(MAX_TRACE_EVENTS);
    expect(result.traceTruncated).toBe(true);
  });

  it("reports syntax errors without running anything", () => {
    const result = executeProgram("digitalWrite(8, HIGH", demoBoard(), empty);
    expect(result.error).toMatch(/syntax error/i);
    expect(result.trace).toEqual([]);
  });

  it("instrumentation keeps the code's meaning", () => {
    const out = instrumentSketch("let x = 1;\nif (x) { x = 2; }\n");
    expect(out).toContain("__cx_at(1);let x = 1;");
    expect(out).toContain("{ __cx_at(2);x = 2; }");
  });
});

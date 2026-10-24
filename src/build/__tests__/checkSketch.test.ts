import { describe, expect, it } from "vitest";
import { board } from "../../solver/__tests__/fixtures";
import { demoBoard } from "../../solver/__tests__/fixtures";
import { checkSketch } from "../checkSketch";

const errors = (code: string) => checkSketch(code, demoBoard()).filter((p) => p.severity === "error");
const warnings = (code: string) => checkSketch(code, demoBoard()).filter((p) => p.severity === "warning");

describe("checkSketch", () => {
  it("passes a clean sketch", () => {
    const code = 'pinMode(8, "OUTPUT");\ndigitalWrite(8, HIGH);\nlog("A0", analogRead("A0"));';
    expect(checkSketch(code, demoBoard())).toEqual([]);
  });

  it("reports syntax errors with line and column", () => {
    const [problem] = errors("digitalWrite(8, HIGH);\ndigitalWrite(8, ");
    expect(problem?.message).toMatch(/syntax error/i);
    expect(problem?.line).toBe(2);
  });

  it("suggests the right name for a misspelled API call", () => {
    const [problem] = errors("digitalwrite(8, HIGH);");
    expect(problem?.message).toContain("digitalwrite() is not defined");
    expect(problem?.message).toContain("Did you mean digitalWrite?");
  });

  it("does not flag functions the sketch declares itself", () => {
    expect(errors("function blink() { digitalWrite(8, HIGH); }\nblink();")).toEqual([]);
    expect(errors("const on = () => digitalWrite(8, HIGH);\non();")).toEqual([]);
  });

  it("flags wrong argument counts", () => {
    expect(errors("digitalWrite(8);")[0]?.message).toContain("takes 2 arguments");
  });

  it("flags pins that are not on the board and lists the real ones", () => {
    const [problem] = errors("digitalWrite(99, HIGH);");
    expect(problem?.message).toContain('Pin 99 doesn\'t exist');
    expect(problem?.message).toContain("D8");
    expect(problem?.from).toBeDefined();
  });

  it("explains that delay() is unavailable and points to Step", () => {
    expect(errors("delay(1000);")[0]?.message).toMatch(/delay\(\) isn't available.*Step/);
  });

  it("explains OUTPUT must be a string", () => {
    expect(errors("pinMode(8, OUTPUT);")[0]?.message).toContain('pinMode(pin, "OUTPUT")');
  });

  it("warns about endless loops but not loops that break", () => {
    expect(warnings("while (true) { digitalWrite(8, HIGH); }")[0]?.message).toMatch(/never ends/);
    expect(warnings("while (true) { break; }")).toEqual([]);
  });

  it("warns about console.log and non-analog analogRead", () => {
    expect(warnings('console.log("x");')[0]?.message).toMatch(/Use log/);
    expect(warnings("analogRead(8);")[0]?.message).toMatch(/isn't an analog input/);
  });

  it("flags pin calls on a board with no microcontroller", () => {
    const noMcu = board([]);
    const problems = checkSketch("digitalWrite(8, HIGH);", noMcu);
    expect(problems[0]?.message).toMatch(/no microcontroller/);
  });

  it("treats an empty sketch as info, not an error", () => {
    expect(checkSketch("  \n", demoBoard())[0]?.severity).toBe("info");
  });
});

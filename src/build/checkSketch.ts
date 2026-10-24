/**
 * checkSketch — the "build" step. Parses the sketch without running it and
 * reports what would go wrong: syntax errors, unknown functions, wrong argument
 * counts, pins that are not on this board, bad levels or modes, delay(), and
 * loops that never end.
 */
import { parse } from "acorn";
import type { Board, McuPin } from "../model/board-model";
import { resolvePin } from "../runtime/execute";
import type { Problem } from "./problems";

interface AstNode {
  type: string;
  start: number;
  end: number;
  loc?: { start: { line: number; column: number } };
  [key: string]: unknown;
}

function isNode(value: unknown): value is AstNode {
  return typeof value === "object" && value !== null && typeof (value as AstNode).type === "string";
}

/** The Arduino-style API and how many arguments each call takes (-1 = any). */
const API_ARITY: Record<string, { count: number; signature: string }> = {
  pinMode: { count: 2, signature: 'pinMode(pin, "INPUT" | "OUTPUT")' },
  digitalWrite: { count: 2, signature: "digitalWrite(pin, HIGH | LOW)" },
  digitalRead: { count: 1, signature: "digitalRead(pin)" },
  analogRead: { count: 1, signature: "analogRead(pin)" },
  log: { count: -1, signature: "log(...values)" },
};
const API_NAMES = Object.keys(API_ARITY);
const API_CONSTANTS = new Set(["HIGH", "LOW"]);

/** JS built-ins a sketch may reasonably call. */
const KNOWN_GLOBALS = new Set([
  "Math", "Number", "String", "Boolean", "Array", "Object", "JSON", "Date",
  "parseInt", "parseFloat", "isNaN", "isFinite", "Error", "RangeError", "TypeError",
  "Map", "Set", "Symbol", "BigInt", "Promise",
]);

function walk(node: AstNode, visit: (n: AstNode, parent: AstNode | null) => void, parent: AstNode | null = null): void {
  visit(node, parent);
  for (const key of Object.keys(node)) {
    if (key === "loc") continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const c of child) if (isNode(c)) walk(c, visit, node);
    } else if (isNode(child)) {
      walk(child, visit, node);
    }
  }
}

/** Every name the sketch binds anywhere (scope-insensitive on purpose: no false alarms). */
function declaredNames(ast: AstNode): Set<string> {
  const names = new Set<string>();
  const addPattern = (p: unknown): void => {
    if (!isNode(p)) return;
    if (p.type === "Identifier") names.add(p["name"] as string);
    else if (p.type === "ObjectPattern") for (const prop of p["properties"] as unknown[]) addPattern(isNode(prop) && prop.type === "Property" ? prop["value"] : prop);
    else if (p.type === "ArrayPattern") for (const el of p["elements"] as unknown[]) addPattern(el);
    else if (p.type === "RestElement") addPattern(p["argument"]);
    else if (p.type === "AssignmentPattern") addPattern(p["left"]);
  };
  walk(ast, (n) => {
    if ((n.type === "FunctionDeclaration" || n.type === "FunctionExpression" || n.type === "ClassDeclaration") && isNode(n["id"])) {
      names.add(n["id"]["name"] as string);
    }
    if (n.type === "VariableDeclarator") addPattern(n["id"]);
    if (n.type === "FunctionDeclaration" || n.type === "FunctionExpression" || n.type === "ArrowFunctionExpression") {
      for (const param of n["params"] as unknown[]) addPattern(param);
    }
    if (n.type === "CatchClause") addPattern(n["param"]);
  });
  return names;
}

/** Levenshtein distance, for "did you mean". */
function distance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + cost);
    }
  }
  return dp[a.length]![b.length]!;
}

function suggestion(name: string, candidates: string[]): string | null {
  let best: string | null = null;
  let bestScore = Infinity;
  for (const c of candidates) {
    const score = c.toLowerCase() === name.toLowerCase() ? 0 : distance(name, c);
    if (score < bestScore) { best = c; bestScore = score; }
  }
  return best !== null && bestScore <= 2 ? best : null;
}

function mcuPins(board: Board): McuPin[] {
  for (const part of board.parts) if (part.model?.type === "mcu") return part.model.pins;
  return [];
}

function literalValue(node: unknown): string | number | null {
  if (!isNode(node)) return null;
  if (node.type === "Literal" && (typeof node["value"] === "string" || typeof node["value"] === "number")) {
    return node["value"] as string | number;
  }
  if (node.type === "UnaryExpression" && node["operator"] === "-" && isNode(node["argument"]) && typeof node["argument"]["value"] === "number") {
    return -(node["argument"]["value"] as number);
  }
  return null;
}

function containsExit(node: AstNode): boolean {
  let found = false;
  walk(node, (n) => {
    if (n.type === "BreakStatement" || n.type === "ReturnStatement" || n.type === "ThrowStatement") found = true;
  });
  return found;
}

function isAlwaysTrue(test: unknown): boolean {
  if (test === null || test === undefined) return true; // for (;;)
  if (!isNode(test)) return false;
  return test.type === "Literal" && (test["value"] === true || test["value"] === 1);
}

export function checkSketch(code: string, board: Board): Problem[] {
  const problems: Problem[] = [];
  let seq = 0;
  const add = (p: Omit<Problem, "id" | "source">): void => {
    problems.push({ id: `code-${seq++}`, source: "code", ...p });
  };
  const at = (node: AstNode): Pick<Problem, "line" | "col" | "from" | "to"> => ({
    line: node.loc?.start.line ?? 1,
    col: (node.loc?.start.column ?? 0) + 1,
    from: node.start,
    to: node.end,
  });

  if (code.trim() === "") {
    add({ severity: "info", message: "The sketch is empty. Write some code, then press Run." });
    return problems;
  }

  let ast: AstNode;
  try {
    ast = parse(code, { ecmaVersion: "latest", sourceType: "script", locations: true }) as unknown as AstNode;
  } catch (e: unknown) {
    const err = e as { message?: string; pos?: number; loc?: { line: number; column: number } };
    const message = (err.message ?? String(e)).replace(/\s*\(\d+:\d+\)\s*$/, "");
    const pos = err.pos ?? 0;
    add({
      severity: "error",
      message: `Syntax error: ${message}.`,
      line: err.loc?.line ?? 1,
      col: (err.loc?.column ?? 0) + 1,
      from: pos,
      to: Math.min(code.length, pos + 1),
    });
    return problems;
  }

  const declared = declaredNames(ast);
  const pins = mcuPins(board);
  const pinNames = pins.map((p) => p.name);
  let reportedNoMcu = false;

  const checkPin = (arg: unknown, fn: string): string | null => {
    const value = literalValue(arg);
    if (value === null || !isNode(arg)) return null; // variable: checked at runtime
    if (pins.length === 0) {
      if (!reportedNoMcu) {
        reportedNoMcu = true;
        add({ severity: "error", message: `${board.name} has no microcontroller, so ${fn}() has no pin to drive.`, ...at(arg) });
      }
      return null;
    }
    const name = resolvePin(value, board);
    if (!name) {
      add({
        severity: "error",
        message: `Pin ${JSON.stringify(value)} doesn't exist on ${board.name}. Available pins: ${pinNames.join(", ")}.`,
        ...at(arg),
      });
    }
    return name;
  };

  walk(ast, (node) => {
    // console.log goes to the browser devtools, not the Console panel.
    if (node.type === "CallExpression" && isNode(node["callee"]) && node["callee"].type === "MemberExpression") {
      const callee = node["callee"];
      if (isNode(callee["object"]) && callee["object"]["name"] === "console") {
        add({ severity: "warning", message: "console.log prints to the browser devtools. Use log(...) to print to the Console panel.", ...at(callee) });
      }
    }

    if (node.type === "CallExpression" && isNode(node["callee"]) && node["callee"].type === "Identifier") {
      const callee = node["callee"];
      const name = callee["name"] as string;
      const args = node["arguments"] as unknown[];

      if (name === "delay" && !declared.has(name)) {
        add({
          severity: "error",
          message: "delay() isn't available: the simulator solves the circuit's steady state, not real time. Use Step or a slower Speed to watch the sketch run line by line.",
          ...at(callee),
        });
        return;
      }

      const api = API_ARITY[name];
      if (api) {
        if (api.count >= 0 && args.length !== api.count) {
          add({ severity: "error", message: `${name} takes ${api.count} argument${api.count === 1 ? "" : "s"}: ${api.signature}. Got ${args.length}.`, ...at(node) });
        }
        if (name !== "log" && args[0] !== undefined) {
          const pin = checkPin(args[0], name);
          if (pin && name === "analogRead") {
            const info = pins.find((p) => p.name === pin);
            if (info && !info.capabilities.includes("analog_in")) {
              add({ severity: "warning", message: `${pin} isn't an analog input. On real hardware analogRead(${pin}) won't measure a voltage; use an A pin.`, ...at(args[0] as AstNode) });
            }
          }
        }
        if (name === "digitalWrite" && isNode(args[1])) {
          const level = args[1];
          const lit = literalValue(level);
          const okLiteral = lit === 0 || lit === 1 || lit === "HIGH" || lit === "LOW";
          const okIdent = level.type === "Identifier" && (API_CONSTANTS.has(level["name"] as string) || declared.has(level["name"] as string));
          if (lit !== null && !okLiteral) {
            add({ severity: "warning", message: `digitalWrite level ${JSON.stringify(lit)} isn't HIGH or LOW; it will be treated as LOW.`, ...at(level) });
          } else if (level.type === "Identifier" && !okIdent) {
            add({ severity: "error", message: `${String(level["name"])} is not defined. Use HIGH or LOW.`, ...at(level) });
          }
        }
        if (name === "pinMode" && isNode(args[1])) {
          const mode = args[1];
          const lit = literalValue(mode);
          if (mode.type === "Identifier" && (mode["name"] === "OUTPUT" || mode["name"] === "INPUT") && !declared.has(mode["name"] as string)) {
            add({ severity: "error", message: `${String(mode["name"])} is not defined here. Pass the mode as a string: pinMode(pin, "${String(mode["name"])}").`, ...at(mode) });
          } else if (lit !== null && lit !== "OUTPUT" && lit !== "INPUT") {
            add({ severity: "warning", message: `pinMode mode ${JSON.stringify(lit)} isn't "INPUT" or "OUTPUT"; it will be treated as an input.`, ...at(mode) });
          }
        }
        return;
      }

      if (!declared.has(name) && !KNOWN_GLOBALS.has(name)) {
        const hint = suggestion(name, [...API_NAMES, ...declared]);
        add({ severity: "error", message: `${name}() is not defined.${hint ? ` Did you mean ${hint}?` : ""}`, ...at(callee) });
      }
    }

    const isLoop = node.type === "WhileStatement" || node.type === "ForStatement" || node.type === "DoWhileStatement";
    if (isLoop && isAlwaysTrue(node["test"]) && isNode(node["body"]) && !containsExit(node["body"])) {
      add({
        severity: "warning",
        message: "This loop never ends. The simulator has no real-time clock and stops programs after 0.5 s; use Step to watch iterations instead.",
        line: node.loc?.start.line ?? 1,
        col: (node.loc?.start.column ?? 0) + 1,
        from: node.start,
        to: Math.min(node.end, node.start + 5),
      });
    }
  });

  return problems;
}

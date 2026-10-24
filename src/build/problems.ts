/**
 * A single thing wrong (or worth knowing) about the sketch, the board, the last
 * run, or the solved circuit. Everything the Problems panel shows is one of these.
 */
export type ProblemSeverity = "error" | "warning" | "info";
export type ProblemSource = "code" | "board" | "run" | "sim";

export interface Problem {
  id: string;
  severity: ProblemSeverity;
  source: ProblemSource;
  message: string;
  /** 1-based source line, for code and run problems. */
  line?: number;
  /** 1-based column. */
  col?: number;
  /** Character offsets into the sketch, for editor underlines. */
  from?: number;
  to?: number;
  /** Part this problem is about, so clicking it can select the part. */
  ref?: string;
  netId?: string;
}

const RANK: Record<ProblemSeverity, number> = { error: 0, warning: 1, info: 2 };

/** Errors first, then warnings, then info; stable within a severity. */
export function sortProblems(problems: Problem[]): Problem[] {
  return problems
    .map((p, i) => ({ p, i }))
    .sort((a, b) => RANK[a.p.severity] - RANK[b.p.severity] || a.i - b.i)
    .map(({ p }) => p);
}

export function countBySeverity(problems: Problem[]): Record<ProblemSeverity, number> {
  const out: Record<ProblemSeverity, number> = { error: 0, warning: 0, info: 0 };
  for (const p of problems) out[p.severity] += 1;
  return out;
}

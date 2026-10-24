/**
 * DC solver — Modified Nodal Analysis with piecewise-linear nonlinear iteration.
 *
 * MNA formulation:  G·x = b
 *   x = [V_n1 … V_nk, I_j1 … I_jm]
 *   first k entries = node voltages (ground excluded)
 *   last m entries  = currents through voltage sources (positive = into + terminal)
 *
 * Nonlinear devices iterate up to MAX_ITER.  Each iteration re-stamps the
 * linearised model, re-solves, then checks whether the assumed device states are
 * self-consistent.  Convergence is declared when no state flips.
 *
 * All types are imported from the frozen board-model contract; none are redefined.
 */

import type {
  Board,
  BranchCurrent,
  McuState,
  Part,
  SimResult,
  SimWarning,
} from "../model/board-model";

// ─── constants ─────────────────────────────────────────────────────────────────

const MAX_ITER = 30;
/** MCU input impedance to ground (keeps the matrix non-singular). */
const MCU_INPUT_OHMS = 1e6;
/** "Open circuit" resistance for off diodes / cutoff transistor junctions. */
const OFF_R = 1e9;
/** LED/diode rated current for overcurrent warnings. */
const LED_RATED_A = 0.02;

// ─── MNA matrix helpers ────────────────────────────────────────────────────────

interface Mna {
  /** Non-ground node count. */
  n: number;
  /** Current number of voltage-source (extra) rows. */
  vs: number;
  /** (n+vs) × (n+vs) conductance/constraint matrix. */
  G: Float64Array[];
  /** RHS vector, length n+vs. */
  b: Float64Array;
}

function newMna(nodes: number): Mna {
  const n = nodes;
  return {
    n,
    vs: 0,
    G: Array.from({ length: n }, () => new Float64Array(n)),
    b: new Float64Array(n),
  };
}

/** Expand by one row+col for a new voltage source; returns the new row index k. */
function expandRow(mna: Mna): number {
  const k = mna.n + mna.vs;
  const newSize = k + 1;
  // Expand every existing row.
  const newG: Float64Array[] = mna.G.map((row) => {
    const r = new Float64Array(newSize);
    r.set(row);
    return r;
  });
  newG.push(new Float64Array(newSize));
  const newB = new Float64Array(newSize);
  newB.set(mna.b);
  mna.G = newG;
  mna.b = newB;
  mna.vs += 1;
  return k;
}

/** Stamp conductance g between nodes i and j (−1 = ground). */
function G(mna: Mna, i: number, j: number, g: number): void {
  if (i >= 0) mna.G[i]![i]! += g;
  if (j >= 0) mna.G[j]![j]! += g;
  if (i >= 0 && j >= 0) {
    mna.G[i]![j]! -= g;
    mna.G[j]![i]! -= g;
  }
}

/**
 * Stamp an independent voltage source: V(i) − V(j) = v.
 * Returns k = solution row index for the branch current I (positive = i→j inside source).
 */
function VS(mna: Mna, i: number, j: number, v: number): number {
  const k = expandRow(mna);
  if (i >= 0) { mna.G[i]![k]! += 1; mna.G[k]![i]! += 1; }
  if (j >= 0) { mna.G[j]![k]! -= 1; mna.G[k]![j]! -= 1; }
  mna.b[k]! = v;
  return k;
}

/**
 * Stamp a voltage-controlled current source: I(drain←source) = gm · (V(cp)−V(cn)).
 * Current flows from `src` to `drn` (i.e., drains `drn`, supplies `src`).
 * Controlling voltage is V(cp) − V(cn).
 */
function VCCS(mna: Mna, drn: number, src: number, cp: number, cn: number, gm: number): void {
  // KCL contribution: I flows out of drn, into src.
  if (drn >= 0 && cp >= 0) mna.G[drn]![cp]! -= gm;
  if (drn >= 0 && cn >= 0) mna.G[drn]![cn]! += gm;
  if (src >= 0 && cp >= 0) mna.G[src]![cp]! += gm;
  if (src >= 0 && cn >= 0) mna.G[src]![cn]! -= gm;
}

/**
 * Stamp a current-controlled current source: I_out = β · I_ctrl.
 * `ctrlRow` is the MNA row index of the controlling vsource current.
 * Current I_out flows from `src` into `drn`.
 */
function CCCS(mna: Mna, drn: number, src: number, ctrlRow: number, beta: number): void {
  // I_out flows out of src (supplies src→drn path) = −β·I_ctrl injected at drn, drained at src.
  // In MNA, I_ctrl is a solution variable at index ctrlRow.
  // KCL: at drn node, add +β·I_ctrl; at src node, add −β·I_ctrl.
  if (drn >= 0) mna.G[drn]![ctrlRow]! += beta;
  if (src >= 0) mna.G[src]![ctrlRow]! -= beta;
}

/** Inject current amps into node i (positive = into node). */
function I(mna: Mna, i: number, amps: number): void {
  if (i >= 0) mna.b[i]! += amps;
}

// ─── Gaussian elimination ──────────────────────────────────────────────────────

function gaussSolve(mna: Mna): Float64Array<ArrayBufferLike> | null {
  const n = mna.n + mna.vs;
  // Augmented matrix.
  const A: Float64Array[] = mna.G.map((row, i) => {
    const r = new Float64Array(n + 1);
    r.set(row);
    r[n] = mna.b[i]!;
    return r;
  });

  for (let col = 0; col < n; col++) {
    // Partial pivot.
    let maxRow = col;
    let maxVal = Math.abs(A[col]![col]!);
    for (let row = col + 1; row < n; row++) {
      const v = Math.abs(A[row]![col]!);
      if (v > maxVal) { maxVal = v; maxRow = row; }
    }
    if (maxVal < 1e-14) return null;
    if (maxRow !== col) { const t = A[col]!; A[col] = A[maxRow]!; A[maxRow] = t; }

    const pivot = A[col]![col]!;
    for (let row = col + 1; row < n; row++) {
      const f = A[row]![col]! / pivot;
      for (let c = col; c <= n; c++) A[row]![c]! -= f * A[col]![c]!;
    }
  }

  const x = new Float64Array(n) as Float64Array<ArrayBufferLike>;
  for (let row = n - 1; row >= 0; row--) {
    let s = A[row]![n]!;
    for (let c = row + 1; c < n; c++) s -= A[row]![c]! * x[c]!;
    x[row] = s / A[row]![row]!;
  }
  return x;
}

// ─── Node index map ────────────────────────────────────────────────────────────

function buildNodeMap(board: Board): Map<string, number> {
  const map = new Map<string, number>();
  let idx = 0;
  for (const net of board.nets) {
    if (net.id !== board.groundNetId) map.set(net.id, idx++);
  }
  return map;
}

// ─── Device states ─────────────────────────────────────────────────────────────

type DiodeState = "on" | "off";
type NpnState = "cutoff" | "active" | "saturated";

// ─── Solve ─────────────────────────────────────────────────────────────────────

export function solve(board: Board, mcuState: McuState): SimResult {
  const nodeMap = buildNodeMap(board);
  const nodeCount = nodeMap.size;

  if (nodeCount === 0) {
    return { ok: true, netVoltages: { [board.groundNetId]: 0 }, branches: [], deviceStates: {}, warnings: [], iterations: 0 };
  }

  /** Node index, −1 for ground or null net. */
  const ni = (netId: string | null): number => {
    if (netId === null || netId === board.groundNetId) return -1;
    return nodeMap.get(netId) ?? -1;
  };

  const padNet = (part: Part, padNum: string): string | null =>
    part.pads.find((p) => p.number === padNum)?.netId ?? null;

  // ── Initial device states ────────────────────────────────────────────────────
  const diodeState = new Map<string, DiodeState>();
  const npnState = new Map<string, NpnState>();
  for (const part of board.parts) {
    if (!part.model) continue;
    if (part.model.type === "led" || part.model.type === "diode") diodeState.set(part.ref, "off");
    else if (part.model.type === "npn") npnState.set(part.ref, "cutoff");
  }

  // MNA solution from previous iteration.
  let sol: Float64Array<ArrayBufferLike> = new Float64Array(nodeCount);
  let iterations = 0;

  // Records of vsource rows so we can read branch currents from the solution.
  // Populated each iteration.
  interface VsRow { ref: string; row: number; fromPad: string; toPad: string }
  let vsRows: VsRow[] = [];

  for (let iter = 0; iter < MAX_ITER; iter++) {
    iterations = iter;
    vsRows = [];

    const mna = newMna(nodeCount);

    for (const part of board.parts) {
      if (!part.model) continue;
      const m = part.model;

      switch (m.type) {

        case "resistor": {
          const p1 = part.pads[0]; const p2 = part.pads[1];
          if (p1 && p2) G(mna, ni(p1.netId), ni(p2.netId), 1 / m.ohms);
          break;
        }

        case "potentiometer": {
          const safeR = (r: number) => Math.max(r, 1e-6);
          const rA = safeR(m.ohms * m.wiper);
          const rB = safeR(m.ohms * (1 - m.wiper));
          G(mna, ni(padNet(part, m.endA)), ni(padNet(part, m.wiperPad)), 1 / rA);
          G(mna, ni(padNet(part, m.wiperPad)), ni(padNet(part, m.endB)), 1 / rB);
          break;
        }

        case "capacitor":
          break; // open circuit at DC

        case "vsource": {
          const row = VS(mna, ni(padNet(part, m.posPad)), ni(padNet(part, m.negPad)), m.volts);
          vsRows.push({ ref: part.ref, row, fromPad: m.posPad, toPad: m.negPad });
          break;
        }

        case "led":
        case "diode": {
          const nA = ni(padNet(part, m.anodePad));
          const nC = ni(padNet(part, m.cathodePad));
          if (diodeState.get(part.ref) === "on") {
            // Thevenin: conductance 1/rOn + current source Vf/rOn (Norton equivalent of Vf + rOn series).
            G(mna, nA, nC, 1 / m.rOn);
            I(mna, nA,  m.vf / m.rOn);
            I(mna, nC, -m.vf / m.rOn);
          } else {
            G(mna, nA, nC, 1 / OFF_R);
          }
          break;
        }

        case "npn": {
          const nB = ni(padNet(part, m.basePad));
          const nC = ni(padNet(part, m.collectorPad));
          const nE = ni(padNet(part, m.emitterPad));
          const st = npnState.get(part.ref)!;

          if (st === "cutoff") {
            G(mna, nB, nE, 1 / OFF_R);
            G(mna, nC, nE, 1 / OFF_R);

          } else if (st === "active") {
            // B-E: voltage source Vbe (sets V_B − V_E = Vbe exactly).
            const rowBE = VS(mna, nB, nE, m.vbe);
            vsRows.push({ ref: part.ref, row: rowBE, fromPad: m.basePad, toPad: m.emitterPad });
            // C-E: CCCS  Ic = β · Ib, where Ib = solution[rowBE].
            // Ic flows from emitter into collector (conventional current C→E inside transistor,
            // so collector is a current sink, emitter is a source in the external circuit).
            CCCS(mna, nC, nE, rowBE, m.beta);

          } else {
            // Saturated: V_BE = Vbe, V_CE = VceSat — two independent vsources.
            const rowBE = VS(mna, nB, nE, m.vbe);
            vsRows.push({ ref: part.ref, row: rowBE, fromPad: m.basePad, toPad: m.emitterPad });
            const rowCE = VS(mna, nC, nE, m.vceSat);
            vsRows.push({ ref: part.ref, row: rowCE, fromPad: m.collectorPad, toPad: m.emitterPad });
          }
          break;
        }

        case "mcu": {
          const nVcc = ni(padNet(part, m.vccPad));
          const nGnd = ni(padNet(part, m.gndPad));
          for (const pin of m.pins) {
            const nPin = ni(padNet(part, pin.pad));
            if (mcuState.modes[pin.name] === "output") {
              const level = mcuState.outputs[pin.name] ?? 0;
              if (level === 1) {
                // OUTPUT HIGH: outputOhms between vccPad net and pin net.
                G(mna, nVcc, nPin, 1 / pin.outputOhms);
              } else {
                // OUTPUT LOW: outputOhms between pin net and gndPad net.
                G(mna, nPin, nGnd, 1 / pin.outputOhms);
              }
            } else {
              // INPUT: 1 MΩ from pin net to gndPad net.
              G(mna, nPin, nGnd, 1 / MCU_INPUT_OHMS);
            }
          }
          break;
        }
      }
    }

    const newSol = gaussSolve(mna);
    if (!newSol) {
      return {
        ok: false,
        netVoltages: voltageMap(board, nodeMap, sol),
        branches: [],
        deviceStates: deviceStateMap(diodeState, npnState),
        warnings: [{ severity: "danger", message: "Solver: singular matrix — check for short circuits or floating nodes." }],
        iterations,
      };
    }
    sol = newSol;

    // ── State convergence check ───────────────────────────────────────────────
    let converged = true;

    for (const part of board.parts) {
      if (!part.model) continue;
      const m = part.model;

      if (m.type === "led" || m.type === "diode") {
        const vA = nodeV(sol, nodeMap, board.groundNetId, padNet(part, m.anodePad));
        const vC = nodeV(sol, nodeMap, board.groundNetId, padNet(part, m.cathodePad));
        const vAC = vA - vC;
        const was = diodeState.get(part.ref)!;
        // Turn on when Vac >= Vf; turn off when Vac < Vf (hysteresis via 0.99).
        const now: DiodeState = vAC >= m.vf * (was === "off" ? 1.0 : 0.99) ? "on" : "off";
        if (now !== was) { diodeState.set(part.ref, now); converged = false; }
      }

      if (m.type === "npn") {
        const vB = nodeV(sol, nodeMap, board.groundNetId, padNet(part, m.basePad));
        const vC = nodeV(sol, nodeMap, board.groundNetId, padNet(part, m.collectorPad));
        const vE = nodeV(sol, nodeMap, board.groundNetId, padNet(part, m.emitterPad));
        const vBE = vB - vE;
        const vCE = vC - vE;
        const was = npnState.get(part.ref)!;

        let now: NpnState;
        if (vBE < m.vbe * 0.5) {
          now = "cutoff";
        } else if (vCE <= m.vceSat * 1.05) {
          now = "saturated";
        } else {
          now = "active";
        }
        if (now !== was) { npnState.set(part.ref, now); converged = false; }
      }
    }

    if (converged) break;
  }

  // ── Build result ───────────────────────────────────────────────────────────
  const netVoltages = voltageMap(board, nodeMap, sol);
  const branches = buildBranches(board, nodeMap, sol, vsRows, diodeState, npnState, mcuState);
  const warnings = buildWarnings(board, nodeMap, sol, diodeState, branches, mcuState);

  return {
    ok: iterations < MAX_ITER - 1,
    netVoltages,
    branches,
    deviceStates: deviceStateMap(diodeState, npnState),
    warnings,
    iterations,
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function nodeV(sol: Float64Array<ArrayBufferLike>, nodeMap: Map<string, number>, gnd: string, netId: string | null): number {
  if (netId === null || netId === gnd) return 0;
  const idx = nodeMap.get(netId);
  return idx === undefined ? 0 : (sol[idx] ?? 0);
}

function voltageMap(board: Board, nodeMap: Map<string, number>, sol: Float64Array<ArrayBufferLike>): Record<string, number> {
  const out: Record<string, number> = { [board.groundNetId]: 0 };
  for (const [netId, idx] of nodeMap) out[netId] = sol[idx] ?? 0;
  return out;
}

function deviceStateMap(
  diodeState: Map<string, DiodeState>,
  npnState: Map<string, NpnState>,
): Record<string, "on" | "off" | "saturated" | "active" | "cutoff"> {
  const out: Record<string, "on" | "off" | "saturated" | "active" | "cutoff"> = {};
  for (const [ref, s] of diodeState) out[ref] = s;
  for (const [ref, s] of npnState) out[ref] = s;
  return out;
}

// ─── Branch currents ──────────────────────────────────────────────────────────

interface VsRow { ref: string; row: number; fromPad: string; toPad: string }

function buildBranches(
  board: Board,
  nodeMap: Map<string, number>,
  sol: Float64Array<ArrayBufferLike>,
  vsRows: VsRow[],
  diodeState: Map<string, DiodeState>,
  npnState: Map<string, NpnState>,
  mcuState: McuState,
): BranchCurrent[] {
  const gnd = board.groundNetId;
  const V = (netId: string | null) => nodeV(sol, nodeMap, gnd, netId);
  const branches: BranchCurrent[] = [];

  // Index vsRows by ref for quick lookup.
  const vsMap = new Map<string, VsRow[]>();
  for (const vr of vsRows) {
    if (!vsMap.has(vr.ref)) vsMap.set(vr.ref, []);
    vsMap.get(vr.ref)!.push(vr);
  }

  for (const part of board.parts) {
    if (!part.model) continue;
    const m = part.model;

    switch (m.type) {

      case "resistor": {
        const p1 = part.pads[0]; const p2 = part.pads[1];
        if (!p1 || !p2) break;
        const vd = V(p1.netId) - V(p2.netId);
        const amps = Math.abs(vd / m.ohms);
        const [fp, tp] = vd >= 0 ? [p1.number, p2.number] : [p2.number, p1.number];
        branches.push({ ref: part.ref, fromPad: fp, toPad: tp, amps });
        break;
      }

      case "potentiometer": {
        const safeR = (r: number) => Math.max(r, 1e-6);
        const rA = safeR(m.ohms * m.wiper);
        const rB = safeR(m.ohms * (1 - m.wiper));
        const nA = part.pads.find((p) => p.number === m.endA)?.netId ?? null;
        const nW = part.pads.find((p) => p.number === m.wiperPad)?.netId ?? null;
        const nB = part.pads.find((p) => p.number === m.endB)?.netId ?? null;
        const iA = (V(nA) - V(nW)) / rA;
        const iB = (V(nW) - V(nB)) / rB;
        branches.push(iA >= 0
          ? { ref: part.ref, fromPad: m.endA, toPad: m.wiperPad, amps: iA }
          : { ref: part.ref, fromPad: m.wiperPad, toPad: m.endA, amps: -iA });
        branches.push(iB >= 0
          ? { ref: part.ref, fromPad: m.wiperPad, toPad: m.endB, amps: iB }
          : { ref: part.ref, fromPad: m.endB, toPad: m.wiperPad, amps: -iB });
        break;
      }

      case "vsource": {
        // The MNA solution holds the branch current directly in the vsource row.
        // Convention: positive I = flowing from neg to pos inside the source (i.e. out of pos externally).
        const vr = vsMap.get(part.ref)?.[0];
        if (!vr) break;
        // sol[vr.row] = current through the source, positive when flowing pos→neg externally.
        const rawI = sol[vr.row] ?? 0;
        // For external current delivery: positive rawI means current exits the + terminal.
        const amps = Math.abs(rawI);
        const [fp, tp] = rawI >= 0 ? [m.posPad, m.negPad] : [m.negPad, m.posPad];
        branches.push({ ref: part.ref, fromPad: fp, toPad: tp, amps });
        break;
      }

      case "led":
      case "diode": {
        const vA = V(part.pads.find((p) => p.number === m.anodePad)?.netId ?? null);
        const vC = V(part.pads.find((p) => p.number === m.cathodePad)?.netId ?? null);
        const st = diodeState.get(part.ref) ?? "off";
        const amps = st === "on" ? Math.max(0, (vA - vC - m.vf) / m.rOn) : 0;
        branches.push({ ref: part.ref, fromPad: m.anodePad, toPad: m.cathodePad, amps });
        break;
      }

      case "npn": {
        const st = npnState.get(part.ref) ?? "cutoff";
        const rows = vsMap.get(part.ref) ?? [];

        if (st === "cutoff") {
          branches.push({ ref: part.ref, fromPad: m.collectorPad, toPad: m.emitterPad, amps: 0 });
          branches.push({ ref: part.ref, fromPad: m.basePad,      toPad: m.emitterPad, amps: 0 });

        } else if (st === "active") {
          // Base current from the B-E vsource row.
          const rowBE = rows.find((r) => r.fromPad === m.basePad);
          const ib = rowBE ? Math.abs(sol[rowBE.row] ?? 0) : 0;
          const ic = m.beta * ib;
          branches.push({ ref: part.ref, fromPad: m.collectorPad, toPad: m.emitterPad, amps: ic });
          branches.push({ ref: part.ref, fromPad: m.basePad,      toPad: m.emitterPad, amps: ib });

        } else {
          // Saturated: read both vsource rows.
          const rowBE = rows.find((r) => r.fromPad === m.basePad);
          const rowCE = rows.find((r) => r.fromPad === m.collectorPad);
          const ib = rowBE ? Math.abs(sol[rowBE.row] ?? 0) : 0;
          // For the CE vsource, positive current in MNA = flowing C→E through the source
          // i.e. into collector externally.
          const ic = rowCE ? Math.abs(sol[rowCE.row] ?? 0) : 0;
          branches.push({ ref: part.ref, fromPad: m.collectorPad, toPad: m.emitterPad, amps: ic });
          branches.push({ ref: part.ref, fromPad: m.basePad,      toPad: m.emitterPad, amps: ib });
        }
        break;
      }

      case "mcu": {
        const vccNet = part.pads.find((p) => p.number === m.vccPad)?.netId ?? null;
        const gndNet = part.pads.find((p) => p.number === m.gndPad)?.netId ?? null;
        for (const pin of m.pins) {
          const pinNet = part.pads.find((p) => p.number === pin.pad)?.netId ?? null;
          if (mcuState.modes[pin.name] === "output") {
            const level = mcuState.outputs[pin.name] ?? 0;
            if (level === 1) {
              // Current flows from vccPad → pin (HIGH output sources current).
              const amps = Math.max(0, (V(vccNet) - V(pinNet)) / pin.outputOhms);
              branches.push({ ref: part.ref, fromPad: m.vccPad, toPad: pin.pad, amps });
            } else {
              // Current flows from pin → gndPad (LOW output sinks current).
              const amps = Math.max(0, (V(pinNet) - V(gndNet)) / pin.outputOhms);
              branches.push({ ref: part.ref, fromPad: pin.pad, toPad: m.gndPad, amps });
            }
          } else {
            // Input: 1 MΩ pull-down from pin net to gndPad net.
            // Emit a branch so KCL balances — amps is tiny (~µA) but must be accounted for.
            const amps = Math.max(0, (V(pinNet) - V(gndNet)) / MCU_INPUT_OHMS);
            if (amps > 0) {
              branches.push({ ref: part.ref, fromPad: pin.pad, toPad: m.gndPad, amps });
            }
          }
        }
        break;
      }

      case "capacitor":
        break; // no DC current
    }
  }

  return branches;
}

// ─── Warnings ──────────────────────────────────────────────────────────────────

function buildWarnings(
  board: Board,
  nodeMap: Map<string, number>,
  sol: Float64Array<ArrayBufferLike>,
  diodeState: Map<string, DiodeState>,
  branches: BranchCurrent[],
  mcuState: McuState,
): SimWarning[] {
  const gnd = board.groundNetId;
  const V = (netId: string | null) => nodeV(sol, nodeMap, gnd, netId);
  const warnings: SimWarning[] = [];

  for (const part of board.parts) {
    if (!part.model) continue;
    const m = part.model;

    if (m.type === "led" || m.type === "diode") {
      const vA = V(part.pads.find((p) => p.number === m.anodePad)?.netId ?? null);
      const vC = V(part.pads.find((p) => p.number === m.cathodePad)?.netId ?? null);

      // Reverse-biased.
      if (vC > vA + 0.05) {
        warnings.push({
          severity: "warn",
          ref: part.ref,
          message: `${part.ref} is reverse biased (anode ${vA.toFixed(2)} V, cathode ${vC.toFixed(2)} V). Current flows in the wrong direction.`,
        });
      }

      // Overcurrent (LED only).
      if (m.type === "led") {
        const b = branches.find((br) => br.ref === part.ref);
        if (b && b.amps > LED_RATED_A) {
          warnings.push({
            severity: "danger",
            ref: part.ref,
            message: `${part.ref} is drawing ${(b.amps * 1000).toFixed(1)} mA, which exceeds its 20 mA rating. Reduce the series resistor to avoid damage.`,
          });
        }
      }
    }

    if (m.type === "mcu") {
      for (const pin of m.pins) {
        const pinMode = mcuState.modes[pin.name];
        const isInput = !pinMode || pinMode === "input";
        if (!isInput) continue;
        const pinNet = part.pads.find((p) => p.number === pin.pad)?.netId ?? null;
        if (!pinNet || pinNet === gnd) continue;

        // "Driven" = any non-MCU part with a pad on the same net that can source/sink.
        let driven = false;
        outer: for (const other of board.parts) {
          if (other.ref === part.ref || !other.model) continue;
          const om = other.model;
          for (const pad of other.pads) {
            if (pad.netId !== pinNet) continue;
            if (om.type === "vsource" || om.type === "resistor" || om.type === "potentiometer"
              || om.type === "led" || om.type === "diode" || om.type === "npn") {
              driven = true; break outer;
            }
          }
        }
        if (!driven) {
          warnings.push({
            severity: "warn",
            ref: part.ref,
            netId: pinNet,
            message: `U1 pin ${pin.name} (net ${pinNet}) is undriven — floating input. Reading it will give an undefined value.`,
          });
        }
      }
    }
  }

  // ── Rail limits ──────────────────────────────────────────────────────────────
  // When a configured rail net sags below its minimum, emit a danger warning with
  // the net id and the board-authored message.
  if (board.railLimits) {
    for (const limit of board.railLimits) {
      const v = V(limit.netId);
      if (v < limit.minVolts) {
        warnings.push({
          severity: "danger",
          netId: limit.netId,
          message: limit.message,
        });
      }
    }
  }

  return warnings;
}

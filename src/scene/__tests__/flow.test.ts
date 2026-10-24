import { describe, expect, it } from "vitest";
import demoJson from "../../model/demo-board.json";
import type { Board, Vec2 } from "../../model/board-model";
import { solve } from "../../solver/solve";
import { netCurrent, netEndpoints, orientSegments } from "../flow";

const demo = demoJson as Board;
const d8High = { modes: { D8: "output" as const }, outputs: { D8: 1 as const } };

function padAt(board: Board, ref: string, pad: string): Vec2 {
  return board.parts.find((p) => p.ref === ref)!.pads.find((p) => p.number === pad)!.position;
}

describe("current flow direction", () => {
  it("orients a straight run toward the sink", () => {
    const segs = [{ a: { x: 0, y: 0 }, b: { x: 10, y: 0 } }, { a: { x: 10, y: 0 }, b: { x: 10, y: 5 } }];
    expect(orientSegments(segs, [{ x: 0, y: 0 }], [{ x: 10, y: 5 }])).toEqual([1, 1]);
    expect(orientSegments(segs, [{ x: 10, y: 5 }], [{ x: 0, y: 0 }])).toEqual([-1, -1]);
  });

  it("flows away from a source when a net has no sink", () => {
    const segs = [{ a: { x: 5, y: 0 }, b: { x: 0, y: 0 } }];
    expect(orientSegments(segs, [{ x: 0, y: 0 }], [])).toEqual([-1]);
  });

  it("finds where current enters and leaves the demo's LED anode net", () => {
    const sim = solve(demo, d8High);
    const { sources, sinks } = netEndpoints(demo, sim, "LED_A");
    expect(sources).toEqual([{ ref: "R2", pad: "2" }]);
    expect(sinks).toEqual([{ ref: "D1", pad: "A" }]);
    expect(netCurrent(demo, sim, "LED_A")).toBeGreaterThan(0.011);
  });

  it("runs the demo's LED anode trace from R2 to the LED, not backwards", () => {
    const sim = solve(demo, d8High);
    const tracks = demo.tracks.filter((t) => t.netId === "LED_A");
    const { sources, sinks } = netEndpoints(demo, sim, "LED_A");
    const dirs = orientSegments(
      tracks.map((t) => ({ a: t.start, b: t.end })),
      sources.map((r) => padAt(demo, r.ref, r.pad)),
      sinks.map((r) => padAt(demo, r.ref, r.pad)),
    );
    const r2 = padAt(demo, "R2", "2");
    for (const [i, t] of tracks.entries()) {
      const from = dirs[i] === 1 ? t.start : t.end;
      const to = dirs[i] === 1 ? t.end : t.start;
      // Every segment moves away from R2's pad.
      expect(Math.hypot(to.x - r2.x, to.y - r2.y)).toBeGreaterThan(Math.hypot(from.x - r2.x, from.y - r2.y));
    }
  });

  it("shows no flow on a net with no current", () => {
    const sim = solve(demo, { modes: { D8: "output" }, outputs: { D8: 0 } });
    expect(netCurrent(demo, sim, "LED_A")).toBeLessThan(1e-6);
  });
});

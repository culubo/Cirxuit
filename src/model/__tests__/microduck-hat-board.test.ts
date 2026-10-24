import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { Board } from "../board-model";
import { mountingHoles } from "../../scene/boardFeatures";

const board = JSON.parse(readFileSync(resolve(process.cwd(), "src/model/microduck-hat-board.json"), "utf8")) as Board;

describe("Pollen Microduck reference HAT", () => {
  it("keeps the official D1 four-layer geometry and key hardware nets", () => {
    expect(board.simulation).toBe("reference");
    expect(board.copperLayers).toEqual(["F.Cu", "In1.Cu", "In2.Cu", "B.Cu"]);
    expect(board.parts).toHaveLength(132);
    expect(board.tracks).toHaveLength(928);
    expect(board.vias).toHaveLength(107);
    expect(board.zones?.length).toBeGreaterThan(0);
    expect(board.zones?.some((z) => z.layer === "In1.Cu")).toBe(true);
    expect(board.zones?.some((z) => z.layer === "In2.Cu")).toBe(true);

    const byRef = (ref: string) => board.parts.find((part) => part.ref === ref)!;
    expect(byRef("U12").value).toBe("LSM6DSV16XTR");
    expect(byRef("U9").value).toBe("AP63205");
    expect(byRef("J4").pads.find((pad) => pad.number === "2")?.netId).toBe("6"); // +5V to compute board
    expect(board.nets.find((net) => net.id === "6")?.name).toBe("+5V");
    expect(mountingHoles(board).length).toBeGreaterThanOrEqual(4);
    expect(byRef("U4").fitted).toBe(false);
  });
});

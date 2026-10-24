/**
 * PowerOnChase — the finale of the assembly demo. When a freshly built board
 * powers on, it presses Run on the board's sketch in the editor: the robot
 * controller's starter sketch is a lamp test followed by an LED sweep, and the
 * workbench runner executes it in the worker runtime and replays the trace,
 * re-solving the circuit after every pin call.
 *
 * It only runs the untouched starter sketch (never code the user has edited),
 * and switches an Instant speed to Fast so the replay is visible.
 */
import { useEffect } from "react";
import type { Board } from "../model/board-model";
import { runnerRef } from "../ide/useRunner";
import { starterSketch } from "../ide/starters";
import { currentCode, useStore } from "../store/useStore";
import { useAssembly } from "./assembly";

/** Replay speed for the finale when the user has Instant selected (steps per second). */
const FINALE_SPEED = 8;

export default function PowerOnChase({ board }: { board: Board }): null {
  const powered = useAssembly((s) => s.poweredBoardId === board.id);

  useEffect(() => {
    if (!powered) return;
    useAssembly.getState().powerOn("");
    const s = useStore.getState();
    if (s.board?.id !== board.id || currentCode(s) !== starterSketch(board.id)) return;
    if (s.speed === 0) s.setSpeed(FINALE_SPEED);
    void runnerRef.current?.run();
  }, [powered, board.id]);

  return null;
}

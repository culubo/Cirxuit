/**
 * RobotHud — the Robot view's status line: rail voltage against its limit,
 * stalled servos, and what the robot is doing. Its data attributes are the
 * test hook for the robot's state (read from the solver, not the animation).
 */
import React, { useMemo } from "react";
import { useStore } from "../store/useStore";
import { formatQuantity } from "../ui/format";
import { tokens } from "../ui/tokens";
import { isRobotBoard, readRobot, type RobotState } from "./robotState";
import { useRobotStore } from "./useRobotStore";

const LABEL: Record<RobotState, string> = {
  walking: "Walking",
  limping: "Limping (servo stalled)",
  brownout: "Brownout: controller reset",
};

const COLOR: Record<RobotState, string> = {
  walking: tokens.healthy,
  limping: tokens.thermal,
  brownout: tokens.danger,
};

export default function RobotHud(): React.ReactElement | null {
  const board = useStore((s) => s.board);
  const simResult = useStore((s) => s.simResult);
  const robotView = useRobotStore((s) => s.robotView);
  const ready = useRobotStore((s) => s.ready);
  const phase = useRobotStore((s) => s.phase);
  const reading = useMemo(() => readRobot(board, simResult), [board, simResult]);
  if (!robotView || !isRobotBoard(board)) return null;

  if (board?.simulation === "reference") return (
    <div data-testid="robot-hardware-reference" role="status" style={{
      position: "absolute", top: "0.75rem", left: "50%", transform: "translateX(-50%)", zIndex: 10,
      fontFamily: tokens.fontMono, fontSize: "0.75rem", color: tokens.text,
      background: tokens.panel, border: `1px solid ${tokens.panelBorder}`, borderRadius: "4px",
      padding: "0.35rem 0.8rem", whiteSpace: "nowrap", pointerEvents: "none",
    }}>Microduck reference hardware · HAT in head · RK3566 on companion board</div>
  );
  if (!reading) return null;

  const { state, rail, stalled } = reading;
  return (
    <div
      data-testid="robot-state"
      data-robot-state={state}
      data-robot-phase={phase}
      data-robot-ready={ready ? "true" : "false"}
      data-robot-stalls={stalled.length}
      role="status"
      aria-live="polite"
      style={{
        position: "absolute",
        top: "0.75rem",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 10,
        display: "flex",
        gap: "0.9rem",
        alignItems: "center",
        fontFamily: tokens.fontMono,
        fontSize: "0.75rem",
        color: tokens.textDim,
        background: tokens.panel,
        border: `1px solid ${COLOR[state]}`,
        borderRadius: "4px",
        padding: "0.35rem 0.8rem",
        whiteSpace: "nowrap",
        pointerEvents: "none",
      }}
    >
      <span style={{ color: COLOR[state], fontWeight: 600 }}>{LABEL[state]}</span>
      {rail && (
        <span>
          {rail.netId} {formatQuantity(rail.volts, "V")}
          <span style={{ color: tokens.textFaint }}> / min {formatQuantity(rail.minVolts, "V")}</span>
        </span>
      )}
      <span>{stalled.length === 0 ? "No stalls" : `Stalled: ${stalled.join(", ")}`}</span>
      {!ready && <span style={{ color: tokens.textFaint }}>Loading robot…</span>}
    </div>
  );
}

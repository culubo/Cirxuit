/**
 * Brand art for the workbench chrome: the logo orb and the lab-coat mascot.
 *
 *   wave     hello: the guide's intro
 *   inspect  holding a board up to the light: all clear, guide finished
 */
import React from "react";
import inspectUrl from "./mascot-inspect.webp";
import waveUrl from "./mascot-wave.webp";
import orbUrl from "./logo-orb.webp";

export { orbUrl };

const POSES = {
  wave: waveUrl,
  inspect: inspectUrl,
} as const;

export type MascotPose = keyof typeof POSES;

interface MascotProps {
  pose: MascotPose;
  /** Rendered size in px (the art is square). */
  size: number;
  style?: React.CSSProperties;
}

/** Decorative: the text beside it always carries the meaning. */
export default function Mascot({ pose, size, style }: MascotProps): React.ReactElement {
  return (
    <img
      src={POSES[pose]}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      draggable={false}
      style={{ display: "block", flex: "none", userSelect: "none", ...style }}
    />
  );
}

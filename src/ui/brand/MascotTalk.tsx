/**
 * MascotTalk — the mascot's head saying a line: the text types out while the
 * mouth cycles through its talking frames, then the face settles on the mood.
 *
 *   neutral  small smile        happy  eyes closed, beaming
 *   oops     sweating, wincing
 *
 * The whole sentence is in the DOM from the first frame (untyped characters are
 * transparent), so layout never jumps and screen readers and tests read the
 * full text immediately. Click to finish the line; reduced motion skips typing.
 */
import React, { useEffect, useState } from "react";
import happyUrl from "./face-happy.webp";
import oopsUrl from "./face-oops.webp";
import restUrl from "./face-rest.webp";
import talkAUrl from "./face-talk-a.webp";
import talkBUrl from "./face-talk-b.webp";
import talkCUrl from "./face-talk-c.webp";

export type MascotMood = "neutral" | "happy" | "oops";

const REST: Record<MascotMood, string> = { neutral: restUrl, happy: happyUrl, oops: oopsUrl };
const TALK = [talkAUrl, talkBUrl, talkCUrl, talkBUrl];
const MOUTH_MS = 110;
/** The face art's height ÷ width (cropped tight to the head). */
const ASPECT = 237 / 320;

// Decode every frame up front so the first syllables don't flicker.
if (typeof Image !== "undefined") {
  for (const src of [...TALK, ...Object.values(REST)]) { const img = new Image(); img.src = src; }
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

interface MascotTalkProps {
  text: string;
  mood?: MascotMood;
  /** Head width, px (height follows the art). */
  size?: number;
  /** Typing speed, characters per second. */
  cps?: number;
  /** Style for the text block. */
  textStyle?: React.CSSProperties;
  style?: React.CSSProperties;
}

export default function MascotTalk({ text, mood = "neutral", size = 56, cps = 55, textStyle, style }: MascotTalkProps): React.ReactElement {
  const [shown, setShown] = useState(() => (prefersReducedMotion() ? text.length : 0));
  const [mouth, setMouth] = useState(0);
  const talking = shown < text.length;

  // A new line starts from the beginning.
  useEffect(() => { setShown(prefersReducedMotion() ? text.length : 0); }, [text]);

  // Typing follows the clock, not the tick count, so a busy main thread (the 3D
  // scene rendering) delays a frame but never slows the sentence down.
  useEffect(() => {
    if (!talking) return;
    const start = performance.now() - (shown * 1000) / cps;
    const tick = window.setInterval(() => {
      const elapsed = performance.now() - start;
      setShown(Math.min(text.length, Math.floor((elapsed * cps) / 1000)));
      setMouth(Math.floor(elapsed / MOUTH_MS) % TALK.length);
    }, 30);
    return () => window.clearInterval(tick);
    // Restart only for a new line; `shown` seeds the clock when resuming.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [talking, text, cps]);

  return (
    <div
      onClick={() => setShown(text.length)}
      style={{ display: "flex", gap: "0.55rem", alignItems: "flex-start", cursor: talking ? "pointer" : "default", ...style }}
    >
      <img
        src={talking ? TALK[mouth] : REST[mood]}
        alt=""
        aria-hidden="true"
        width={size}
        height={Math.round(size * ASPECT)}
        draggable={false}
        style={{ display: "block", flex: "none", userSelect: "none" }}
      />
      <p style={{ margin: 0, ...textStyle }}>
        {text.slice(0, shown)}
        <span style={{ color: "transparent" }}>{text.slice(shown)}</span>
      </p>
    </div>
  );
}

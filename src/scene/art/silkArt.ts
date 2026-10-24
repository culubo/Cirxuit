/**
 * silkArt — ISO 3098 lettering for the boards' silkscreen (osifont, the
 * technical-drawing font that fab silkscreen text imitates).
 *
 * The face loads asynchronously, so the board bake awaits it once and every
 * later bake reuses it.
 */
import osifontUrl from "./osifont-lgpl3fe.woff";

/** CSS font stack for ISO 3098 product and silkscreen lettering. */
export const SILK_FONT_FAMILY = '"osifont", "Helvetica Neue", Arial, system-ui, sans-serif';

let pending: Promise<void> | null = null;

/** Register osifont once; resolves even if it fails (text falls back to Helvetica/Arial). */
export function loadSilkFont(): Promise<void> {
  if (typeof document === "undefined" || typeof FontFace === "undefined") return Promise.resolve();
  pending ??= new FontFace("osifont", `url(${osifontUrl}) format("woff")`)
    .load()
    .then((face) => { document.fonts.add(face); })
    .catch((error: unknown) => {
      console.warn("[silk] ISO 3098 font failed to load; silkscreen text uses the fallback face.", error);
    });
  return pending;
}

/**
 * Intro panel state: open on a person's first visit, reopened from the logo.
 *
 * Automated browsers (navigator.webdriver) skip the first-visit auto-open so
 * scripted runs start on the workbench itself; everyone else sees it once.
 */
import { create } from "zustand";

const SEEN_KEY = "circuit-xray:intro-seen";

function firstVisit(): boolean {
  if (typeof window === "undefined") return false;
  if (navigator.webdriver) return false;
  try {
    return window.localStorage.getItem(SEEN_KEY) === null;
  } catch {
    // Storage blocked (private mode): show it, it just won't be remembered.
    return true;
  }
}

interface IntroState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const useIntro = create<IntroState>((set) => ({
  open: firstVisit(),
  setOpen: (open) => {
    if (!open) {
      try { window.localStorage.setItem(SEEN_KEY, "1"); } catch { /* not remembered; harmless */ }
    }
    set({ open });
  },
}));

/** The logo spiral's pink, the brand's "look here" colour. */
export const SPIRAL_PINK = "#fa0271";

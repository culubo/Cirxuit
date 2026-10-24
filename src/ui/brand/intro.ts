/** Intro panel state. It stays out of the first paint and opens from the logo. */
import { create } from "zustand";

interface IntroState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const useIntro = create<IntroState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));

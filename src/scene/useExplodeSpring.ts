import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useStore } from "../store/useStore";

/**
 * Eased spring for the explode factor. Each frame the animated value is lerped
 * toward the store's `explode` target; `onFrame` receives the current value so
 * callers can position layer groups without per-frame React re-renders.
 *
 * The lerp factor gives a critically-damped feel that settles well under ~1 s.
 */
export function useExplodeSpring(onFrame: (value: number) => void): void {
  const current = useRef(useStore.getState().explode);

  useFrame((_, delta) => {
    const target = useStore.getState().explode;
    // Frame-rate-independent lerp: approach `target` with a time constant ~0.12 s.
    const k = 1 - Math.exp(-delta / 0.12);
    current.current += (target - current.current) * k;
    if (Math.abs(target - current.current) < 1e-4) current.current = target;
    onFrame(current.current);
  });
}

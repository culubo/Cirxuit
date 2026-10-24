/**
 * Lighting — drei Environment preset for PBR reflections, with a built-in light
 * rig fallback if the preset HDR fails to load (offline). Plus soft contact
 * shadows under the board.
 *
 * The Environment preset is the ONE allowed external runtime asset; everything
 * else is local. If it throws (network/suspense error) the error boundary swaps
 * in FallbackLights so the scene is never unlit.
 */
import React from "react";
import { ContactShadows, Environment } from "@react-three/drei";

/** Deterministic local light rig — used as the offline fallback and always safe. */
export function FallbackLights(): React.ReactElement {
  return (
    <>
      <hemisphereLight args={["#9fb8c8", "#20160f", 0.9]} />
      <directionalLight position={[40, 60, 80]} intensity={1.1} />
      <directionalLight position={[-50, 20, 30]} intensity={0.4} color="#8aa8c0" />
      <ambientLight intensity={0.15} />
    </>
  );
}

interface BoundaryState { failed: boolean }

/** Renders children; on any render/suspense error, shows the fallback rig instead. */
class EnvironmentBoundary extends React.Component<{ children: React.ReactNode }, BoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }
  override componentDidCatch(error: unknown): void {
    // Keep the scene lit; surface the reason for debugging without breaking render.
    console.warn("[Lighting] Environment preset failed; using fallback rig.", error);
  }
  override render(): React.ReactNode {
    if (this.state.failed) return <FallbackLights />;
    return this.props.children;
  }
}

export default function Lighting(): React.ReactElement {
  return (
    <>
      {/* A soft base light so the scene is lit even during Environment suspense. */}
      <FallbackLights />

      <EnvironmentBoundary>
        <React.Suspense fallback={null}>
          <Environment preset="city" />
        </React.Suspense>
      </EnvironmentBoundary>

      <ContactShadows
        position={[0, 0, -2]}
        rotation={[Math.PI / 2, 0, 0]}
        opacity={0.5}
        scale={120}
        blur={2.4}
        far={20}
        resolution={512}
        color="#000000"
      />
    </>
  );
}

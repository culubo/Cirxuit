/**
 * Lighting — a small product-shot rig for the board.
 *
 * A shadow-casting key light aimed at the board centre gives parts real
 * shadows on the mask; a cool fill and a soft hemisphere keep the dark side
 * readable; the drei Environment preset supplies reflections for the metal
 * finishes (ENIG, tin, gold, aluminium).
 *
 * The Environment preset is the ONE allowed external runtime asset; everything
 * else is local. If it throws (network/suspense error) the error boundary swaps
 * in FallbackLights so the scene is never unlit.
 */
import React, { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Environment } from "@react-three/drei";
import * as THREE from "three";
import { useStore } from "../store/useStore";
import { outlineBounds } from "./boardFeatures";
import { useExplodeSpring } from "./useExplodeSpring";

/** Frames to keep re-rendering shadows after anything moves (covers async texture/env loads). */
const SHADOW_SETTLE_FRAMES = 30;

/**
 * Shadows only change when the board, its parts, or the explode state change,
 * so the shadow map is re-rendered on those events instead of every frame.
 */
function ShadowScheduler(): null {
  const gl = useThree((s) => s.gl);
  const board = useStore((s) => s.board);
  const pending = useRef(SHADOW_SETTLE_FRAMES);
  const lastExplode = useRef(-1);

  useEffect(() => {
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
    return () => { gl.shadowMap.autoUpdate = true; };
  }, [gl]);
  useEffect(() => { pending.current = SHADOW_SETTLE_FRAMES; }, [board]);

  useExplodeSpring((f) => {
    if (Math.abs(f - lastExplode.current) > 1e-4) pending.current = Math.max(pending.current, 2);
    lastExplode.current = f;
  });
  useFrame(() => {
    if (pending.current <= 0) return;
    pending.current -= 1;
    gl.shadowMap.needsUpdate = true;
  });
  return null;
}

/** Deterministic local light rig — used as the offline fallback and always safe. */
export function FallbackLights(): React.ReactElement {
  return (
    <>
      <hemisphereLight args={["#c8d6e4", "#2a2016", 0.55]} position={[0, 0, 1]} />
      <directionalLight position={[-60, 40, 50]} intensity={0.35} color="#9db8d6" />
      <ambientLight intensity={0.08} />
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

/** Key light from front-right and above, shadow camera fitted to the board. */
function KeyLight({ center, radius }: { center: THREE.Vector3; radius: number }): React.ReactElement {
  const light = useRef<THREE.DirectionalLight>(null);
  useEffect(() => {
    const l = light.current;
    if (!l) return;
    l.target.position.copy(center);
    l.target.updateMatrixWorld();
    const cam = l.shadow.camera;
    cam.left = -radius; cam.right = radius; cam.top = radius; cam.bottom = -radius;
    cam.near = 1; cam.far = 400;
    cam.updateProjectionMatrix();
  }, [center, radius]);
  return (
    <directionalLight
      ref={light}
      position={[center.x + 45, center.y - 55, 110]}
      intensity={1.9}
      color="#fff6ea"
      castShadow
      shadow-mapSize={[2048, 2048]}
      shadow-bias={-0.0004}
      shadow-normalBias={0.02}
    />
  );
}

export default function Lighting(): React.ReactElement {
  const outline = useStore((s) => s.board?.outline);
  const boardId = useStore((s) => s.board?.id);
  const { center, radius } = useMemo(() => {
    const b = outlineBounds(outline ?? []);
    return {
      center: new THREE.Vector3(b.minX + b.width / 2, -(b.minY + b.height / 2), 0),
      radius: Math.max(20, Math.hypot(b.width, b.height) / 2 + 12),
    };
  }, [outline]);

  return (
    <>
      {/* A soft base light so the scene is lit even during Environment suspense. */}
      <FallbackLights />
      <KeyLight center={center} radius={radius} />
      <ShadowScheduler />

      <EnvironmentBoundary>
        <React.Suspense fallback={null}>
          <Environment preset="city" environmentIntensity={0.55} />
        </React.Suspense>
      </EnvironmentBoundary>

      {/* Soft occlusion under the board so it sits in space; baked once per board. */}
      <ContactShadows
        key={boardId ?? "none"}
        frames={1}
        position={[center.x, center.y, -9]}
        rotation={[Math.PI / 2, 0, 0]}
        opacity={0.55}
        scale={radius * 3}
        blur={2.6}
        far={14}
        resolution={512}
        color="#000000"
      />
    </>
  );
}

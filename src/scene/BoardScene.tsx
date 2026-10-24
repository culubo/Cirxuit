import React from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";
import Lighting from "./Lighting";
import SceneRoot from "./SceneRoot";
import CurrentParticles from "./CurrentParticles";
import { tokens } from "../ui/tokens";

/**
 * Root Canvas wrapper for the 3D scene.
 * Camera starts looking down at the board; drei Environment lights it (with a
 * local fallback rig). Bloom makes the current particles and LED glow bloom.
 */
export default function BoardScene(): React.ReactElement {
  return (
    <Canvas
      camera={{ position: [50, -50, 80], fov: 45, near: 0.1, far: 2000 }}
      style={{ width: "100%", height: "100%" }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
      onCreated={({ scene }) => { scene.background = new THREE.Color(tokens.bg); }}
      shadows
    >
      <Lighting />

      <OrbitControls makeDefault enableDamping dampingFactor={0.1} />

      <SceneRoot />
      <CurrentParticles />

      <EffectComposer>
        <Bloom
          intensity={0.9}
          luminanceThreshold={0.6}
          luminanceSmoothing={0.2}
          mipmapBlur
        />
      </EffectComposer>
    </Canvas>
  );
}

import React from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";
import Lighting from "./Lighting";
import SceneRoot from "./SceneRoot";
import CurrentParticles from "./CurrentParticles";
import AutoFitCamera from "./AutoFitCamera";
import { tokens } from "../ui/tokens";

/**
 * Root Canvas wrapper for the 3D scene.
 * Camera starts looking down at the board; drei Environment lights it (with a
 * local fallback rig). Bloom makes the current particles and LED glow bloom.
 */
export default function BoardScene(): React.ReactElement {
  return (
    <Canvas
      camera={{ position: [25, -60, 70], up: [0, 0, 1], fov: 40, near: 0.5, far: 2000 }}
      style={{ width: "100%", height: "100%" }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
      onCreated={({ scene }) => { scene.background = new THREE.Color(tokens.bg); }}
      shadows="percentage"
    >
      <Lighting />

      <OrbitControls makeDefault enableDamping dampingFactor={0.1} />
      <AutoFitCamera />

      <SceneRoot />
      <CurrentParticles />

      <EffectComposer>
        <Bloom
          intensity={0.9}
          luminanceThreshold={0.92}
          luminanceSmoothing={0.2}
          mipmapBlur
        />
      </EffectComposer>
    </Canvas>
  );
}

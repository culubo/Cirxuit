import React from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";
import Lighting from "./Lighting";
import SceneRoot from "./SceneRoot";
import CurrentParticles from "./CurrentParticles";
import AutoFitCamera from "./AutoFitCamera";
import RobotRig from "../robot/RobotRig";
import { tokens } from "../ui/tokens";

/** The workspace backdrop as a scene background, matching chrome.ts `backdrop`. */
function backdropTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
    g.addColorStop(0, tokens.bgTop);
    g.addColorStop(0.55, tokens.bg);
    g.addColorStop(1, tokens.bgBottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

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
      onCreated={({ scene }) => { scene.background = backdropTexture(); }}
      shadows="percentage"
    >
      <Lighting />

      <OrbitControls makeDefault enableDamping dampingFactor={0.1} />
      <AutoFitCamera />

      {/* In Robot view the board (with its particles) moves into the robot's chest. */}
      <RobotRig>
        <SceneRoot />
        <CurrentParticles />
      </RobotRig>

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

import React from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import SceneRoot from "./SceneRoot";

/**
 * Root Canvas wrapper for the 3D scene.
 * Camera starts looking straight down (-Z direction) at the board centre.
 */
export default function BoardScene(): React.ReactElement {
  return (
    <Canvas
      camera={{ position: [50, -50, 80], fov: 45, near: 0.1, far: 2000 }}
      style={{ width: "100%", height: "100%" }}
      gl={{ antialias: true }}
    >
      {/* Lighting — minimal for now, polish is out of scope */}
      <ambientLight intensity={0.6} />
      <directionalLight position={[100, -100, 150]} intensity={1.2} castShadow={false} />
      <directionalLight position={[-80, 80, 100]} intensity={0.4} />

      <OrbitControls makeDefault enableDamping dampingFactor={0.1} />

      <SceneRoot />
    </Canvas>
  );
}

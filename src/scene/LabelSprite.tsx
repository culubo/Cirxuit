/**
 * LabelSprite — a constant-size text label drawn into a canvas texture and
 * shown as a camera-facing sprite. Used instead of DOM overlays so labels live
 * entirely in the WebGL scene (no extra React roots, no font downloads).
 */
import React, { forwardRef, useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { tokens } from "../ui/tokens";

interface LabelSpriteProps {
  text: string;
  detail?: string;
  color: string;
  position: [number, number, number] | THREE.Vector3;
  /** Draw a hairline rule on the side facing the object, like an instrument callout. */
  rule?: boolean;
  /** Which end of the label sits at `position`. */
  anchor?: "left" | "right";
  /** Text height on screen, CSS px. */
  sizePx?: number;
}

const PAD = 6;

const LabelSprite = forwardRef<THREE.Sprite, LabelSpriteProps>(function LabelSprite(
  { text, detail, color, position, rule = false, anchor = "left", sizePx = 11 },
  ref,
) {
  const viewportHeight = useThree((s) => s.size.height);
  const fov = useThree((s) => (s.camera as THREE.PerspectiveCamera).fov ?? 45);

  const { material, aspect, heightPx } = useMemo(() => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const font = `${sizePx * dpr}px ${tokens.fontMono}`;
    const probe = document.createElement("canvas").getContext("2d");
    if (probe) probe.font = font;
    const gap = detail ? sizePx * 0.6 * dpr : 0;
    const mainW = probe?.measureText(text).width ?? text.length * sizePx * 0.6 * dpr;
    const detailW = detail ? (probe?.measureText(detail).width ?? 0) : 0;
    const w = Math.ceil(mainW + gap + detailW + PAD * 2 * dpr);
    const h = Math.ceil(sizePx * 1.45 * dpr);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.font = font;
      ctx.textBaseline = "middle";
      // Dark backing keeps the text legible over light films and bright copper.
      ctx.globalAlpha = 0.78;
      ctx.fillStyle = tokens.bg;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
      if (rule) {
        ctx.fillStyle = tokens.textFaint;
        ctx.fillRect(anchor === "left" ? 0 : w - Math.max(1, dpr), 0, Math.max(1, dpr), h);
      }
      ctx.fillStyle = color;
      ctx.fillText(text, PAD * dpr, h / 2);
      if (detail) {
        ctx.fillStyle = tokens.textFaint;
        ctx.fillText(detail, PAD * dpr + mainW + gap, h / 2);
      }
    }
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.minFilter = THREE.LinearFilter;
    map.generateMipmaps = false;
    const mat = new THREE.SpriteMaterial({
      map,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      sizeAttenuation: false,
      toneMapped: false,
    });
    return { material: mat, aspect: w / h, heightPx: h / dpr };
  }, [text, detail, color, rule, anchor, sizePx]);
  useEffect(() => () => { material.map?.dispose(); material.dispose(); }, [material]);

  // With sizeAttenuation off, a sprite of scale s spans s / (2·tan(fov/2)) of the view height.
  const scaleY = (heightPx / Math.max(1, viewportHeight)) * 2 * Math.tan((fov * Math.PI) / 360);

  return (
    <sprite
      ref={ref}
      material={material}
      position={position}
      scale={[scaleY * aspect, scaleY, 1]}
      center={new THREE.Vector2(anchor === "left" ? 0 : 1, 0.5)}
      renderOrder={10}
      raycast={() => null}
    />
  );
});

export default LabelSprite;

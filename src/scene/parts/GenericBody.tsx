/**
 * GenericBody — fallback for a footprint with no dedicated model: a plain
 * moulded block at the part's `body` dimensions.
 */
import React, { useEffect, useMemo } from "react";
import { draftedBlock } from "./geometry";
import type { FamilyProps } from "./types";

export default function GenericBody({ part, kit }: FamilyProps): React.ReactElement {
  const geometry = useMemo(() => draftedBlock(part.body.w, part.body.h, part.body.height, 0.06, 0.05), [part.body]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} material={kit.get("epoxy")} castShadow receiveShadow />;
}

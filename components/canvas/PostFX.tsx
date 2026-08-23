"use client";

import { useEffect, useMemo } from "react";
import { HalfFloatType } from "three";
import { BlendFunction, ToneMappingMode } from "postprocessing";
import {
  Bloom,
  EffectComposer,
  N8AO,
  Noise,
  SMAA,
  ToneMapping,
  Vignette,
} from "@react-three/postprocessing";
import { SCENE } from "@/lib/palette";
import { PastelGradeEffect } from "./PastelGradeEffect";

/**
 * The scene's post chain, tuned to land the world in the same register as the
 * surrounding interface.
 *
 * Order is the whole trick, and it is the order the children appear in:
 *
 *  1. N8AO      — soft occlusion in the corners, tinted indigo rather than
 *                 black, which is what gives flat pastel volumes their weight.
 *  2. Bloom     — reads the HDR buffer, so it has to come before tone mapping.
 *                 Only the brightest things in the frame (the gold stars, the
 *                 sun side of a white wall) are allowed to bleed.
 *  3. ToneMapping — Khronos PBR Neutral. Unlike ACES it barely touches hue,
 *                 which matters when the point is that the greens and pinks
 *                 stay the interface's greens and pinks.
 *  4. Vignette  — before the grade, so the grade tints its falloff instead of
 *                 leaving a grey ring.
 *  5. PastelGrade — the split tone. See PastelGradeEffect.
 *  6. Noise     — the plaster grain the reference art has, at the threshold of
 *                 visibility.
 *  7. SMAA      — last, and the reason multisampling is off: N8AO renders the
 *                 scene itself, so composer-level MSAA has nothing to do with
 *                 what it hands on.
 */
export function PostFX() {
  const grade = useMemo(
    () =>
      new PastelGradeEffect({
        shadowTint: SCENE.gradeShadow,
        highlightTint: SCENE.gradeHighlight,
        liftColor: SCENE.occlusion,
      }),
    [],
  );

  useEffect(() => () => grade.dispose(), [grade]);

  return (
    <EffectComposer multisampling={0} frameBufferType={HalfFloatType}>
      <N8AO
        color={SCENE.occlusion}
        aoRadius={2.4}
        distanceFalloff={1.1}
        intensity={1.9}
        quality="performance"
        halfRes
        depthAwareUpsampling
      />
      <Bloom
        mipmapBlur
        intensity={0.5}
        radius={0.82}
        luminanceThreshold={0.62}
        luminanceSmoothing={0.28}
      />
      <ToneMapping mode={ToneMappingMode.NEUTRAL} />
      <Vignette offset={0.3} darkness={0.4} />
      <primitive object={grade} />
      <Noise premultiply blendFunction={BlendFunction.OVERLAY} opacity={0.06} />
      <SMAA />
    </EffectComposer>
  );
}

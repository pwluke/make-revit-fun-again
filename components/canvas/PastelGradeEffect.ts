import { BlendFunction, Effect } from "postprocessing";
import { Color, LinearSRGBColorSpace, Uniform } from "three";

/**
 * Split-tone grade. This is the pass that does most of the work of making the
 * scene look like the interface: it raises the black floor to a dim
 * periwinkle, pulls contrast in toward the midtones, and then rotates shade
 * toward periwinkle and light toward blush. Reference art of this kind has no
 * black and no blown white in it — everything lives in the middle of the
 * range, two-toned — and that is a grade, not a lighting rig.
 */
const fragmentShader = /* glsl */ `
uniform vec3 shadowTint;
uniform vec3 highlightTint;
uniform vec3 liftColor;
uniform float strength;
uniform float lift;
uniform float softness;
uniform float saturation;
uniform float pivot;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  // The composer's buffer is linear, but a colour grade only behaves the way
  // it reads if its constants act on roughly perceptual values. Step into a
  // gamma-encoded space for the duration and step back out at the end; the
  // tint uniforms are supplied in that same space.
  vec3 c = pow(max(inputColor.rgb, vec3(0.0)), vec3(1.0 / 2.2));

  // Lift the floor, and only the floor — weighted to the darks so the rest of
  // the frame is left alone.
  float shade = 1.0 - smoothstep(0.0, 0.5, dot(c, LUMA));
  c = mix(c, liftColor, lift * shade);

  // Draw contrast in toward the pivot: no crushed shade, no blown highlight.
  c = mix(vec3(pivot), c, 1.0 - softness);

  // Split tone. Renormalising the tint to unit luminance means multiplying by
  // it rotates hue without changing exposure, so the frame drifts two-toned
  // instead of merely getting darker or brighter.
  float l = clamp(dot(c, LUMA), 0.0, 1.0);
  vec3 tint = mix(shadowTint, highlightTint, smoothstep(0.15, 0.9, l));
  vec3 unit = tint / max(dot(tint, LUMA), 1e-4);
  c = mix(c, c * unit, strength);

  // The pull toward the pivot flattens saturation as a side effect. Put a
  // little back, so the pastels read as creamy rather than as grey.
  c = mix(vec3(dot(c, LUMA)), c, saturation);

  outputColor = vec4(pow(clamp(c, 0.0, 1.0), vec3(2.2)), inputColor.a);
}
`;

export type PastelGradeOptions = {
  /** Where shade is pulled. */
  shadowTint?: string;
  /** Where light is pulled. */
  highlightTint?: string;
  /** What the darkest value in the frame becomes. */
  liftColor?: string;
  /** How far to travel toward the split tone, 0-1. */
  strength?: number;
  /** How far the black floor is raised, 0-1. */
  lift?: number;
  /** How much contrast is drawn in toward `pivot`, 0-1. */
  softness?: number;
  /** Saturation multiplier applied after the tone. 1 leaves it alone. */
  saturation?: number;
  /** The value contrast collapses toward, in gamma space. */
  pivot?: number;
};

/**
 * The shader grades in a gamma-encoded space, so its tint uniforms have to be
 * the authored channel values rather than the linearised ones three would
 * normally hand it. Declaring the source space as linear makes the working-space
 * conversion a no-op, which is exactly what that means.
 */
function authoredColor(hex: string) {
  return new Color().setStyle(hex, LinearSRGBColorSpace);
}

export class PastelGradeEffect extends Effect {
  constructor({
    // Defaults are the resolved SCENE.grade* / PASTEL.indigo values, so the
    // effect stands on its own if it is ever mounted without options.
    shadowTint = "#9b9dec",
    highlightTint = "#f8c5d1",
    liftColor = "#43469b",
    strength = 0.38,
    lift = 0.16,
    softness = 0.12,
    saturation = 1.08,
    pivot = 0.52,
  }: PastelGradeOptions = {}) {
    super("PastelGradeEffect", fragmentShader, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, Uniform>([
        ["shadowTint", new Uniform(authoredColor(shadowTint))],
        ["highlightTint", new Uniform(authoredColor(highlightTint))],
        ["liftColor", new Uniform(authoredColor(liftColor))],
        ["strength", new Uniform(strength)],
        ["lift", new Uniform(lift)],
        ["softness", new Uniform(softness)],
        ["saturation", new Uniform(saturation)],
        ["pivot", new Uniform(pivot)],
      ]),
    });
  }

  private color(name: string) {
    return this.uniforms.get(name)!.value as Color;
  }

  private scalar(name: string) {
    return this.uniforms.get(name)! as Uniform<number>;
  }

  get shadowTint() {
    return this.color("shadowTint");
  }
  set shadowTint(value: Color | string) {
    if (typeof value === "string") this.color("shadowTint").copy(authoredColor(value));
    else this.color("shadowTint").copy(value);
  }

  get highlightTint() {
    return this.color("highlightTint");
  }
  set highlightTint(value: Color | string) {
    if (typeof value === "string")
      this.color("highlightTint").copy(authoredColor(value));
    else this.color("highlightTint").copy(value);
  }

  get liftColor() {
    return this.color("liftColor");
  }
  set liftColor(value: Color | string) {
    if (typeof value === "string") this.color("liftColor").copy(authoredColor(value));
    else this.color("liftColor").copy(value);
  }

  get strength() {
    return this.scalar("strength").value;
  }
  set strength(value: number) {
    this.scalar("strength").value = value;
  }

  get lift() {
    return this.scalar("lift").value;
  }
  set lift(value: number) {
    this.scalar("lift").value = value;
  }

  get softness() {
    return this.scalar("softness").value;
  }
  set softness(value: number) {
    this.scalar("softness").value = value;
  }

  get saturation() {
    return this.scalar("saturation").value;
  }
  set saturation(value: number) {
    this.scalar("saturation").value = value;
  }

  get pivot() {
    return this.scalar("pivot").value;
  }
  set pivot(value: number) {
    this.scalar("pivot").value = value;
  }
}

/**
 * Film-grain overlay (DESIGN §3 #7) as SkSL for a Skia RuntimeEffect.
 * `uSeed` advances once per grain frame; `uOpacity` is `texture.grainOpacity`.
 * The hash constants are the standard `fract(sin(dot(...)))` noise, not tokens.
 */
export const GRAIN_SHADER = `
uniform float uSeed;
uniform float uOpacity;

float hash(float2 p) {
  return fract(sin(dot(p, float2(12.9898, 78.233))) * 43758.5453);
}

half4 main(float2 xy) {
  float n = hash(floor(xy) + float2(uSeed * 17.0, uSeed * 31.0));
  half a = half(uOpacity);
  return half4(half3(n) * a, a);
}
`;

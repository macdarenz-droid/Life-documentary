/**
 * @jest-environment @shopify/react-native-skia/jestEnv.js
 */
import { GRAIN_SHADER } from './grainShader';

type CanvasKitRuntime = {
  RuntimeEffect: {
    Make(sksl: string, onError?: (message: string) => void): { getUniformCount(): number } | null;
  };
};

describe('GRAIN_SHADER', () => {
  it('compiles as a Skia RuntimeEffect', () => {
    // Skia's Jest mock is backed by CanvasKit (real Skia compiled to wasm), so this compiles the SkSL.
    const { Skia } = jest
      .requireActual<{
        Mock: (canvasKit: unknown) => {
          Skia: { RuntimeEffect: { Make(sksl: string): { getUniformCount(): number } | null } };
        };
      }>('@shopify/react-native-skia/lib/commonjs/mock')
      .Mock((globalThis as unknown as { CanvasKit: CanvasKitRuntime }).CanvasKit);
    const errors: string[] = [];
    const direct = (
      globalThis as unknown as { CanvasKit: CanvasKitRuntime }
    ).CanvasKit.RuntimeEffect.Make(GRAIN_SHADER, (message) => errors.push(message));
    expect(errors).toEqual([]);
    expect(direct).not.toBeNull();
    const effect = Skia.RuntimeEffect.Make(GRAIN_SHADER);
    expect(effect).not.toBeNull();
    expect(effect?.getUniformCount()).toBe(2);
  });
});

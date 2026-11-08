// Format checks used by the build-time (precompiled) JSON Schema validators.
// The hosted page's Content-Security-Policy forbids `eval`/`new Function`,
// so schemas are compiled ahead of time by scripts/build-validators.mjs and
// these plain functions are imported by the generated code instead.
import { fullFormats } from "ajv-formats/dist/formats";

const uint = (bits: number) => ({
  type: "string" as const,
  validate: (s: string) =>
    /^(0|[1-9]\d*)$/.test(s) && s.length <= 78 && BigInt(s) < 2n ** BigInt(bits),
});

export const formats: Record<string, unknown> = {
  ...fullFormats,
  "uint64-decimal": uint(64),
  "uint96-decimal": uint(96),
  "uint256-decimal": uint(256),
};

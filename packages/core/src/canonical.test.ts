import { describe, expect, it } from "vitest";

import { canonicalJson, canonicalJsonDigest } from "./canonical.js";

describe("canonical JSON", () => {
  it("sorts by Unicode code point without locale collation", () => {
    const input = { z: 1, ä: 2, a: { _z: 1, aa: 2 } };

    expect(canonicalJson(input)).toBe('{"a":{"_z":1,"aa":2},"z":1,"ä":2}');
    expect(canonicalJsonDigest(input)).toMatch(/^sha256:[a-f0-9]{64}$/u);
  });
});

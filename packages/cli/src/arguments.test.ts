import { describe, expect, it } from "vitest";

import { integerOption, parseArguments } from "./arguments.js";

describe("CLI argument parsing", () => {
  it("supports inline values and values beginning with a dash", () => {
    const parsed = parseArguments(
      ["--root=--fixture", "--compact", "project"],
      ["--root"],
    );
    expect(parsed.options.get("--root")).toBe("--fixture");
    expect(parsed.compact).toBe(true);
    expect(parsed.positionals).toEqual(["project"]);
  });

  it("reports a missing value before path resolution", () => {
    expect(() => parseArguments(["--root", "--compact"], ["--root"])).toThrow(
      "--root requires a value",
    );
  });

  it("rejects duplicate and unknown options", () => {
    expect(() => parseArguments(["--root=a", "--root=b"], ["--root"])).toThrow(
      "--root may be provided only once",
    );
    expect(() => parseArguments(["--verbose"], [])).toThrow(
      "Unknown option: --verbose",
    );
  });

  it.each(["5.7", "15min", "1e2", "0", "61"])(
    "rejects invalid integer TTL %s",
    (value) => {
      expect(() =>
        integerOption(new Map([["--ttl", value]]), "--ttl", 15, 1, 60),
      ).toThrow("--ttl must be an integer from 1 to 60");
    },
  );
});

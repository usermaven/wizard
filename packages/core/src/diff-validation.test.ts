import { describe, expect, it } from "vitest";

import { validateSingleFileUnifiedDiff } from "./diff-validation.js";

describe("unified diff validation", () => {
  it("ignores hunk-body lines that resemble file headers", () => {
    const diff = `--- a/src/query.sql
+++ b/src/query.sql
@@ -1,2 +1,2 @@
--- old SQL comment
+++ new SQL comment
 SELECT 1;
`;

    expect(() =>
      validateSingleFileUnifiedDiff(diff, "src/query.sql"),
    ).not.toThrow();
  });

  it("rejects a second file header before the first hunk", () => {
    const diff = `--- a/src/one.ts
+++ b/src/one.ts
--- a/src/two.ts
+++ b/src/two.ts
@@ -1 +1 @@
-one
+two
`;
    expect(() => validateSingleFileUnifiedDiff(diff, "src/one.ts")).toThrow(
      "operation target",
    );
  });
});

export function validateSingleFileUnifiedDiff(
  diff: string,
  expectedPath: string,
): void {
  if (
    /^(?:diff --git|rename (?:from|to)|copy (?:from|to)|GIT binary patch)/mu.test(
      diff,
    )
  )
    throw new Error("Only a single-file textual unified diff is supported");
  const firstHunk = diff.search(/^@@/mu);
  if (firstHunk < 0) throw new Error("Unified diff must contain a hunk");
  const header = diff.slice(0, firstHunk);
  const paths = [...header.matchAll(/^(?:---|\+\+\+)\s+([^\t\n]+)/gmu)].map(
    (match) => match[1],
  );
  const accepted = new Set([
    expectedPath,
    `a/${expectedPath}`,
    `b/${expectedPath}`,
  ]);
  if (
    paths.length !== 2 ||
    paths.some((path) => path !== "/dev/null" && !accepted.has(path!))
  )
    throw new Error("Unified diff path does not match its operation target");
}

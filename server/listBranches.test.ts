import { describe, expect, it } from "vitest";
import { parseBranchRefs } from "./listBranches";

describe("parseBranchRefs", () => {
  it("includes both local and remote branches", () => {
    const stdout = "refs/heads/main\nrefs/remotes/origin/derek/eng-1\n";
    expect(parseBranchRefs(stdout)).toEqual([
      { name: "main", ref: "refs/heads/main" },
      { name: "derek/eng-1", ref: "refs/remotes/origin/derek/eng-1" },
    ]);
  });

  it("dedupes a branch that exists both locally and on origin, keeping whichever is more recent", () => {
    const stdout = "refs/heads/main\nrefs/remotes/origin/main\n";
    expect(parseBranchRefs(stdout)).toEqual([{ name: "main", ref: "refs/heads/main" }]);
  });

  it("drops origin/HEAD", () => {
    const stdout = "refs/remotes/origin/HEAD\nrefs/remotes/origin/main\n";
    expect(parseBranchRefs(stdout)).toEqual([{ name: "main", ref: "refs/remotes/origin/main" }]);
  });

  it("returns an empty list for blank output", () => {
    expect(parseBranchRefs("")).toEqual([]);
  });
});

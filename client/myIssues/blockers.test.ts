import { describe, expect, it } from "vitest";
import type { Blocker, IssueSummary } from "../../shared/types";
import { blockerToIssue, nestedIssues } from "./blockers";

const blocker: Blocker = {
  id: "b1",
  identifier: "ENG-2",
  title: "Blocker",
  url: "https://linear.app/x/ENG-2",
  branchName: "derek/eng-2",
  status: "Todo",
  stateType: "unstarted",
};

function issue(overrides: Partial<IssueSummary>): IssueSummary {
  return {
    id: "1",
    identifier: "ENG-1",
    title: "Parent",
    status: "Todo",
    labels: [],
    blocks: [],
    blockedBy: [],
    url: "https://linear.app/x/ENG-1",
    text: "",
    resourceType: "issue",
    branchName: "b",
    prs: [],
    ...overrides,
  };
}

describe("blockerToIssue", () => {
  it("builds a minimal ticket for a blocker that isn't on the board", () => {
    const stub = blockerToIssue(blocker, []);
    expect(stub).toMatchObject({ id: "b1", branchName: "derek/eng-2", status: "Todo", prs: [] });
    expect(stub.text).toContain("ENG-2: Blocker");
  });

  it("prefers the full ticket when the blocker is on the board", () => {
    const full = issue({ id: "b1", identifier: "ENG-2", prs: [{ number: 5, url: "https://github.com/a/b/pull/5", state: "open" }] });
    expect(blockerToIssue(blocker, [full])).toBe(full);
  });
});

describe("nestedIssues", () => {
  it("returns each off-board blocker once", () => {
    const issues = [issue({ id: "1", blockedBy: [blocker] }), issue({ id: "2", blocks: [blocker] })];
    expect(nestedIssues(issues).map((item) => item.id)).toEqual(["b1"]);
  });

  it("skips blockers that are already on the board", () => {
    const issues = [issue({ id: "1", blockedBy: [blocker] }), issue({ id: "b1" })];
    expect(nestedIssues(issues)).toEqual([]);
  });
});

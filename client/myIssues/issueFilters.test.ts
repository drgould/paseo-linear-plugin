import { describe, expect, it } from "vitest";
import type { IssueSummary } from "../../shared/types";
import { filterIssues, sortIssues, statusCounts } from "./issueFilters";

function issue(overrides: Partial<IssueSummary>): IssueSummary {
  return {
    id: "1",
    identifier: "ENG-1",
    title: "Title",
    status: "Todo",
    labels: [],
    blocks: [],
    blockedBy: [],
    url: "https://linear.app/x",
    text: "",
    resourceType: "issue",
    branchName: "b",
    prs: [],
    ...overrides,
  };
}

describe("filterIssues", () => {
  const issues = [
    issue({ id: "1", identifier: "ENG-1", title: "Fix login", labels: ["Bug"] }),
    issue({ id: "2", identifier: "ENG-22", title: "Add kanban", project: "Paseo", status: "In Progress" }),
  ];

  it("matches identifier, title, project, status and labels case-insensitively", () => {
    const ids = (query: string) => filterIssues(issues, { query, status: null }).map((i) => i.id);
    expect(ids("eng-22")).toEqual(["2"]);
    expect(ids("LOGIN")).toEqual(["1"]);
    expect(ids("paseo")).toEqual(["2"]);
    expect(ids("in progress")).toEqual(["2"]);
    expect(ids("bug")).toEqual(["1"]);
    expect(ids("  ")).toEqual(["1", "2"]);
  });

  it("restricts to one status", () => {
    expect(filterIssues(issues, { query: "", status: "Todo" }).map((i) => i.id)).toEqual(["1"]);
  });
});

describe("sortIssues", () => {
  it("sorts by update time, newest first, with missing values last either way", () => {
    const issues = [
      issue({ id: "none" }),
      issue({ id: "old", updatedAt: "2026-01-01T00:00:00Z" }),
      issue({ id: "new", updatedAt: "2026-02-01T00:00:00Z" }),
    ];
    expect(sortIssues(issues, { field: "updated", direction: "newest" }).map((i) => i.id)).toEqual(["new", "old", "none"]);
    expect(sortIssues(issues, { field: "updated", direction: "oldest" }).map((i) => i.id)).toEqual(["old", "new", "none"]);
  });

  it("sorts priority highest first for newest, no priority last", () => {
    const issues = [
      issue({ id: "low", priority: "Low" }),
      issue({ id: "none", priority: "No priority" }),
      issue({ id: "urgent", priority: "Urgent" }),
      issue({ id: "high", priority: "High" }),
    ];
    expect(sortIssues(issues, { field: "priority", direction: "newest" }).map((i) => i.id)).toEqual([
      "urgent",
      "high",
      "low",
      "none",
    ]);
    expect(sortIssues(issues, { field: "priority", direction: "oldest" }).map((i) => i.id)).toEqual([
      "low",
      "high",
      "urgent",
      "none",
    ]);
  });
});

describe("statusCounts", () => {
  it("counts issues per status", () => {
    const counts = statusCounts([issue({ status: "Todo" }), issue({ status: "Todo" }), issue({ status: "Done" })]);
    expect(Object.fromEntries(counts)).toEqual({ Todo: 2, Done: 1 });
  });
});

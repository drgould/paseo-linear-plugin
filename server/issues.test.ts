import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LinearIssue } from "../shared/types";

const myIssuesMock = vi.fn();
const searchMock = vi.fn();

vi.mock("./linear", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./linear")>();
  return {
    ...actual,
    createLinearClient: () => ({
      myIssues: myIssuesMock,
      search: searchMock,
      findExact: vi.fn(),
      searchTitles: vi.fn(),
      getIssue: vi.fn(),
    }),
  };
});
vi.mock("./settings", () => ({ getApiKey: async () => "lin_api_test" }));

const { searchIssues } = await import("./issues");

function makeIssue(id: string, statusName: string): LinearIssue {
  return {
    id,
    identifier: id,
    title: `Issue ${id}`,
    description: null,
    url: `https://linear.app/acme/issue/${id}`,
    branchName: `derek/${id}`,
    priorityLabel: "Medium",
    state: { name: statusName, type: "started" },
    assignee: null,
    project: null,
    labels: { nodes: [] },
    attachments: { nodes: [] },
  };
}

describe("searchIssues", () => {
  beforeEach(() => {
    myIssuesMock.mockReset();
    searchMock.mockReset();
  });

  it("with no query, shows only the viewer's issues ranked todo > backlog > in progress", async () => {
    // Already updatedAt-desc from Linear: in-progress-1 newer than in-progress-2, etc.
    myIssuesMock.mockResolvedValue([
      makeIssue("ENG-1", "In Progress"),
      makeIssue("ENG-2", "Backlog"),
      makeIssue("ENG-3", "Todo"),
      makeIssue("ENG-4", "In Progress"),
      makeIssue("ENG-5", "Weird Custom Status"),
    ]);

    const result = await searchIssues({ query: "" });

    expect(result.items.map((item) => item.identifier)).toEqual(["ENG-3", "ENG-2", "ENG-1", "ENG-4", "ENG-5"]);
    expect(searchMock).not.toHaveBeenCalled();
  });

  it("with a query, searches everything unranked and unfiltered by assignee", async () => {
    searchMock.mockResolvedValue([makeIssue("ENG-9", "Done")]);

    const result = await searchIssues({ query: "  eng-9  " });

    expect(searchMock).toHaveBeenCalledWith("eng-9");
    expect(myIssuesMock).not.toHaveBeenCalled();
    expect(result.items.map((item) => item.identifier)).toEqual(["ENG-9"]);
  });
});

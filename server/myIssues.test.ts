import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toIssueSummary } from "./linear";
import { listMyIssues } from "./myIssues";
import type { LinearIssue } from "../shared/types";

const issue: LinearIssue = {
  id: "issue-uuid",
  identifier: "ENG-123",
  title: "Plugin attachments",
  description: "Let extensions attach external context.",
  url: "https://linear.app/acme/issue/ENG-123/plugin-attachments",
  branchName: "derek/eng-123-plugin-attachments",
  priorityLabel: "High",
  state: { name: "In Progress" },
  assignee: { name: "Mohamed" },
  project: { name: "Paseo" },
  labels: { nodes: [{ name: "Feature" }] },
};

describe("listMyIssues", () => {
  const originalApiKey = process.env.LINEAR_API_KEY;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.LINEAR_API_KEY = "lin_api_test";
  });

  afterEach(() => {
    process.env.LINEAR_API_KEY = originalApiKey;
    global.fetch = originalFetch;
  });

  it("maps the viewer's assigned issues through toIssueSummary", async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: { viewer: { assignedIssues: { nodes: [issue] } } } }),
    })) as unknown as typeof fetch;

    const result = await listMyIssues({});

    expect(result).toEqual({ items: [toIssueSummary(issue)] });
  });
});

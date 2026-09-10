import { afterEach, describe, expect, it, vi } from "vitest";
import type { LinearIssue } from "../shared/types";
import { getIssueDetail } from "./issueDetail";

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

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("getIssueDetail", () => {
  const originalApiKey = process.env.LINEAR_API_KEY;
  const originalFetch = global.fetch;

  afterEach(() => {
    process.env.LINEAR_API_KEY = originalApiKey;
    global.fetch = originalFetch;
  });

  it("maps the Linear issue to the panel's issue detail shape", async () => {
    process.env.LINEAR_API_KEY = "lin_api_test";
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ data: { issue } }));

    await expect(getIssueDetail({ id: "ENG-123" })).resolves.toEqual({
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      url: issue.url,
      branchName: issue.branchName,
      status: issue.state.name,
      assignee: issue.assignee?.name ?? null,
      project: issue.project?.name ?? null,
      labels: issue.labels.nodes.map((label) => label.name),
    });
  });

  it("returns null when Linear has no matching issue", async () => {
    process.env.LINEAR_API_KEY = "lin_api_test";
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ data: { issue: null } }));

    await expect(getIssueDetail({ id: "ENG-999" })).resolves.toBeNull();
  });
});

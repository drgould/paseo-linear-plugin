import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  state: { name: "In Progress", type: "started" },
  assignee: { name: "Mohamed" },
  project: { name: "Paseo" },
  labels: { nodes: [{ name: "Feature" }] },
  attachments: { nodes: [] },
};

describe("listMyIssues", () => {
  const originalApiKey = process.env.LINEAR_API_KEY;
  const originalPaseoHome = process.env.PASEO_HOME;
  const originalFetch = global.fetch;
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(join(tmpdir(), "paseo-linear-myissues-"));
    process.env.PASEO_HOME = dir;
    process.env.LINEAR_API_KEY = "lin_api_test";
  });

  afterEach(async () => {
    if (originalPaseoHome === undefined) delete process.env.PASEO_HOME;
    else process.env.PASEO_HOME = originalPaseoHome;
    process.env.LINEAR_API_KEY = originalApiKey;
    global.fetch = originalFetch;
    await fs.rm(dir, { recursive: true, force: true });
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

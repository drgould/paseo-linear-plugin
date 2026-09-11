import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { createLinearClient, toIssueDetail, toIssueSummary } from "./linear";
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

interface CapturedRequest {
  authorization: string | undefined;
  body: { query: string; variables: Record<string, unknown> };
}

async function readRequest(request: IncomingMessage): Promise<CapturedRequest> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return {
    authorization: request.headers.authorization,
    body: JSON.parse(Buffer.concat(chunks).toString("utf8")) as CapturedRequest["body"],
  };
}

async function withLinearServer<T>(
  respond: (request: CapturedRequest, response: ServerResponse) => void,
  run: (endpoint: string) => Promise<T>,
): Promise<T> {
  const server = createServer((request, response) => {
    void readRequest(request).then((captured) => respond(captured, response));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  try {
    return await run(`http://127.0.0.1:${address.port}/graphql`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}

function sendJson(response: ServerResponse, body: unknown): void {
  response.writeHead(200, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

describe("createLinearClient", () => {
  it("resolves an exact issue identifier", async () => {
    const result = await withLinearServer(
      (request, response) => {
        expect(request.authorization).toBe("lin_api_test");
        expect(request.body.variables).toEqual({ id: "ENG-123" });
        sendJson(response, { data: { issue } });
      },
      async (endpoint) => {
        const linear = createLinearClient({ apiKey: "lin_api_test", endpoint });
        return linear.search("eng-123");
      },
    );

    expect(result).toEqual([issue]);
  });

  it("searches issue titles through a case-insensitive filter", async () => {
    const result = await withLinearServer(
      (request, response) => {
        expect(request.body.variables).toEqual({
          filter: { title: { containsIgnoreCase: "plugin" } },
        });
        sendJson(response, { data: { issues: { nodes: [issue] } } });
      },
      async (endpoint) => {
        const linear = createLinearClient({ apiKey: "lin_api_test", endpoint });
        return linear.search(" plugin ");
      },
    );

    expect(result.map((item) => item.identifier)).toEqual(["ENG-123"]);
  });

  it("lists the viewer's assigned issues", async () => {
    const result = await withLinearServer(
      (_request, response) => sendJson(response, { data: { viewer: { assignedIssues: { nodes: [issue] } } } }),
      async (endpoint) => {
        const linear = createLinearClient({ apiKey: "lin_api_test", endpoint });
        return linear.myIssues();
      },
    );

    expect(result).toEqual([issue]);
  });

  it("returns null from getIssue when Linear has no match", async () => {
    const result = await withLinearServer(
      (_request, response) => sendJson(response, { data: { issue: null } }),
      async (endpoint) => {
        const linear = createLinearClient({ apiKey: "lin_api_test", endpoint });
        return linear.getIssue("ENG-999");
      },
    );

    expect(result).toBeNull();
  });

  it("surfaces GraphQL errors even when HTTP succeeds", async () => {
    await expect(
      withLinearServer(
        (_request, response) => sendJson(response, { errors: [{ message: "Token expired" }] }),
        async (endpoint) => {
          const linear = createLinearClient({ apiKey: "lin_api_test", endpoint });
          return linear.search("ENG-123");
        },
      ),
    ).rejects.toThrow("Token expired");
  });

  it("requires a daemon-side API key", () => {
    expect(() => createLinearClient({ apiKey: "" })).toThrow("Set LINEAR_API_KEY in the daemon environment");
  });
});

describe("toIssueSummary", () => {
  it("formats the subtitle and agent-facing text snapshot", () => {
    expect(toIssueSummary(issue)).toEqual({
      id: "issue-uuid",
      identifier: "ENG-123",
      title: "Plugin attachments",
      subtitle: "◐ In Progress",
      status: "In Progress",
      url: issue.url,
      resourceType: "issue",
      branchName: issue.branchName,
      prs: [],
      text: [
        "Linear issue ENG-123: Plugin attachments",
        `URL: ${issue.url}`,
        "Status: In Progress",
        "Priority: High",
        "Assignee: Mohamed",
        "Project: Paseo",
        "Labels: Feature",
        "",
        "Let extensions attach external context.",
      ].join("\n"),
    });
  });

  it("omits the subtitle when there is no state name", () => {
    const bare: LinearIssue = { ...issue, state: { name: "", type: "" } };
    expect(toIssueSummary(bare).subtitle).toBeUndefined();
  });

  it("reads the linked PR off Linear's own github attachment metadata", () => {
    const withPr: LinearIssue = {
      ...issue,
      attachments: {
        nodes: [
          {
            sourceType: "githubCommit",
            metadata: { number: 999, url: "https://github.com/acme/repo/commit/abc", status: "open" },
          },
          {
            sourceType: "github",
            metadata: { number: 42, url: "https://github.com/acme/repo/pull/42", status: "draft" },
          },
        ],
      },
    };
    expect(toIssueSummary(withPr).prs).toEqual([
      { number: 42, url: "https://github.com/acme/repo/pull/42", state: "draft" },
    ]);
  });

  it("collects every linked PR when an issue has more than one", () => {
    const withMultiplePrs: LinearIssue = {
      ...issue,
      attachments: {
        nodes: [
          {
            sourceType: "github",
            metadata: { number: 42, url: "https://github.com/acme/repo/pull/42", status: "open" },
          },
          {
            sourceType: "github",
            metadata: { number: 43, url: "https://github.com/acme/repo/pull/43", status: "merged" },
          },
        ],
      },
    };
    expect(toIssueSummary(withMultiplePrs).prs).toEqual([
      { number: 42, url: "https://github.com/acme/repo/pull/42", state: "open" },
      { number: 43, url: "https://github.com/acme/repo/pull/43", state: "merged" },
    ]);
  });

  it("treats a review-state status Linear's GitHub integration sends (e.g. inReview) as open", () => {
    const withReviewState: LinearIssue = {
      ...issue,
      attachments: {
        nodes: [
          {
            sourceType: "github",
            metadata: {
              number: 1618,
              url: "https://github.com/acme/repo/pull/1618",
              status: "inReview",
              draft: false,
              mergedAt: null,
              closedAt: null,
            },
          },
        ],
      },
    };
    expect(toIssueSummary(withReviewState).prs).toEqual([
      { number: 1618, url: "https://github.com/acme/repo/pull/1618", state: "open" },
    ]);
  });

  it("derives merged/closed/draft from metadata when status isn't one of ours", () => {
    const withDerivedStates: LinearIssue = {
      ...issue,
      attachments: {
        nodes: [
          {
            sourceType: "github",
            metadata: {
              number: 1,
              url: "https://github.com/acme/repo/pull/1",
              status: "approved",
              mergedAt: "2026-01-01T00:00:00.000Z",
            },
          },
          {
            sourceType: "github",
            metadata: {
              number: 2,
              url: "https://github.com/acme/repo/pull/2",
              status: "unreviewed",
              closedAt: "2026-01-01T00:00:00.000Z",
            },
          },
          {
            sourceType: "github",
            metadata: { number: 3, url: "https://github.com/acme/repo/pull/3", status: "unreviewed", draft: true },
          },
        ],
      },
    };
    expect(toIssueSummary(withDerivedStates).prs).toEqual([
      { number: 1, url: "https://github.com/acme/repo/pull/1", state: "merged" },
      { number: 2, url: "https://github.com/acme/repo/pull/2", state: "closed" },
      { number: 3, url: "https://github.com/acme/repo/pull/3", state: "draft" },
    ]);
  });

  it("drops a non-GitHub attachment whose status isn't recognized, rather than guessing open", () => {
    const withUnrecognizedGitlabStatus: LinearIssue = {
      ...issue,
      attachments: {
        nodes: [
          {
            sourceType: "gitlab",
            metadata: { number: 7, url: "https://gitlab.com/acme/repo/-/merge_requests/7", status: "merged_status" },
          },
        ],
      },
    };
    expect(toIssueSummary(withUnrecognizedGitlabStatus).prs).toEqual([]);
  });

  it("omits pr when no attachment carries linked-PR metadata", () => {
    const noPr: LinearIssue = {
      ...issue,
      attachments: { nodes: [{ sourceType: "github", metadata: { number: 42 } }] },
    };
    expect(toIssueSummary(noPr).prs).toEqual([]);
  });
});

describe("toIssueDetail", () => {
  it("maps assignee and project to null when absent", () => {
    const unassigned: LinearIssue = { ...issue, assignee: null, project: null };
    expect(toIssueDetail(unassigned)).toEqual({
      id: "issue-uuid",
      identifier: "ENG-123",
      title: "Plugin attachments",
      url: issue.url,
      branchName: issue.branchName,
      status: "In Progress",
      assignee: null,
      project: null,
      labels: ["Feature"],
    });
  });
});

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { createLinearClient, resolveStartedState, toIssueDetail, toIssueSummary } from "./linear";
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

  it("searches by bare ticket number in addition to title", async () => {
    const result = await withLinearServer(
      (request, response) => {
        expect(request.body.variables).toEqual({
          filter: { or: [{ title: { containsIgnoreCase: "123" } }, { number: { eq: 123 } }] },
        });
        sendJson(response, { data: { issues: { nodes: [issue] } } });
      },
      async (endpoint) => {
        const linear = createLinearClient({ apiKey: "lin_api_test", endpoint });
        return linear.search("123");
      },
    );

    expect(result.map((item) => item.identifier)).toEqual(["ENG-123"]);
  });

  it("falls back to title-only search for a query too long to be a valid Int", async () => {
    const result = await withLinearServer(
      (request, response) => {
        expect(request.body.variables).toEqual({
          filter: { title: { containsIgnoreCase: "9999999999" } },
        });
        sendJson(response, { data: { issues: { nodes: [issue] } } });
      },
      async (endpoint) => {
        const linear = createLinearClient({ apiKey: "lin_api_test", endpoint });
        return linear.search("9999999999");
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

  it("filters assigned issues by closed states", async () => {
    const filters: unknown[] = [];
    const run = (options: Parameters<ReturnType<typeof createLinearClient>["myIssues"]>[0]) =>
      withLinearServer(
        (request, response) => {
          filters.push(request.body.variables.filter);
          sendJson(response, { data: { viewer: { assignedIssues: { nodes: [] } } } });
        },
        async (endpoint) => createLinearClient({ apiKey: "lin_api_test", endpoint }).myIssues(options),
      );

    await run({});
    await run({ showClosed: true });

    expect(filters).toEqual([{ state: { type: { nin: ["completed", "canceled", "duplicate"] } } }, {}]);
  });

  it("includes closed workflow states last when showClosed is set", async () => {
    const result = await withLinearServer(
      (request, response) => {
        expect(request.body.variables).toEqual({ filter: null });
        sendJson(response, {
          data: {
            workflowStates: {
              nodes: [
                { name: "Done", type: "completed", position: 0 },
                { name: "Todo", type: "unstarted", position: 0 },
              ],
            },
          },
        });
      },
      async (endpoint) => createLinearClient({ apiKey: "lin_api_test", endpoint }).openStatuses({ showClosed: true }),
    );

    expect(result).toEqual(["Todo", "Done"]);
  });

  it("caps the board query at 50 issues, which the blocker fan-out is sized for", async () => {
    let query = "";
    await withLinearServer(
      (request, response) => {
        query = request.body.query;
        sendJson(response, { data: { viewer: { assignedIssues: { nodes: [] } } } });
      },
      async (endpoint) => createLinearClient({ apiKey: "lin_api_test", endpoint }).myIssues(),
    );

    expect(query).toContain("assignedIssues(first: 50");
  });

  it("startIssue fails when Linear reports the update did not succeed", async () => {
    await expect(
      withLinearServer(
        (request, response) => {
          sendJson(
            response,
            request.body.query.includes("issueUpdate")
              ? { data: { issueUpdate: { success: false } } }
              : {
                  data: {
                    issue: {
                      state: { type: "backlog" },
                      team: { states: { nodes: [{ id: "s", name: "In Progress", type: "started", position: 1 }] } },
                    },
                  },
                },
          );
        },
        async (endpoint) => createLinearClient({ apiKey: "lin_api_test", endpoint }).startIssue("issue-uuid"),
      ),
    ).rejects.toThrow("Linear did not update the issue");
  });

  it("authenticate rejects when Linear returns no viewer", async () => {
    await expect(
      withLinearServer(
        (_request, response) => sendJson(response, { data: null }),
        async (endpoint) => createLinearClient({ apiKey: "lin_api_test", endpoint }).authenticate(),
      ),
    ).rejects.toThrow("Linear did not confirm this API key");
  });

  it("startIssue moves a todo issue to the team's In Progress state", async () => {
    const calls: Array<{ query: string; variables: Record<string, unknown> }> = [];
    await withLinearServer(
      (request, response) => {
        calls.push(request.body);
        sendJson(
          response,
          request.body.query.includes("issueUpdate")
            ? { data: { issueUpdate: { success: true } } }
            : {
                data: {
                  issue: {
                    state: { type: "unstarted" },
                    team: {
                      states: {
                        nodes: [
                          { id: "s-todo", name: "Todo", type: "unstarted", position: 0 },
                          { id: "s-doing", name: "In Progress", type: "started", position: 1 },
                        ],
                      },
                    },
                  },
                },
              },
        );
      },
      async (endpoint) => createLinearClient({ apiKey: "lin_api_test", endpoint }).startIssue("issue-uuid"),
    );

    expect(calls[1].variables).toEqual({ id: "issue-uuid", stateId: "s-doing" });
  });

  it("startIssue leaves an already-started issue alone", async () => {
    const calls: string[] = [];
    await withLinearServer(
      (request, response) => {
        calls.push(request.body.query);
        sendJson(response, {
          data: { issue: { state: { type: "started" }, team: { states: { nodes: [] } } } },
        });
      },
      async (endpoint) => createLinearClient({ apiKey: "lin_api_test", endpoint }).startIssue("issue-uuid"),
    );

    expect(calls).toHaveLength(1);
  });

  it("lists open workflow states by type then position, deduped, unknown types last", async () => {
    const result = await withLinearServer(
      (_request, response) =>
        sendJson(response, {
          data: {
            workflowStates: {
              nodes: [
                { name: "Weird", type: "future", position: 0 },
                { name: "In Progress", type: "started", position: 1 },
                { name: "Todo", type: "unstarted", position: 0 },
                { name: "Triage", type: "triage", position: 0 },
                { name: "Todo", type: "unstarted", position: 0 },
                { name: "Backlog", type: "backlog", position: 0 },
              ],
            },
          },
        }),
      async (endpoint) => createLinearClient({ apiKey: "lin_api_test", endpoint }).openStatuses(),
    );

    expect(result).toEqual(["Triage", "Backlog", "Todo", "In Progress", "Weird"]);
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

describe("toIssueSummary blockers", () => {
  const blocker = (identifier: string, type: string) => ({
    id: `${identifier}-id`,
    identifier,
    title: `${identifier} title`,
    url: `https://linear.app/acme/issue/${identifier}`,
    branchName: `derek/${identifier.toLowerCase()}`,
    state: { name: "State", type },
  });

  it("lists open blocking relations and drops closed or non-blocking ones", () => {
    const summary = toIssueSummary({
      ...issue,
      blocksRelations: {
        nodes: [
          { type: "blocks", relatedIssue: blocker("ENG-2", "unstarted") },
          { type: "blocks", relatedIssue: blocker("ENG-3", "completed") },
          { type: "related", relatedIssue: blocker("ENG-4", "started") },
        ],
      },
      blockedByRelations: {
        nodes: [
          { type: "blocks", issue: blocker("ENG-9", "started") },
          { type: "blocks", issue: blocker("ENG-8", "canceled") },
        ],
      },
    });

    expect(summary.blocks).toEqual([
      {
        id: "ENG-2-id",
        identifier: "ENG-2",
        title: "ENG-2 title",
        url: "https://linear.app/acme/issue/ENG-2",
        branchName: "derek/eng-2",
        status: "State",
        stateType: "unstarted",
      },
    ]);
    expect(summary.blockedBy.map((item) => item.identifier)).toEqual(["ENG-9"]);
  });
});

describe("toIssueSummary", () => {
  it("formats the subtitle and agent-facing text snapshot", () => {
    expect(toIssueSummary(issue)).toEqual({
      id: "issue-uuid",
      identifier: "ENG-123",
      title: "Plugin attachments",
      subtitle: "◐ In Progress",
      project: "Paseo",
      status: "In Progress",
      stateType: "started",
      priority: "High",
      labels: ["Feature"],
      dueDate: null,
      estimate: null,
      createdAt: undefined,
      updatedAt: undefined,
      blocks: [],
      blockedBy: [],
      url: issue.url,
      description: "Let extensions attach external context.",
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
  it("maps assignee and project to null when absent, with no parent/sub-issues/relations", () => {
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
      description: issue.description,
      parent: null,
      children: [],
      relations: [],
    });
  });

  it("maps parent, sub-issues, and blocks/blocked-by/related relations", () => {
    const ref = (identifier: string, title: string, stateName: string) => ({
      id: `${identifier}-uuid`,
      identifier,
      title,
      url: `https://linear.app/acme/issue/${identifier}`,
      state: { name: stateName, type: "started" },
    });
    const withRelations: LinearIssue = {
      ...issue,
      parent: ref("ENG-100", "Parent epic", "In Progress"),
      children: { nodes: [ref("ENG-124", "Sub-task", "Todo")] },
      relations: { nodes: [{ type: "blocks", relatedIssue: ref("ENG-125", "Downstream work", "Backlog") }] },
      inverseRelations: { nodes: [{ type: "blocks", issue: ref("ENG-99", "Blocking dependency", "In Progress") }] },
    };
    expect(toIssueDetail(withRelations)).toEqual(
      expect.objectContaining({
        parent: {
          id: "ENG-100-uuid",
          identifier: "ENG-100",
          title: "Parent epic",
          url: "https://linear.app/acme/issue/ENG-100",
          status: "In Progress",
        },
        children: [
          {
            id: "ENG-124-uuid",
            identifier: "ENG-124",
            title: "Sub-task",
            url: "https://linear.app/acme/issue/ENG-124",
            status: "Todo",
          },
        ],
        relations: [
          {
            label: "Blocks",
            issue: {
              id: "ENG-125-uuid",
              identifier: "ENG-125",
              title: "Downstream work",
              url: "https://linear.app/acme/issue/ENG-125",
              status: "Backlog",
            },
          },
          {
            label: "Blocked by",
            issue: {
              id: "ENG-99-uuid",
              identifier: "ENG-99",
              title: "Blocking dependency",
              url: "https://linear.app/acme/issue/ENG-99",
              status: "In Progress",
            },
          },
        ],
      }),
    );
  });
});

describe("resolveStartedState", () => {
  const states = [
    { id: "a", name: "Doing", type: "started", position: 2 },
    { id: "b", name: "Review", type: "started", position: 1 },
    { id: "c", name: "Todo", type: "unstarted", position: 0 },
  ];

  it("prefers a state named In Progress", () => {
    expect(resolveStartedState([...states, { id: "d", name: "in progress", type: "started", position: 9 }])?.id).toBe("d");
  });

  it("ignores a state named In Progress that is not a started state", () => {
    const misnamed = { id: "e", name: "In Progress", type: "completed", position: 0 };
    expect(resolveStartedState([misnamed, ...states])?.id).toBe("b");
  });

  it("falls back to the lowest-position started state", () => {
    expect(resolveStartedState(states)?.id).toBe("b");
  });

  it("returns null when the team has no started state", () => {
    expect(resolveStartedState([states[2]])).toBeNull();
  });
});

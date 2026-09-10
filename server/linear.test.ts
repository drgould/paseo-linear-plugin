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
  state: { name: "In Progress" },
  assignee: { name: "Mohamed" },
  project: { name: "Paseo" },
  labels: { nodes: [{ name: "Feature" }] },
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
      subtitle: "In Progress · Mohamed",
      url: issue.url,
      resourceType: "issue",
      branchName: issue.branchName,
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

  it("omits the subtitle when there is no state or assignee to show", () => {
    const bare: LinearIssue = { ...issue, state: { name: "" }, assignee: null };
    expect(toIssueSummary(bare).subtitle).toBeUndefined();
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

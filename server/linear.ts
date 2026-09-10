import { z } from "zod";
import { type IssueDetail, type IssueSummary, LinearIssueSchema } from "../shared/types";

const LinearGraphqlErrorSchema = z.object({ message: z.string() }).passthrough();
const ExactIssueResponseSchema = z.object({
  data: z.object({ issue: LinearIssueSchema.nullable() }).nullable().optional(),
  errors: z.array(LinearGraphqlErrorSchema).optional(),
});
const IssueSearchResponseSchema = z.object({
  data: z
    .object({ issues: z.object({ nodes: z.array(LinearIssueSchema) }) })
    .nullable()
    .optional(),
  errors: z.array(LinearGraphqlErrorSchema).optional(),
});
const ViewerAssignedIssuesResponseSchema = z.object({
  data: z
    .object({ viewer: z.object({ assignedIssues: z.object({ nodes: z.array(LinearIssueSchema) }) }) })
    .nullable()
    .optional(),
  errors: z.array(LinearGraphqlErrorSchema).optional(),
});

const ISSUE_FIELDS = `
  id
  identifier
  title
  description
  url
  branchName
  priorityLabel
  state { name }
  assignee { name }
  project { name }
  labels { nodes { name } }
`;

const EXACT_ISSUE_QUERY = `
  query PaseoLinearIssue($id: String!) {
    issue(id: $id) { ${ISSUE_FIELDS} }
  }
`;

const SEARCH_ISSUES_QUERY = `
  query PaseoLinearIssues($filter: IssueFilter) {
    issues(first: 20, filter: $filter, orderBy: updatedAt) {
      nodes { ${ISSUE_FIELDS} }
    }
  }
`;

const MY_ISSUES_QUERY = `
  query PaseoLinearMyIssues {
    viewer {
      assignedIssues(filter: { state: { type: { neq: "completed" } } }, orderBy: updatedAt) {
        nodes { ${ISSUE_FIELDS} }
      }
    }
  }
`;

const LINEAR_IDENTIFIER = /^[A-Z][A-Z0-9]+-\d+$/i;

export class LinearApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LinearApiError";
  }
}

function issueSubtitle(issue: z.infer<typeof LinearIssueSchema>): string | undefined {
  const parts = [issue.state.name, issue.assignee?.name].filter(
    (part): part is string => typeof part === "string" && part.length > 0,
  );
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

function issueText(issue: z.infer<typeof LinearIssueSchema>): string {
  const labels = issue.labels.nodes.map((label) => label.name).join(", ");
  const lines = [
    `Linear issue ${issue.identifier}: ${issue.title}`,
    `URL: ${issue.url}`,
    `Status: ${issue.state.name}`,
    `Priority: ${issue.priorityLabel}`,
  ];
  if (issue.assignee) lines.push(`Assignee: ${issue.assignee.name}`);
  if (issue.project) lines.push(`Project: ${issue.project.name}`);
  if (labels) lines.push(`Labels: ${labels}`);
  lines.push("", issue.description ?? "No description.");
  return lines.join("\n");
}

export function toIssueSummary(issue: z.infer<typeof LinearIssueSchema>): IssueSummary {
  const subtitle = issueSubtitle(issue);
  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    ...(subtitle ? { subtitle } : {}),
    url: issue.url,
    text: issueText(issue),
    resourceType: "issue",
    branchName: issue.branchName,
  };
}

export function toIssueDetail(issue: z.infer<typeof LinearIssueSchema>): IssueDetail {
  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    url: issue.url,
    branchName: issue.branchName,
    status: issue.state.name,
    assignee: issue.assignee?.name ?? null,
    project: issue.project?.name ?? null,
    labels: issue.labels.nodes.map((label) => label.name),
  };
}

function describeHttpFailure(status: number): string {
  if (status === 401 || status === 403) return "Linear rejected LINEAR_API_KEY";
  if (status === 429) return "Linear rate limit reached. Try again shortly";
  return `Linear API request failed with HTTP ${status}`;
}

function throwGraphqlErrors(errors: Array<{ message: string }> | undefined): void {
  if (!errors || errors.length === 0) return;
  throw new LinearApiError(errors.map((error) => error.message).join("; "));
}

export interface LinearClient {
  search(query: string): Promise<z.infer<typeof LinearIssueSchema>[]>;
  myIssues(): Promise<z.infer<typeof LinearIssueSchema>[]>;
  getIssue(id: string): Promise<z.infer<typeof LinearIssueSchema> | null>;
}

interface LinearClientOptions {
  apiKey: string;
  endpoint?: string;
  request?: typeof fetch;
}

interface GraphqlRequest {
  query: string;
  variables: Record<string, unknown>;
}

export function createLinearClient(options: LinearClientOptions): LinearClient {
  const apiKey = options.apiKey.trim();
  if (!apiKey) throw new LinearApiError("Set LINEAR_API_KEY in the daemon environment");
  const endpoint = options.endpoint ?? "https://api.linear.app/graphql";
  const request = options.request ?? fetch;

  async function graphql(body: GraphqlRequest): Promise<unknown> {
    const response = await request(endpoint, {
      method: "POST",
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new LinearApiError(describeHttpFailure(response.status));
    return response.json();
  }

  async function findExact(identifier: string): Promise<z.infer<typeof LinearIssueSchema>[]> {
    const response = ExactIssueResponseSchema.parse(
      await graphql({ query: EXACT_ISSUE_QUERY, variables: { id: identifier } }),
    );
    throwGraphqlErrors(response.errors);
    return response.data?.issue ? [response.data.issue] : [];
  }

  async function searchTitles(query: string): Promise<z.infer<typeof LinearIssueSchema>[]> {
    const filter = query ? { title: { containsIgnoreCase: query } } : null;
    const response = IssueSearchResponseSchema.parse(
      await graphql({ query: SEARCH_ISSUES_QUERY, variables: { filter } }),
    );
    throwGraphqlErrors(response.errors);
    if (!response.data) throw new LinearApiError("Linear returned no issue data");
    return response.data.issues.nodes;
  }

  return {
    async search(query: string) {
      const normalized = query.trim();
      if (LINEAR_IDENTIFIER.test(normalized)) {
        return findExact(normalized.toUpperCase());
      }
      return searchTitles(normalized);
    },
    async myIssues() {
      const response = ViewerAssignedIssuesResponseSchema.parse(await graphql({ query: MY_ISSUES_QUERY, variables: {} }));
      throwGraphqlErrors(response.errors);
      if (!response.data) throw new LinearApiError("Linear returned no issue data");
      return response.data.viewer.assignedIssues.nodes;
    },
    async getIssue(id: string) {
      const issues = await findExact(id);
      return issues[0] ?? null;
    },
  };
}

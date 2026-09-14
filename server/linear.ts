import { z } from "zod";
import {
  type IssueDetail,
  type IssueRef,
  type IssueSummary,
  LinearIssueSchema,
  PR_STATE_VALUES,
  type PrState,
} from "../shared/types";

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

const ISSUE_REF_FIELDS = `id identifier title url state { name }`;

const ISSUE_FIELDS = `
  id
  identifier
  title
  description
  url
  branchName
  priorityLabel
  state { name type }
  assignee { name }
  project { name }
  labels { nodes { name } }
  attachments { nodes { sourceType metadata } }
`;

/**
 * Parent/sub-issues/relations for the single-issue detail panel. Kept off the list queries below —
 * each adds a nested connection per issue, and Linear's query-complexity cap (10000) can't fit that
 * fanned out across up to 20 issues (a 20-issue list query with these hit ~19000).
 */
const ISSUE_DETAIL_FIELDS = `
  ${ISSUE_FIELDS}
  parent { ${ISSUE_REF_FIELDS} }
  children { nodes { ${ISSUE_REF_FIELDS} } }
  relations { nodes { type relatedIssue { ${ISSUE_REF_FIELDS} } } }
  inverseRelations { nodes { type issue { ${ISSUE_REF_FIELDS} } } }
`;

/** `fields` is `ISSUE_FIELDS` for a plain identifier search and `ISSUE_DETAIL_FIELDS` for the detail panel — same query, different payload. */
function exactIssueQuery(fields: string): string {
  return `
    query PaseoLinearIssue($id: String!) {
      issue(id: $id) { ${fields} }
    }
  `;
}

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
      assignedIssues(filter: { state: { type: { nin: ["completed", "canceled", "duplicate"] } } }, orderBy: updatedAt) {
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

const STATUS_GLYPH: Record<string, string> = {
  backlog: "○",
  unstarted: "◔",
  started: "◐",
  completed: "●",
  canceled: "✕",
  duplicate: "⧉",
};

function issueStatusLabel(issue: z.infer<typeof LinearIssueSchema>): string | undefined {
  if (!issue.state.name) return undefined;
  return `${STATUS_GLYPH[issue.state.type] ?? "•"} ${issue.state.name}`;
}

/**
 * Linear's GitHub integration reports finer-grained review states in `metadata.status`
 * (e.g. "inReview", "approved", "changesRequested") than our draft/open/merged/closed model,
 * so only trust `status` when it's already one of ours; otherwise derive from the unambiguous
 * `mergedAt`/`closedAt`/`draft` fields GitHub's integration populates, defaulting to "open".
 * Those field names are GitHub-specific — for any other source (GitLab, Bitbucket) an
 * unrecognized `status` can't be safely guessed, so returns `null` and the PR is dropped,
 * matching the old, safer "don't show a PR we can't classify" behavior for those sources.
 */
function derivePrState(metadata: Record<string, unknown>, sourceType: string | null): PrState | null {
  if (typeof metadata.status === "string" && PR_STATE_VALUES.includes(metadata.status)) {
    return metadata.status as PrState;
  }
  if (sourceType?.toLowerCase() !== "github") return null;
  if (typeof metadata.mergedAt === "string") return "merged";
  if (typeof metadata.closedAt === "string") return "closed";
  if (metadata.draft === true) return "draft";
  return "open";
}

/**
 * Reads linked PRs/MRs straight off Linear's own attachment metadata (populated by its
 * GitHub/GitLab/Bitbucket integrations) instead of shelling out and guessing by branch name.
 * Skips commit-link attachments (e.g. "githubCommit"). An issue can have more than one linked
 * PR (stacked PRs, follow-ups), so this collects all matching attachments rather than stopping
 * at the first.
 */
function toIssuePrs(issue: z.infer<typeof LinearIssueSchema>): IssueSummary["prs"] {
  const prs: IssueSummary["prs"] = [];
  for (const attachment of issue.attachments.nodes) {
    if (attachment.sourceType?.toLowerCase().endsWith("commit")) continue;
    const { number, url, title } = attachment.metadata;
    if (typeof number !== "number" || typeof url !== "string") continue;
    const state = derivePrState(attachment.metadata, attachment.sourceType);
    if (!state) continue;
    prs.push({ number, url, state, ...(typeof title === "string" ? { title } : {}) });
  }
  return prs;
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
  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    subtitle: issueStatusLabel(issue),
    status: issue.state.name,
    url: issue.url,
    text: issueText(issue),
    resourceType: "issue",
    branchName: issue.branchName,
    prs: toIssuePrs(issue),
  };
}

/** Forward label: this issue "blocks" the other. Inverse label: the other issue "blocks" this one. */
const RELATION_LABELS: Record<string, { forward: string; inverse: string }> = {
  blocks: { forward: "Blocks", inverse: "Blocked by" },
  duplicate: { forward: "Duplicate of", inverse: "Duplicated by" },
  related: { forward: "Related to", inverse: "Related to" },
};

function toIssueRef(ref: { id: string; identifier: string; title: string; url: string; state: { name: string } }): IssueRef {
  return { id: ref.id, identifier: ref.identifier, title: ref.title, url: ref.url, status: ref.state.name };
}

function toRelations(issue: z.infer<typeof LinearIssueSchema>): IssueDetail["relations"] {
  const forward = (issue.relations?.nodes ?? []).map((relation) => ({
    label: RELATION_LABELS[relation.type]?.forward ?? relation.type,
    issue: toIssueRef(relation.relatedIssue),
  }));
  const inverse = (issue.inverseRelations?.nodes ?? []).map((relation) => ({
    label: RELATION_LABELS[relation.type]?.inverse ?? relation.type,
    issue: toIssueRef(relation.issue),
  }));
  return [...forward, ...inverse];
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
    description: issue.description,
    parent: issue.parent ? toIssueRef(issue.parent) : null,
    children: (issue.children?.nodes ?? []).map(toIssueRef),
    relations: toRelations(issue),
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

  async function findExact(identifier: string, fields: string): Promise<z.infer<typeof LinearIssueSchema>[]> {
    const response = ExactIssueResponseSchema.parse(
      await graphql({ query: exactIssueQuery(fields), variables: { id: identifier } }),
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
        return findExact(normalized.toUpperCase(), ISSUE_FIELDS);
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
      const issues = await findExact(id, ISSUE_DETAIL_FIELDS);
      return issues[0] ?? null;
    },
  };
}

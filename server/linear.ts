import { z } from "zod";
import {
  type Blocker,
  BlockerRefSchema,
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

const OpenStatusesResponseSchema = z.object({
  data: z
    .object({
      workflowStates: z.object({
        nodes: z.array(z.object({ name: z.string(), type: z.string(), position: z.number() })),
      }),
    })
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
  dueDate
  estimate
  createdAt
  updatedAt
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

/**
 * Blocker badges on the board. Bounded connections with minimal fields: the board query fetches up to 50 issues,
 * so every extra field here is multiplied by 50 against Linear's 10000 complexity cap.
 */
const BLOCKER_FIELDS = `id identifier title url branchName state { name type }`;

const MY_ISSUE_FIELDS = `
  ${ISSUE_FIELDS}
  blocksRelations: relations(first: 5) { nodes { type relatedIssue { ${BLOCKER_FIELDS} } } }
  blockedByRelations: inverseRelations(first: 5) { nodes { type issue { ${BLOCKER_FIELDS} } } }
`;

const SEARCH_ISSUES_QUERY = `
  query PaseoLinearIssues($filter: IssueFilter) {
    issues(first: 20, filter: $filter, orderBy: updatedAt) {
      nodes { ${ISSUE_FIELDS} }
    }
  }
`;

const MY_ISSUES_QUERY = `
  query PaseoLinearMyIssues($filter: IssueFilter) {
    viewer {
      assignedIssues(first: 50, filter: $filter, orderBy: updatedAt) {
        nodes { ${MY_ISSUE_FIELDS} }
      }
    }
  }
`;

const OPEN_STATUSES_QUERY = `
  query PaseoLinearOpenStatuses($filter: WorkflowStateFilter) {
    workflowStates(filter: $filter, first: 250) {
      nodes { name type position }
    }
  }
`;

const CLOSED_STATE_TYPES = ["completed", "canceled", "duplicate"];
const OPEN_STATE_TYPE_ORDER = ["triage", "backlog", "unstarted", "started", ...CLOSED_STATE_TYPES];

const VIEWER_QUERY = `query PaseoLinearViewer { viewer { id } }`;

const ViewerResponseSchema = z.object({
  data: z.object({ viewer: z.object({ id: z.string() }) }).nullable().optional(),
  errors: z.array(LinearGraphqlErrorSchema).optional(),
});

const TEAM_STATES_QUERY = `
  query PaseoLinearTeamStates($id: String!) {
    issue(id: $id) { id state { type } team { states { nodes { id name type position } } } }
  }
`;

const TeamStatesResponseSchema = z.object({
  data: z
    .object({
      issue: z
        .object({
          state: z.object({ type: z.string() }),
          team: z.object({
            states: z.object({
              nodes: z.array(z.object({ id: z.string(), name: z.string(), type: z.string(), position: z.number() })),
            }),
          }),
        })
        .nullable(),
    })
    .nullable()
    .optional(),
  errors: z.array(LinearGraphqlErrorSchema).optional(),
});

const ISSUE_UPDATE_MUTATION = `
  mutation PaseoLinearIssueUpdate($id: String!, $stateId: String!) {
    issueUpdate(id: $id, input: { stateId: $stateId }) { success }
  }
`;

const IssueUpdateResponseSchema = z.object({
  data: z.object({ issueUpdate: z.object({ success: z.boolean() }) }).nullable().optional(),
  errors: z.array(LinearGraphqlErrorSchema).optional(),
});

interface TeamState {
  id: string;
  name: string;
  type: string;
  position: number;
}

/** Among `started` states, prefers one literally named "In Progress", else the lowest position. */
export function resolveStartedState(states: TeamState[]): TeamState | null {
  const started = states.filter((state) => state.type === "started").sort((a, b) => a.position - b.position);
  return started.find((state) => state.name.toLowerCase() === "in progress") ?? started[0] ?? null;
}

const LINEAR_IDENTIFIER = /^[A-Z][A-Z0-9]+-\d+$/i;
const NUMERIC_QUERY = /^\d{1,9}$/;

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

/** A blocker that is already closed no longer blocks anything. */
function openBlockers(
  nodes: Array<{ type: string; issue: z.infer<typeof BlockerRefSchema> }>,
): Blocker[] {
  return nodes
    .filter((node) => node.type === "blocks" && !CLOSED_STATE_TYPES.includes(node.issue.state.type))
    .map(({ issue }) => ({
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      url: issue.url,
      branchName: issue.branchName,
      status: issue.state.name,
      stateType: issue.state.type,
    }));
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
    project: issue.project?.name ?? null,
    status: issue.state.name,
    stateType: issue.state.type,
    priority: issue.priorityLabel,
    labels: issue.labels.nodes.map((label) => label.name),
    dueDate: issue.dueDate ?? null,
    estimate: issue.estimate ?? null,
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt,
    blocks: openBlockers(
      (issue.blocksRelations?.nodes ?? []).map(({ type, relatedIssue }) => ({ type, issue: relatedIssue })),
    ),
    blockedBy: openBlockers(issue.blockedByRelations?.nodes ?? []),
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
  if (status === 401 || status === 403) return "Linear rejected this API key";
  if (status === 429) return "Linear rate limit reached. Try again shortly";
  return `Linear API request failed with HTTP ${status}`;
}

function throwGraphqlErrors(errors: Array<{ message: string }> | undefined): void {
  if (!errors || errors.length === 0) return;
  throw new LinearApiError(errors.map((error) => error.message).join("; "));
}

export interface LinearClient {
  search(query: string): Promise<z.infer<typeof LinearIssueSchema>[]>;
  myIssues(options?: MyIssuesOptions): Promise<z.infer<typeof LinearIssueSchema>[]>;
  /** Names of workflow states across teams, board-ordered (triage first); closed states only with `showClosed`. */
  openStatuses(options?: { showClosed?: boolean }): Promise<string[]>;
  /** Throws `LinearApiError` unless Linear accepts the key. */
  authenticate(): Promise<void>;
  /** Moves a not-yet-started issue to its team's started state; no-op once started/closed. */
  startIssue(id: string): Promise<void>;
  getIssue(id: string): Promise<z.infer<typeof LinearIssueSchema> | null>;
}

export interface MyIssuesOptions {
  showClosed?: boolean;
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
    let filter: Record<string, unknown> | null = null;
    if (NUMERIC_QUERY.test(query)) {
      filter = { or: [{ title: { containsIgnoreCase: query } }, { number: { eq: Number(query) } }] };
    } else if (query) {
      filter = { title: { containsIgnoreCase: query } };
    }
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
    async myIssues(options = {}) {
      const filter: Record<string, unknown> = {};
      if (!options.showClosed) filter.state = { type: { nin: CLOSED_STATE_TYPES } };
      const response = ViewerAssignedIssuesResponseSchema.parse(
        await graphql({ query: MY_ISSUES_QUERY, variables: { filter } }),
      );
      throwGraphqlErrors(response.errors);
      if (!response.data) throw new LinearApiError("Linear returned no issue data");
      return response.data.viewer.assignedIssues.nodes;
    },
    async openStatuses(options = {}) {
      const filter = options.showClosed ? null : { type: { nin: CLOSED_STATE_TYPES } };
      const response = OpenStatusesResponseSchema.parse(
        await graphql({ query: OPEN_STATUSES_QUERY, variables: { filter } }),
      );
      throwGraphqlErrors(response.errors);
      if (!response.data) throw new LinearApiError("Linear returned no workflow state data");
      const typeRank = (type: string) => {
        const index = OPEN_STATE_TYPE_ORDER.indexOf(type);
        return index === -1 ? OPEN_STATE_TYPE_ORDER.length : index;
      };
      // ponytail: first 250 states only, same-named states across teams keep the first-sorted position; paginate if a workspace outgrows it
      const sorted = [...response.data.workflowStates.nodes].sort(
        (a, b) => typeRank(a.type) - typeRank(b.type) || a.position - b.position,
      );
      return Array.from(new Set(sorted.map((state) => state.name)));
    },
    async authenticate() {
      const response = ViewerResponseSchema.parse(await graphql({ query: VIEWER_QUERY, variables: {} }));
      throwGraphqlErrors(response.errors);
      if (!response.data) throw new LinearApiError("Linear did not confirm this API key");
    },
    async startIssue(id: string) {
      const states = TeamStatesResponseSchema.parse(await graphql({ query: TEAM_STATES_QUERY, variables: { id } }));
      throwGraphqlErrors(states.errors);
      const issue = states.data?.issue;
      if (!issue) throw new LinearApiError(`Linear issue ${id} not found`);
      if (!["triage", "backlog", "unstarted"].includes(issue.state.type)) return;
      const target = resolveStartedState(issue.team.states.nodes);
      if (!target) throw new LinearApiError("No started workflow state found for this team");
      const update = IssueUpdateResponseSchema.parse(
        await graphql({ query: ISSUE_UPDATE_MUTATION, variables: { id, stateId: target.id } }),
      );
      throwGraphqlErrors(update.errors);
      if (!update.data?.issueUpdate.success) throw new LinearApiError("Linear did not update the issue");
    },
    async getIssue(id: string) {
      const issues = await findExact(id, ISSUE_DETAIL_FIELDS);
      return issues[0] ?? null;
    },
  };
}

import { z } from "zod";

const PR_STATES = ["draft", "open", "merged", "closed"] as const;
export type PrState = (typeof PR_STATES)[number];
export const PR_STATE_VALUES: readonly string[] = PR_STATES;

/** Bare reference to another issue, as returned inline for parent/sub-issue/relation lookups. */
const LinearIssueRefSchema = z.object({
  id: z.string(),
  identifier: z.string(),
  title: z.string(),
  url: z.string(),
  state: z.object({ name: z.string() }),
});

/** Minimal issue reference for the board's blocker badges (kept tiny to fit Linear's query-complexity cap). */
export const BlockerRefSchema = z.object({
  id: z.string(),
  identifier: z.string(),
  title: z.string(),
  url: z.string(),
  branchName: z.string(),
  state: z.object({ name: z.string(), type: z.string() }),
});

/** Enough of a blocking/blocked issue to list it nested under a ticket and start a workspace for it. */
export const BlockerSchema = z.object({
  id: z.string(),
  identifier: z.string(),
  title: z.string(),
  url: z.string(),
  branchName: z.string(),
  status: z.string(),
  stateType: z.string(),
});

export type Blocker = z.infer<typeof BlockerSchema>;

/** Raw shape returned by Linear's GraphQL API for a single issue. */
export const LinearIssueSchema = z.object({
  id: z.string(),
  identifier: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  url: z.string(),
  branchName: z.string(),
  priorityLabel: z.string(),
  state: z.object({ name: z.string(), type: z.string() }),
  assignee: z.object({ name: z.string() }).nullable(),
  project: z.object({ name: z.string() }).nullable(),
  labels: z.object({ nodes: z.array(z.object({ name: z.string() })) }),
  dueDate: z.string().nullish(),
  estimate: z.number().nullish(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  /** Issues this one blocks / is blocked by (aliases of `relations`/`inverseRelations`, list-sized). */
  blocksRelations: z.object({ nodes: z.array(z.object({ type: z.string(), relatedIssue: BlockerRefSchema })) }).optional(),
  blockedByRelations: z.object({ nodes: z.array(z.object({ type: z.string(), issue: BlockerRefSchema })) }).optional(),
  /** Linear's own linked-PR attachments (GitHub, GitLab, Bitbucket, ...), not a `gh`/branch-name lookup. */
  attachments: z.object({
    nodes: z.array(
      z.object({
        sourceType: z.string().nullable(),
        metadata: z.record(z.string(), z.unknown()),
      }),
    ),
  }),
  parent: LinearIssueRefSchema.nullable().optional(),
  children: z.object({ nodes: z.array(LinearIssueRefSchema) }).optional(),
  /** Relations authored from this issue (e.g. this "blocks" relatedIssue). */
  relations: z.object({ nodes: z.array(z.object({ type: z.string(), relatedIssue: LinearIssueRefSchema })) }).optional(),
  /** Relations authored from the other issue that name this one (e.g. issue "blocks" this). */
  inverseRelations: z.object({ nodes: z.array(z.object({ type: z.string(), issue: LinearIssueRefSchema })) }).optional(),
});

export type LinearIssue = z.infer<typeof LinearIssueSchema>;

/**
 * Search/list result shape shared by the attachment source and the "My Issues" sidebar list.
 * `text` is the full formatted snapshot sent into an agent prompt or composer draft.
 */
export const IssueSummarySchema = z.object({
  id: z.string(),
  identifier: z.string(),
  title: z.string(),
  subtitle: z.string().optional(),
  project: z.string().nullish(),
  status: z.string(),
  /** Linear workflow-state type (backlog/unstarted/started/completed/canceled/...), drives status colour/icon. */
  stateType: z.string().optional(),
  priority: z.string().optional(),
  labels: z.array(z.string()).default([]),
  dueDate: z.string().nullish(),
  estimate: z.number().nullish(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  url: z.string().url(),
  text: z.string(),
  /** Ticket body, so the launch prompt can include it without the agent fetching the issue. */
  description: z.string().nullish(),
  resourceType: z.string(),
  branchName: z.string(),
  /** Open issues this one blocks. */
  blocks: z.array(BlockerSchema).default([]),
  /** Open issues blocking this one. */
  blockedBy: z.array(BlockerSchema).default([]),
  prs: z
    .array(
      z.object({
        number: z.number(),
        url: z.string().url(),
        state: z.enum(PR_STATES),
        title: z.string().optional(),
      }),
    )
    .default([]),
});

export type IssueSummary = z.infer<typeof IssueSummarySchema>;

/** Bare reference to another issue, for parent/sub-issue/relation display. */
const IssueRefSchema = z.object({
  id: z.string(),
  identifier: z.string(),
  title: z.string(),
  url: z.string().url(),
  status: z.string(),
});

export type IssueRef = z.infer<typeof IssueRefSchema>;

/** Single-issue detail shape for the workspace panel and the kanban side panel. */
export const IssueDetailSchema = z.object({
  id: z.string(),
  identifier: z.string(),
  title: z.string(),
  url: z.string().url(),
  branchName: z.string(),
  status: z.string(),
  assignee: z.string().nullable(),
  project: z.string().nullable(),
  labels: z.array(z.string()),
  description: z.string().nullable(),
  parent: IssueRefSchema.nullable(),
  children: z.array(IssueRefSchema),
  /** Blocks/blocked-by/related, pre-labeled server-side so the client just renders it. */
  relations: z.array(z.object({ label: z.string(), issue: IssueRefSchema })),
});

export type IssueDetail = z.infer<typeof IssueDetailSchema>;

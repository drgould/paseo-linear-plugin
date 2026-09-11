import { z } from "zod";

const PR_STATES = ["draft", "open", "merged", "closed"] as const;
export type PrState = (typeof PR_STATES)[number];
export const PR_STATE_VALUES: readonly string[] = PR_STATES;

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
  /** Linear's own linked-PR attachments (GitHub, GitLab, Bitbucket, ...), not a `gh`/branch-name lookup. */
  attachments: z.object({
    nodes: z.array(
      z.object({
        sourceType: z.string().nullable(),
        metadata: z.record(z.string(), z.unknown()),
      }),
    ),
  }),
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
  status: z.string(),
  url: z.string().url(),
  text: z.string(),
  resourceType: z.string(),
  branchName: z.string(),
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

/** Single-issue detail shape for the workspace panel. */
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
});

export type IssueDetail = z.infer<typeof IssueDetailSchema>;

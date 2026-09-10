import { z } from "zod";

/** Raw shape returned by Linear's GraphQL API for a single issue. */
export const LinearIssueSchema = z.object({
  id: z.string(),
  identifier: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  url: z.string(),
  branchName: z.string(),
  priorityLabel: z.string(),
  state: z.object({ name: z.string() }),
  assignee: z.object({ name: z.string() }).nullable(),
  project: z.object({ name: z.string() }).nullable(),
  labels: z.object({ nodes: z.array(z.object({ name: z.string() })) }),
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
  url: z.string().url(),
  text: z.string(),
  resourceType: z.string(),
  branchName: z.string(),
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

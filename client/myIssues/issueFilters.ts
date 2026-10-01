import type { IssueSummary } from "../../shared/types";

export type SortField = "updated" | "created" | "due" | "priority";
export type SortDirection = "newest" | "oldest";

export interface IssueFilters {
  query: string;
  /** Status (column) name to show alone; `null` shows every status. */
  status: string | null;
}

export interface IssueSort {
  field: SortField;
  direction: SortDirection;
}

const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

function priorityRank(issue: IssueSummary): number {
  return PRIORITY_RANK[issue.priority?.toLowerCase() ?? ""] ?? 4;
}

export function filterIssues(issues: IssueSummary[], { query, status }: IssueFilters): IssueSummary[] {
  const needle = query.trim().toLowerCase();
  return issues.filter((issue) => {
    if (status !== null && issue.status !== status) return false;
    if (!needle) return true;
    return [issue.identifier, issue.title, issue.project ?? "", issue.status, ...issue.labels]
      .join(" ")
      .toLowerCase()
      .includes(needle);
  });
}

/** Missing values (no due date, no priority) sort last whichever way the direction points. */
function sortValue(issue: IssueSummary, field: SortField): number | null {
  if (field === "priority") return priorityRank(issue) === 4 ? null : priorityRank(issue);
  const raw = field === "updated" ? issue.updatedAt : field === "created" ? issue.createdAt : issue.dueDate;
  const time = raw ? Date.parse(raw) : Number.NaN;
  return Number.isNaN(time) ? null : time;
}

/**
 * "newest" is most recent / latest / highest priority first, "oldest" the reverse.
 * Priority ranks run urgent=0 upward, so its natural ascending order is already "highest first".
 */
export function sortIssues(issues: IssueSummary[], { field, direction }: IssueSort): IssueSummary[] {
  const sign = (direction === "newest") === (field === "priority") ? 1 : -1;
  return [...issues].sort((a, b) => {
    const left = sortValue(a, field);
    const right = sortValue(b, field);
    if (left === null || right === null) return left === right ? 0 : left === null ? 1 : -1;
    return (left - right) * sign;
  });
}

export function statusCounts(issues: IssueSummary[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const issue of issues) counts.set(issue.status, (counts.get(issue.status) ?? 0) + 1);
  return counts;
}

export function hasActiveFilters({ query, status }: IssueFilters): boolean {
  return query.trim() !== "" || status !== null;
}

/** "2026-10-05" -> "Oct 5". Built from the date parts, since `Date.parse` would read it as UTC and can shift the day. */
export function formatDueDate(dueDate: string): string {
  const [year, month, day] = dueDate.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

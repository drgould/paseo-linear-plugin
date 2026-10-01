import type { Blocker, IssueSummary } from "../../shared/types";

/** The full ticket when it's on the board (keeps its PRs and labels), otherwise a minimal one built from the blocker's own fields. */
export function blockerToIssue(blocker: Blocker, known: IssueSummary[]): IssueSummary {
  const onBoard = known.find((issue) => issue.id === blocker.id);
  if (onBoard) return onBoard;
  return {
    id: blocker.id,
    identifier: blocker.identifier,
    title: blocker.title,
    status: blocker.status,
    stateType: blocker.stateType,
    labels: [],
    blocks: [],
    blockedBy: [],
    url: blocker.url,
    text: [`Linear issue ${blocker.identifier}: ${blocker.title}`, `URL: ${blocker.url}`, `Status: ${blocker.status}`].join("\n"),
    resourceType: "issue",
    branchName: blocker.branchName,
    prs: [],
  };
}

/** Every blocker/blocked ticket not already on the board, so workspace lookups can see them too. */
export function nestedIssues(issues: IssueSummary[]): IssueSummary[] {
  const seen = new Set(issues.map((issue) => issue.id));
  const extra: IssueSummary[] = [];
  for (const issue of issues) {
    for (const blocker of [...issue.blockedBy, ...issue.blocks]) {
      if (seen.has(blocker.id)) continue;
      seen.add(blocker.id);
      extra.push(blockerToIssue(blocker, issues));
    }
  }
  return extra;
}

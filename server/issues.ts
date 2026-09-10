import type { RpcInput, RpcOutput } from "@getpaseo/plugin";
import type { searchIssuesRpc } from "../shared/issues";
import { createLinearClient, toIssueSummary } from "./linear";
import { getApiKey } from "./settings";

const DEFAULT_VIEW_ORDER = ["todo", "backlog", "in progress"];

function rank(status: string): number {
  const index = DEFAULT_VIEW_ORDER.indexOf(status.toLowerCase());
  return index === -1 ? DEFAULT_VIEW_ORDER.length : index;
}

export async function searchIssues({
  query,
}: RpcInput<typeof searchIssuesRpc>): Promise<RpcOutput<typeof searchIssuesRpc>> {
  const linear = createLinearClient({ apiKey: await getApiKey() });
  const trimmed = query.trim();

  if (!trimmed) {
    // Nothing typed yet: show only the viewer's own issues, todo/backlog/in-progress first,
    // most-recently-updated first within each (myIssues() already comes back updatedAt desc,
    // and Array#sort is stable, so this re-sort preserves that as the secondary order).
    const issues = await linear.myIssues();
    const items = issues.map(toIssueSummary).sort((a, b) => rank(a.status) - rank(b.status));
    return { items };
  }

  const issues = await linear.search(trimmed);
  return { items: issues.map(toIssueSummary) };
}

import type { RpcInput, RpcOutput } from "@getpaseo/plugin";
import type { searchIssuesRpc } from "../shared/issues";
import { createLinearClient, toIssueSummary } from "./linear";
import { getApiKey } from "./settings";

export async function searchIssues({
  query,
}: RpcInput<typeof searchIssuesRpc>): Promise<RpcOutput<typeof searchIssuesRpc>> {
  const linear = createLinearClient({ apiKey: await getApiKey() });
  const trimmed = query.trim();

  if (!trimmed) {
    // Nothing typed yet: show only the viewer's own open issues, most-recently-updated first
    // (myIssues() already comes back updatedAt desc).
    const items = (await linear.myIssues()).map(toIssueSummary);
    return { items };
  }

  const issues = await linear.search(trimmed);
  return { items: issues.map(toIssueSummary) };
}

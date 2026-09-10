import type { RpcInput, RpcOutput } from "@getpaseo/plugin";
import type { searchIssuesRpc } from "../shared/issues";
import { createLinearClient, toIssueSummary } from "./linear";
import { getApiKey } from "./settings";

export async function searchIssues({
  query,
}: RpcInput<typeof searchIssuesRpc>): Promise<RpcOutput<typeof searchIssuesRpc>> {
  const linear = createLinearClient({ apiKey: await getApiKey() });
  const issues = await linear.search(query);
  return { items: issues.map(toIssueSummary) };
}

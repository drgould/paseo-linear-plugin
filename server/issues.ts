import type { RpcInput, RpcOutput } from "@getpaseo/plugin";
import type { searchIssuesRpc } from "../shared/issues";
import { createLinearClient, toIssueSummary } from "./linear";

export async function searchIssues({
  query,
}: RpcInput<typeof searchIssuesRpc>): Promise<RpcOutput<typeof searchIssuesRpc>> {
  const linear = createLinearClient({ apiKey: process.env.LINEAR_API_KEY ?? "" });
  const issues = await linear.search(query);
  return { items: issues.map(toIssueSummary) };
}

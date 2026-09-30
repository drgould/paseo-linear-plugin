import type { RpcInput } from "@getpaseo/plugin";
import { createLinearClient, toIssueSummary } from "./linear";
import { getApiKey } from "./settings";
import type { myIssuesRpc } from "../shared/myIssues";

export async function listMyIssues(_input: RpcInput<typeof myIssuesRpc>) {
  const linear = createLinearClient({ apiKey: await getApiKey() });
  const [issues, statuses] = await Promise.all([linear.myIssues(), linear.openStatuses().catch((): string[] => [])]);
  return { items: issues.map(toIssueSummary), statuses };
}

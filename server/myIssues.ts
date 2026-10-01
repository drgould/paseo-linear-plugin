import type { RpcInput } from "@getpaseo/plugin";
import { createLinearClient, toIssueSummary } from "./linear";
import { getApiKey, getSettings } from "./settings";
import type { myIssuesRpc } from "../shared/myIssues";

export async function listMyIssues(_input: RpcInput<typeof myIssuesRpc>) {
  const linear = createLinearClient({ apiKey: await getApiKey() });
  const { showClosed } = await getSettings();
  const [issues, statuses] = await Promise.all([
    linear.myIssues({ showClosed }),
    linear.openStatuses({ showClosed }).catch((): string[] => []),
  ]);
  return { items: issues.map(toIssueSummary), statuses };
}

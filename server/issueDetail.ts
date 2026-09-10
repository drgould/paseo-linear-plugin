import type { RpcInput } from "@getpaseo/plugin";
import { issueDetailRpc } from "../shared/issueDetail";
import { createLinearClient, toIssueDetail } from "./linear";
import { getApiKey } from "./settings";

export async function getIssueDetail({ id }: RpcInput<typeof issueDetailRpc>) {
  const linear = createLinearClient({ apiKey: await getApiKey() });
  const issue = await linear.getIssue(id);
  return issue ? toIssueDetail(issue) : null;
}

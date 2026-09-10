import type { RpcInput } from "@getpaseo/plugin";
import { issueDetailRpc } from "../shared/issueDetail";
import { createLinearClient, toIssueDetail } from "./linear";

export async function getIssueDetail({ id }: RpcInput<typeof issueDetailRpc>) {
  const linear = createLinearClient({ apiKey: process.env.LINEAR_API_KEY ?? "" });
  const issue = await linear.getIssue(id);
  return issue ? toIssueDetail(issue) : null;
}

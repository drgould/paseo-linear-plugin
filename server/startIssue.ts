import type { RpcInput } from "@getpaseo/plugin";
import type { startIssueRpc } from "../shared/settings";
import { createLinearClient } from "./linear";
import { getApiKey } from "./settings";

export async function startIssue({ id }: RpcInput<typeof startIssueRpc>): Promise<{ ok: boolean }> {
  await createLinearClient({ apiKey: await getApiKey() }).startIssue(id);
  return { ok: true };
}

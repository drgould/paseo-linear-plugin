import type { RpcInput, RpcOutput } from "@getpaseo/plugin";
import { branchExistsRpc } from "../shared/branchExists";
import { runGit } from "./git";

export async function checkBranchExists({
  projectRootPath,
  branchName,
}: RpcInput<typeof branchExistsRpc>): Promise<RpcOutput<typeof branchExistsRpc>> {
  const stdout = await runGit(projectRootPath, ["ls-remote", "--exit-code", "--heads", "origin", branchName]);
  return { exists: !!stdout && stdout.trim().length > 0 };
}

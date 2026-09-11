import type { RpcInput, RpcOutput } from "@getpaseo/plugin";
import { gitRemoteOwnerRpc, parseGitHubSlug } from "../shared/gitRemote";
import { runGit } from "./git";

async function originSlug(projectRootPath: string): Promise<string | null> {
  const stdout = await runGit(projectRootPath, ["remote", "get-url", "origin"]);
  return stdout ? parseGitHubSlug(stdout.trim()) : null;
}

export async function resolveGitRemoteOwners({
  projectRootPaths,
}: RpcInput<typeof gitRemoteOwnerRpc>): Promise<RpcOutput<typeof gitRemoteOwnerRpc>> {
  const entries = await Promise.all(
    projectRootPaths.map(async (path) => [path, await originSlug(path)] as const),
  );
  return { owners: Object.fromEntries(entries) };
}

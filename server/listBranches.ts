import type { RpcInput, RpcOutput } from "@getpaseo/plugin";
import { listBranchesRpc } from "../shared/listBranches";
import { runGit } from "./git";

const LOCAL_PREFIX = "refs/heads/";
const REMOTE_PREFIX = "refs/remotes/origin/";

export interface BranchRef {
  name: string;
  ref: string;
}

/**
 * Parses `refs/heads` and `refs/remotes/origin` refs (in `for-each-ref`'s most-recent-first order),
 * deduping local/remote pairs by name — whichever side is more recently committed wins the slot.
 */
export function parseBranchRefs(stdout: string): BranchRef[] {
  const seen = new Set<string>();
  const branches: BranchRef[] = [];
  for (const rawLine of stdout.split("\n")) {
    const ref = rawLine.trim();
    const name = ref.startsWith(LOCAL_PREFIX)
      ? ref.slice(LOCAL_PREFIX.length)
      : ref.startsWith(REMOTE_PREFIX)
        ? ref.slice(REMOTE_PREFIX.length)
        : "";
    if (!name || name === "HEAD" || seen.has(name)) continue;
    seen.add(name);
    branches.push({ name, ref });
  }
  return branches;
}

async function resolveDefaultBranch(projectRootPath: string): Promise<string | null> {
  const head = await runGit(projectRootPath, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]);
  return head ? head.trim().replace(/^origin\//, "") : null;
}

export async function listBranches({
  projectRootPath,
}: RpcInput<typeof listBranchesRpc>): Promise<RpcOutput<typeof listBranchesRpc>> {
  const [stdout, defaultBranch] = await Promise.all([
    runGit(projectRootPath, [
      "for-each-ref",
      "--sort=-committerdate",
      "--format=%(refname)",
      "refs/heads",
      "refs/remotes/origin",
    ]),
    resolveDefaultBranch(projectRootPath),
  ]);
  const branches = stdout ? parseBranchRefs(stdout) : [];
  return { branches, defaultBranch };
}

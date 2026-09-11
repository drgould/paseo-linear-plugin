import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

/** Matches github.com remotes (https/ssh/scp) and PR URLs; returns a lowercase "owner/repo" slug for comparison. */
export function parseGitHubSlug(url: string): string | null {
  const match = url.match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?(?:[/?#]|$)/i);
  return match ? `${match[1]}/${match[2]}`.toLowerCase() : null;
}

export const gitRemoteOwnerRpc = defineRpc({
  name: "linear.git-remote-owner",
  input: z.object({ projectRootPaths: z.array(z.string()) }),
  output: z.object({ owners: z.record(z.string(), z.string().nullable()) }),
});

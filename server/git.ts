import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const GIT_TIMEOUT_MS = 10_000;

/** Runs a git subcommand in `cwd`, returning stdout, or `null` on any failure (including timeout). */
export async function runGit(cwd: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd, timeout: GIT_TIMEOUT_MS });
    return stdout;
  } catch {
    return null;
  }
}

import type { usePaseo } from "@getpaseo/plugin/client";
import type { IssueSummary } from "../../shared/types";

type Paseo = ReturnType<typeof usePaseo>;

export interface LinearProject {
  projectId: string;
  projectDisplayName: string;
  projectRootPath: string;
}

export async function resolveProjectsForIssue(paseo: Paseo): Promise<LinearProject[]> {
  const { projects } = await paseo.projects.list();
  return projects;
}

export async function startWorkspaceForIssue(
  paseo: Paseo,
  project: LinearProject,
  issue: IssueSummary,
): Promise<void> {
  const workspace = await paseo.workspaces.create({
    title: `${issue.identifier}: ${issue.title}`,
    source: {
      kind: "worktree",
      cwd: project.projectRootPath,
      action: "branch-off",
      branchName: issue.branchName,
    },
  });
  await workspace.agents.create({
    config: { provider: "codex/gpt-5.5" },
    prompt: issue.text,
    labels: { linearIssueId: issue.id },
  });
}

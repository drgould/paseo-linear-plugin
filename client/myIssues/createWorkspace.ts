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

async function resolveAvailableProvider(paseo: Paseo): Promise<string> {
  const { providers } = await paseo.providers.listAvailable();
  const available = providers.find((entry) => entry.available);
  if (!available) {
    throw new Error("No Paseo provider is configured. Add one in Settings → Providers.");
  }
  return available.provider;
}

export async function startWorkspaceForIssue(
  paseo: Paseo,
  project: LinearProject,
  issue: IssueSummary,
): Promise<void> {
  const provider = await resolveAvailableProvider(paseo);
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
    config: { provider },
    prompt: issue.text,
    labels: { linearIssueId: issue.id },
  });
}

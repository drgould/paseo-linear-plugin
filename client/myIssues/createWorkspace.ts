import type { RpcInput, RpcOutput } from "@getpaseo/plugin";
import type { usePaseo } from "@getpaseo/plugin/client";
import type { branchExistsRpc } from "../../shared/branchExists";
import type { gitRemoteOwnerRpc } from "../../shared/gitRemote";
import { parseGitHubSlug } from "../../shared/gitRemote";
import { issueAttachments } from "../../shared/issues";
import type { getDefaultProfileRpc } from "../../shared/settings";
import type { IssueSummary } from "../../shared/types";

type Paseo = ReturnType<typeof usePaseo>;
type FetchGitRemoteOwners = (
  input: RpcInput<typeof gitRemoteOwnerRpc>,
) => Promise<RpcOutput<typeof gitRemoteOwnerRpc>>;
type FetchBranchExists = (
  input: RpcInput<typeof branchExistsRpc>,
) => Promise<RpcOutput<typeof branchExistsRpc>>;
type FetchDefaultProfile = (
  input: RpcInput<typeof getDefaultProfileRpc>,
) => Promise<RpcOutput<typeof getDefaultProfileRpc>>;

export interface LinearProject {
  projectId: string;
  projectDisplayName: string;
  projectRootPath: string;
}

/** The issue's open/draft PR, when it's a GitHub PR — the only kind we can check out or attach as `github_pr`. */
export function findActiveGithubPr(issue: IssueSummary) {
  const pr = issue.prs.find((entry) => entry.state === "open" || entry.state === "draft");
  return pr && parseGitHubSlug(pr.url) ? pr : undefined;
}

/** Narrows to the project whose GitHub remote matches the issue's linked PR, when unambiguous. */
export async function resolveProjectsForIssue(
  paseo: Paseo,
  issue: IssueSummary,
  fetchGitRemoteOwners: FetchGitRemoteOwners,
): Promise<LinearProject[]> {
  const { projects } = await paseo.projects.list();
  if (projects.length <= 1) return projects;

  const targetSlug = parseGitHubSlug(findActiveGithubPr(issue)?.url ?? "");
  if (!targetSlug) return projects;

  const { owners } = await fetchGitRemoteOwners({
    projectRootPaths: projects.map((project) => project.projectRootPath),
  });
  const matches = projects.filter((project) => owners[project.projectRootPath] === targetSlug);
  return matches.length === 1 ? matches : projects;
}

async function pickAvailableProvider(paseo: Paseo): Promise<string> {
  const { providers } = await paseo.providers.listAvailable();
  const available = providers.find((entry) => entry.available);
  if (!available) {
    throw new Error("No Paseo provider is configured. Add one in Settings → Providers.");
  }
  return available.provider;
}

/** Uses `preferredModelId` only when the provider still lists it; falls back to the provider's default model otherwise. */
async function resolveModel(paseo: Paseo, provider: string, preferredModelId?: string): Promise<string> {
  const { models } = await paseo.providers.listModels(provider);
  if (preferredModelId && models?.some((entry) => entry.id === preferredModelId)) {
    return preferredModelId;
  }
  const model = models?.find((entry) => entry.isDefault) ?? models?.[0];
  if (!model) {
    throw new Error(`No models available for provider "${provider}".`);
  }
  return model.id;
}

interface AgentConfig {
  provider: string;
  modeId?: string;
  thinkingOptionId?: string;
}

/** Resolves a specific saved profile (or, for `null`, the first available provider/model). */
async function resolveAgentConfigForProfile(paseo: Paseo, profileId: string | null): Promise<AgentConfig> {
  const profile = profileId ? (await paseo.config.get()).config.agentProfiles?.find((entry) => entry.id === profileId) : undefined;
  const provider = profile?.provider ?? (await pickAvailableProvider(paseo));
  const model = await resolveModel(paseo, provider, profile?.model);
  return { provider: `${provider}/${model}`, modeId: profile?.modeId, thinkingOptionId: profile?.thinkingOptionId };
}

/** Uses the default agent profile set in Linear settings when one is saved, else the first available provider/model. */
async function resolveAgentConfig(paseo: Paseo, fetchDefaultProfile: FetchDefaultProfile): Promise<AgentConfig> {
  const { profileId } = await fetchDefaultProfile({});
  return resolveAgentConfigForProfile(paseo, profileId);
}

/**
 * `"auto"` checks out the PR's branch when one is open, else the already-pushed branch when one exists, else
 * branches off fresh. `"fresh"` always branches off, skipping both checks. `"checkout"` checks out an arbitrary
 * ref the user picked from the repo (local `refs/heads/...` or remote `refs/remotes/origin/...`), unrelated to
 * the issue's own branch/PR.
 */
export type BranchSourceOverride =
  | { kind: "auto" }
  | { kind: "fresh"; baseBranch?: string }
  | { kind: "checkout"; ref: string };

async function resolveWorktreeSource(
  project: LinearProject,
  issue: IssueSummary,
  fetchBranchExists: FetchBranchExists,
  branchSource: BranchSourceOverride = { kind: "auto" },
) {
  if (branchSource.kind === "checkout") {
    return {
      kind: "worktree" as const,
      cwd: project.projectRootPath,
      action: "checkout" as const,
      refName: branchSource.ref,
    };
  }
  if (branchSource.kind === "auto") {
    const activePr = findActiveGithubPr(issue);
    if (activePr) {
      return {
        kind: "worktree" as const,
        cwd: project.projectRootPath,
        action: "checkout" as const,
        githubPrNumber: activePr.number,
      };
    }
    const { exists } = await fetchBranchExists({
      projectRootPath: project.projectRootPath,
      branchName: issue.branchName,
    });
    if (exists) {
      return {
        kind: "worktree" as const,
        cwd: project.projectRootPath,
        action: "checkout" as const,
        refName: `refs/remotes/origin/${issue.branchName}`,
      };
    }
  }
  return {
    kind: "worktree" as const,
    cwd: project.projectRootPath,
    action: "branch-off" as const,
    branchName: issue.branchName,
    ...(branchSource.kind === "fresh" && branchSource.baseBranch ? { baseBranch: branchSource.baseBranch } : {}),
  };
}

/** Same shape the composer builds when a user manually attaches this issue via the attachment picker. */
function buildIssueAttachment(issue: IssueSummary) {
  return {
    type: "text" as const,
    mimeType: "text/plain" as const,
    text: issue.text,
    title: issue.title,
    externalResource: {
      provider: issueAttachments.id,
      providerLabel: issueAttachments.title,
      resourceType: issue.resourceType,
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      url: issue.url,
    },
  };
}

function buildPrAttachment(pr: IssueSummary["prs"][number]) {
  return {
    type: "github_pr" as const,
    mimeType: "application/github-pr" as const,
    number: pr.number,
    title: pr.title ?? `PR #${pr.number}`,
    url: pr.url,
  };
}

export interface WorkspaceOverrides {
  /** `null` means "Auto" (first available provider); omit entirely to use the saved default profile. */
  profileId?: string | null;
  branchSource?: BranchSourceOverride;
}

export async function startWorkspaceForIssue(
  paseo: Paseo,
  project: LinearProject,
  issue: IssueSummary,
  fetchBranchExists: FetchBranchExists,
  fetchDefaultProfile: FetchDefaultProfile,
  overrides?: WorkspaceOverrides,
): Promise<string> {
  const config =
    overrides?.profileId !== undefined
      ? await resolveAgentConfigForProfile(paseo, overrides.profileId)
      : await resolveAgentConfig(paseo, fetchDefaultProfile);
  // Only attach the PR when the branch source can actually resolve through it — "fresh" or an explicit
  // "checkout" of an unrelated ref means the agent's real git state has nothing to do with this PR.
  const activePr = (overrides?.branchSource?.kind ?? "auto") === "auto" ? findActiveGithubPr(issue) : undefined;
  const source = await resolveWorktreeSource(project, issue, fetchBranchExists, overrides?.branchSource);
  const workspace = await paseo.workspaces.create({
    title: `${issue.identifier}: ${issue.title}`,
    source,
  });
  await workspace.agents.create({
    config,
    prompt: `Work on ${issue.identifier}: ${issue.title}`,
    attachments: activePr ? [buildIssueAttachment(issue), buildPrAttachment(activePr)] : [buildIssueAttachment(issue)],
    labels: { linearIssueId: issue.id },
  });
  return workspace.id;
}

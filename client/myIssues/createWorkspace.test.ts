import { describe, expect, it, vi } from "vitest";
import type { IssueSummary } from "../../shared/types";
import { startWorkspaceForIssue, type LinearProject } from "./createWorkspace";

function makeIssue(overrides: Partial<IssueSummary> = {}): IssueSummary {
  return {
    id: "issue-1",
    identifier: "ENG-1",
    title: "Do the thing",
    status: "In Progress",
    url: "https://linear.app/acme/issue/ENG-1",
    text: "text",
    resourceType: "issue",
    branchName: "derek/eng-1-do-the-thing",
    prs: [],
    ...overrides,
  };
}

const project: LinearProject = {
  projectId: "p1",
  projectDisplayName: "Repo",
  projectRootPath: "/repo",
};

function makePaseo(
  create: ReturnType<typeof vi.fn>,
  agentsCreate: ReturnType<typeof vi.fn> = vi.fn(),
  configGet: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue({ config: { agentProfiles: [] } }),
  listModels: ReturnType<typeof vi.fn> = vi
    .fn()
    .mockResolvedValue({ models: [{ provider: "codex", id: "gpt-5", label: "GPT-5", isDefault: true }] }),
) {
  create.mockResolvedValue({ agents: { create: agentsCreate } });
  return {
    providers: {
      listAvailable: vi.fn().mockResolvedValue({ providers: [{ provider: "codex", available: true }] }),
      listModels,
    },
    config: { get: configGet },
    workspaces: { create },
  } as unknown as Parameters<typeof startWorkspaceForIssue>[0];
}

const noProfile = vi.fn().mockResolvedValue({ profileId: null });

describe("startWorkspaceForIssue", () => {
  it("checks out the PR's branch when one is open", async () => {
    const create = vi.fn();
    const issue = makeIssue({
      prs: [{ number: 42, url: "https://github.com/acme/repo/pull/42", state: "open" }],
    });

    await startWorkspaceForIssue(makePaseo(create), project, issue, vi.fn(), noProfile);

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        source: expect.objectContaining({ action: "checkout", githubPrNumber: 42 }),
      }),
    );
  });

  it("attaches the issue and the active PR, same as a manual composer attachment", async () => {
    const create = vi.fn();
    const agentsCreate = vi.fn();
    const issue = makeIssue({
      prs: [{ number: 42, url: "https://github.com/acme/repo/pull/42", state: "open", title: "Add the thing" }],
    });

    await startWorkspaceForIssue(makePaseo(create, agentsCreate), project, issue, vi.fn(), noProfile);

    expect(agentsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [
          expect.objectContaining({
            type: "text",
            text: issue.text,
            externalResource: expect.objectContaining({ id: issue.id, identifier: issue.identifier }),
          }),
          expect.objectContaining({ type: "github_pr", number: 42, title: "Add the thing" }),
        ],
      }),
    );
  });

  it("attaches only the issue when there is no active PR", async () => {
    const create = vi.fn();
    const agentsCreate = vi.fn();
    const issue = makeIssue();

    await startWorkspaceForIssue(makePaseo(create, agentsCreate), project, issue, vi.fn().mockResolvedValue({ exists: false }), noProfile);

    expect(agentsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [expect.objectContaining({ type: "text" })],
      }),
    );
  });

  it("does not treat a non-GitHub PR (e.g. a GitLab MR) as checkout-able, falling back to branch resolution", async () => {
    const create = vi.fn();
    const agentsCreate = vi.fn();
    const issue = makeIssue({
      prs: [{ number: 42, url: "https://gitlab.com/acme/repo/-/merge_requests/42", state: "open" }],
    });
    const fetchBranchExists = vi.fn().mockResolvedValue({ exists: false });

    await startWorkspaceForIssue(makePaseo(create, agentsCreate), project, issue, fetchBranchExists, noProfile);

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        source: expect.objectContaining({ action: "branch-off", branchName: issue.branchName }),
      }),
    );
    expect(agentsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ attachments: [expect.objectContaining({ type: "text" })] }),
    );
  });

  it("checks out the already-pushed branch when no PR is open yet", async () => {
    const create = vi.fn();
    const issue = makeIssue();
    const fetchBranchExists = vi.fn().mockResolvedValue({ exists: true });

    await startWorkspaceForIssue(makePaseo(create), project, issue, fetchBranchExists, noProfile);

    expect(fetchBranchExists).toHaveBeenCalledWith({
      projectRootPath: "/repo",
      branchName: issue.branchName,
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        source: expect.objectContaining({
          action: "checkout",
          refName: `refs/remotes/origin/${issue.branchName}`,
        }),
      }),
    );
  });

  it("uses the saved default agent profile's provider/model/mode/thinking", async () => {
    const create = vi.fn();
    const agentsCreate = vi.fn();
    const issue = makeIssue();
    const configGet = vi.fn().mockResolvedValue({
      config: {
        agentProfiles: [
          { id: "profile-1", name: "Claude Plan", provider: "claude", model: "claude-sonnet-5", modeId: "plan", thinkingOptionId: "high" },
        ],
      },
    });
    const fetchDefaultProfile = vi.fn().mockResolvedValue({ profileId: "profile-1" });
    const listModels = vi.fn().mockResolvedValue({
      models: [{ provider: "claude", id: "claude-sonnet-5", label: "Sonnet 5", isDefault: false }],
    });

    await startWorkspaceForIssue(
      makePaseo(create, agentsCreate, configGet, listModels),
      project,
      issue,
      vi.fn().mockResolvedValue({ exists: false }),
      fetchDefaultProfile,
    );

    expect(agentsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        config: { provider: "claude/claude-sonnet-5", modeId: "plan", thinkingOptionId: "high" },
      }),
    );
  });

  it("falls back to the provider's default model when the saved profile's model is stale", async () => {
    const create = vi.fn();
    const agentsCreate = vi.fn();
    const issue = makeIssue();
    const configGet = vi.fn().mockResolvedValue({
      config: {
        agentProfiles: [{ id: "profile-1", name: "Claude Plan", provider: "claude", model: "claude-sonnet-4-deprecated" }],
      },
    });
    const fetchDefaultProfile = vi.fn().mockResolvedValue({ profileId: "profile-1" });
    const listModels = vi.fn().mockResolvedValue({
      models: [{ provider: "claude", id: "claude-sonnet-5", label: "Sonnet 5", isDefault: true }],
    });

    await startWorkspaceForIssue(
      makePaseo(create, agentsCreate, configGet, listModels),
      project,
      issue,
      vi.fn().mockResolvedValue({ exists: false }),
      fetchDefaultProfile,
    );

    expect(agentsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ config: expect.objectContaining({ provider: "claude/claude-sonnet-5" }) }),
    );
  });

  it("branches off fresh when there is no PR and no pushed branch", async () => {
    const create = vi.fn();
    const issue = makeIssue();
    const fetchBranchExists = vi.fn().mockResolvedValue({ exists: false });

    await startWorkspaceForIssue(makePaseo(create), project, issue, fetchBranchExists, noProfile);

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        source: expect.objectContaining({ action: "branch-off", branchName: issue.branchName }),
      }),
    );
  });
});

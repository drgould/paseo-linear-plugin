import type { PluginTheme } from "@getpaseo/plugin";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { usePaseo, useRpc } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { ApiKeyForm } from "../settings/ApiKeyForm";
import { hasApiKeyRpc, getDefaultProfileRpc } from "../../shared/settings";
import { myIssuesRpc } from "../../shared/myIssues";
import { gitRemoteOwnerRpc, parseGitHubSlug } from "../../shared/gitRemote";
import { branchExistsRpc } from "../../shared/branchExists";
import type { IssueSummary, PrState } from "../../shared/types";
import { type LinearProject, resolveProjectsForIssue, startWorkspaceForIssue } from "./createWorkspace";

/** "owner/repo#number" — PR numbers repeat across repos, so a bare number isn't a safe lookup key. */
function prKey(repoSlug: string, number: number): string {
  return `${repoSlug}#${number}`;
}

/** Precomputes the issue-derived lookup maps once per issues list, independent of agent/workspace refetches. */
function useIssueLookup(issues: IssueSummary[]) {
  return useMemo(() => {
    const issueIdByPrKey = new Map<string, string>();
    const issueIdByBranchName = new Map<string, string>();
    for (const issue of issues) {
      for (const pr of issue.prs) {
        const repoSlug = parseGitHubSlug(pr.url);
        if (repoSlug) issueIdByPrKey.set(prKey(repoSlug, pr.number), issue.id);
      }
      issueIdByBranchName.set(issue.branchName, issue.id);
    }
    return { issueIdByPrKey, issueIdByBranchName };
  }, [issues]);
}

/**
 * Maps issue id -> open workspace id, from three sources: agents this plugin started (tagged with
 * `labels.linearIssueId`), any workspace checked out against the issue's linked PR, and any workspace
 * already on the issue's branch (covers a branch pushed before a PR exists) — so a workspace opened
 * outside this plugin, e.g. from Paseo's own checkout flow, is still found.
 * ponytail: fetches only the first page of each list; add pagination if either outgrows it.
 */
function useOpenWorkspaceIdsByIssueId(enabled: boolean, issues: IssueSummary[]) {
  const paseo = usePaseo();
  const { data: agentsData } = useQuery({
    queryKey: ["linear", "openWorkspaces"],
    queryFn: () => paseo.agents.list(),
    enabled,
  });
  const { data: workspacesData } = useQuery({
    queryKey: ["linear", "workspaces"],
    queryFn: () => paseo.workspaces.list(),
    enabled,
  });
  const { issueIdByPrKey, issueIdByBranchName } = useIssueLookup(issues);
  return useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of agentsData?.entries ?? []) {
      const issueId = entry.agent.labels.linearIssueId;
      if (issueId && entry.agent.workspaceId && entry.agent.status !== "closed") {
        map.set(issueId, entry.agent.workspaceId);
      }
    }
    for (const workspace of workspacesData?.entries ?? []) {
      if (workspace.archivingAt) continue;
      const pr = workspace.githubRuntime?.pullRequest;
      const prIssueId =
        pr?.number !== undefined && pr.repoOwner && pr.repoName
          ? issueIdByPrKey.get(prKey(`${pr.repoOwner}/${pr.repoName}`.toLowerCase(), pr.number))
          : undefined;
      const issueId =
        prIssueId ??
        (workspace.gitRuntime?.currentBranch
          ? issueIdByBranchName.get(workspace.gitRuntime.currentBranch)
          : undefined);
      if (issueId && !map.has(issueId)) map.set(issueId, workspace.id);
    }
    return map;
  }, [agentsData, workspacesData, issueIdByPrKey, issueIdByBranchName]);
}

const PR_INDICATOR: Record<PrState, { icon: string; label: string }> = {
  draft: { icon: "GitPullRequestDraft", label: "Draft" },
  open: { icon: "GitPullRequest", label: "Open" },
  merged: { icon: "GitMerge", label: "Merged" },
  closed: { icon: "GitPullRequestClosed", label: "Closed" },
};

function prColor(theme: PluginTheme, state: PrState): string {
  switch (state) {
    case "draft":
      return theme.colors.foregroundMuted;
    case "open":
      return theme.colors.statusSuccess;
    case "merged":
      return theme.colors.accent;
    case "closed":
      return theme.colors.statusDanger;
  }
}

const COLUMN_ORDER = ["backlog", "todo", "in progress", "in review", "needs review"];

function columnRank(status: string): number {
  const rank = COLUMN_ORDER.indexOf(status.toLowerCase());
  return rank === -1 ? COLUMN_ORDER.length : rank;
}

function describeError(caught: unknown): string {
  return caught instanceof Error ? caught.message : "Could not create workspace.";
}

type PickerState =
  | { kind: "empty"; issueId: string }
  | { kind: "choose"; issueId: string; projects: LinearProject[] }
  | { kind: "error"; issueId: string; message: string }
  | null;

export function MyIssuesSurface({ theme, layout, navigation }: PluginSurfaceProps) {
  const paseo = usePaseo();
  const queryClient = useQueryClient();
  const fetchHasApiKey = useRpc(hasApiKeyRpc);
  const { data: keyStatus, isLoading: isLoadingKeyStatus } = useQuery({
    queryKey: ["linear", "hasApiKey"],
    queryFn: () => fetchHasApiKey({}),
  });
  const fetchMyIssues = useRpc(myIssuesRpc);
  const fetchGitRemoteOwners = useRpc(gitRemoteOwnerRpc);
  const fetchBranchExists = useRpc(branchExistsRpc);
  const fetchDefaultProfile = useRpc(getDefaultProfileRpc);
  const { data, isLoading, error } = useQuery({
    queryKey: ["linear", "myIssues"],
    queryFn: () => fetchMyIssues({}),
    enabled: keyStatus?.hasKey === true,
  });
  const openWorkspaceIds = useOpenWorkspaceIdsByIssueId(keyStatus?.hasKey === true && !!data, data?.items ?? []);
  const columns = useMemo(() => {
    const byStatus = new Map<string, IssueSummary[]>();
    for (const issue of data?.items ?? []) {
      const column = byStatus.get(issue.status) ?? [];
      column.push(issue);
      byStatus.set(issue.status, column);
    }
    return Array.from(byStatus.entries())
      .map(([status, items]) => ({ status, items }))
      .sort((a, b) => columnRank(a.status) - columnRank(b.status));
  }, [data]);
  const [picker, setPicker] = useState<PickerState>(null);
  const [startingId, setStartingId] = useState<string | null>(null);

  const styles = useMemo(
    () => ({
      screen: {
        flex: 1,
        backgroundColor: theme.colors.surface0,
      },
      board: {
        padding: layout.compact ? 16 : 24,
        gap: layout.compact ? 12 : 16,
      },
      column: {
        width: layout.compact ? 240 : 280,
        height: "100%" as const,
        gap: layout.compact ? 8 : 12,
      },
      columnScroll: { flex: 1 },
      columnList: { gap: layout.compact ? 8 : 12, paddingBottom: 4 },
      columnHeader: { color: theme.colors.foregroundMuted, fontSize: 12, fontWeight: "600" as const },
      row: {
        padding: layout.compact ? 12 : 16,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface1,
        gap: 6,
      },
      title: { color: theme.colors.foreground, fontSize: layout.compact ? 15 : 16, fontWeight: "600" as const },
      subtitle: { color: theme.colors.foregroundMuted, fontSize: 13 },
      message: { color: theme.colors.foregroundMuted },
      screenMessage: {
        flex: 1,
        alignItems: "center" as const,
        justifyContent: "center" as const,
        gap: 8,
        padding: layout.compact ? 16 : 24,
      },
      messageRow: { flexDirection: "row" as const, alignItems: "center" as const, gap: 6 },
      button: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 6,
        padding: layout.compact ? 8 : 10,
        borderRadius: 8,
        backgroundColor: theme.colors.accent,
        alignSelf: "flex-start" as const,
      },
      buttonText: { color: theme.colors.accentForeground, fontSize: 13 },
      secondaryButton: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 6,
        padding: layout.compact ? 8 : 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.border,
        alignSelf: "flex-start" as const,
      },
      secondaryButtonText: { color: theme.colors.foregroundMuted, fontSize: 13 },
      prLink: { flexDirection: "row" as const, alignItems: "center" as const, gap: 4 },
      prLinkText: { fontSize: 12 },
      pickerRow: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 8 },
      pickerOption: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 4,
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.border,
      },
      pickerOptionText: { color: theme.colors.foreground, fontSize: 12 },
    }),
    [theme, layout.compact],
  );

  async function invalidateWorkspaceQueries() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["linear", "openWorkspaces"] }),
      queryClient.invalidateQueries({ queryKey: ["linear", "workspaces"] }),
    ]);
  }

  async function handleStartWorkspace(issue: IssueSummary) {
    setStartingId(issue.id);
    try {
      const projects = await resolveProjectsForIssue(paseo, issue, fetchGitRemoteOwners);
      if (projects.length === 0) {
        setPicker({ kind: "empty", issueId: issue.id });
        return;
      }
      if (projects.length === 1) {
        await startWorkspaceForIssue(paseo, projects[0], issue, fetchBranchExists, fetchDefaultProfile);
        await invalidateWorkspaceQueries();
        setPicker(null);
        return;
      }
      setPicker({ kind: "choose", issueId: issue.id, projects });
    } catch (caught) {
      setPicker({ kind: "error", issueId: issue.id, message: describeError(caught) });
    } finally {
      setStartingId(null);
    }
  }

  async function handlePickProject(issue: IssueSummary, project: LinearProject) {
    setStartingId(issue.id);
    try {
      await startWorkspaceForIssue(paseo, project, issue, fetchBranchExists, fetchDefaultProfile);
      await invalidateWorkspaceQueries();
      setPicker(null);
    } catch (caught) {
      setPicker({ kind: "error", issueId: issue.id, message: describeError(caught) });
    } finally {
      setStartingId(null);
    }
  }

  if (isLoadingKeyStatus) {
    return (
      <View style={[styles.screen, styles.screenMessage]}>
        <Text style={styles.message}>Loading…</Text>
      </View>
    );
  }

  if (!keyStatus?.hasKey) {
    return (
      <View style={styles.screen}>
        <ApiKeyForm
          theme={theme}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ["linear", "hasApiKey"] })}
        />
      </View>
    );
  }

  function renderCard(issue: IssueSummary) {
    const workspaceId = openWorkspaceIds.get(issue.id);
    return (
      <View key={issue.id} style={styles.row}>
        <Text style={styles.title}>{issue.title}</Text>
        <Text style={styles.subtitle}>{issue.identifier}</Text>
        {issue.prs.map((pr) => (
          <Pressable key={pr.url} style={styles.prLink} accessibilityRole="link" onPress={() => Linking.openURL(pr.url)}>
            <Icon name={PR_INDICATOR[pr.state].icon} size={14} color={prColor(theme, pr.state)} />
            <Text style={[styles.prLinkText, { color: prColor(theme, pr.state) }]}>
              PR #{pr.number} {PR_INDICATOR[pr.state].label}
            </Text>
          </Pressable>
        ))}
        {workspaceId ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Go to workspace for ${issue.identifier}`}
            style={styles.secondaryButton}
            onPress={() => navigation?.openWorkspace({ workspaceId })}
          >
            <Icon name="ArrowRight" size={14} color={theme.colors.foregroundMuted} />
            <Text style={styles.secondaryButtonText}>Go to workspace</Text>
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Create workspace for ${issue.identifier}`}
            style={styles.button}
            disabled={startingId === issue.id}
            onPress={() => handleStartWorkspace(issue)}
          >
            <Icon name="Plus" size={14} color={theme.colors.accentForeground} />
            <Text style={styles.buttonText}>{startingId === issue.id ? "Creating…" : "Create workspace"}</Text>
          </Pressable>
        )}
        {picker?.issueId === issue.id && picker.kind === "empty" ? (
          <View style={styles.messageRow}>
            <Icon name="FolderX" size={14} color={theme.colors.foregroundMuted} />
            <Text style={styles.message}>No projects available to create a workspace.</Text>
          </View>
        ) : null}
        {picker?.issueId === issue.id && picker.kind === "error" ? (
          <View style={styles.messageRow}>
            <Icon name="AlertCircle" size={14} color={theme.colors.statusDanger} />
            <Text style={styles.message}>{picker.message}</Text>
          </View>
        ) : null}
        {picker?.issueId === issue.id && picker.kind === "choose" ? (
          <View style={styles.pickerRow}>
            {picker.projects.map((project) => (
              <Pressable
                key={project.projectId}
                accessibilityRole="button"
                accessibilityLabel={`Create workspace in ${project.projectDisplayName}`}
                style={styles.pickerOption}
                onPress={() => handlePickProject(issue, project)}
              >
                <Icon name="FolderGit2" size={14} color={theme.colors.foreground} />
                <Text style={styles.pickerOptionText}>{project.projectDisplayName}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={[styles.screen, styles.screenMessage]}>
        <Text style={styles.message}>Loading issues…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.screen, styles.screenMessage]}>
        <Icon name="AlertCircle" size={20} color={theme.colors.statusDanger} />
        <Text style={styles.message}>Could not load Linear issues.</Text>
      </View>
    );
  }

  if (columns.length === 0) {
    return (
      <View style={[styles.screen, styles.screenMessage]}>
        <Icon name="Inbox" size={20} color={theme.colors.foregroundMuted} />
        <Text style={styles.message}>No assigned issues.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} horizontal contentContainerStyle={styles.board}>
      {columns.map(({ status, items }) => (
        <View key={status} style={styles.column}>
          <Text style={styles.columnHeader}>
            {status.toUpperCase()} · {items.length}
          </Text>
          <ScrollView style={styles.columnScroll} contentContainerStyle={styles.columnList}>
            {items.map(renderCard)}
          </ScrollView>
        </View>
      ))}
    </ScrollView>
  );
}

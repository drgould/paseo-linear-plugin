import type { PluginTheme } from "@getpaseo/plugin";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { usePaseo, useRpc } from "@getpaseo/plugin/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { ApiKeyForm } from "../settings/ApiKeyForm";
import { hasApiKeyRpc } from "../../shared/settings";
import { myIssuesRpc } from "../../shared/myIssues";
import type { IssueSummary, PrState } from "../../shared/types";
import { type LinearProject, resolveProjectsForIssue, startWorkspaceForIssue } from "./createWorkspace";

interface OpenWorkspace {
  agentId: string;
  workspaceId: string;
}

/** ponytail: fetches only the first agents page; add pagination if a user's open-agent count outgrows it. */
function useOpenWorkspacesByIssueId(enabled: boolean) {
  const paseo = usePaseo();
  const { data } = useQuery({
    queryKey: ["linear", "openWorkspaces"],
    queryFn: () => paseo.agents.list(),
    enabled,
  });
  return useMemo(() => {
    const map = new Map<string, OpenWorkspace>();
    for (const entry of data?.entries ?? []) {
      const issueId = entry.agent.labels.linearIssueId;
      if (issueId && entry.agent.workspaceId && entry.agent.status !== "closed") {
        map.set(issueId, { agentId: entry.agent.id, workspaceId: entry.agent.workspaceId });
      }
    }
    return map;
  }, [data]);
}

const PR_INDICATOR: Record<PrState, { glyph: string; label: string }> = {
  draft: { glyph: "◌", label: "Draft" },
  open: { glyph: "●", label: "Open" },
  merged: { glyph: "◆", label: "Merged" },
  closed: { glyph: "✕", label: "Closed" },
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
  return caught instanceof Error ? caught.message : "Could not start workspace.";
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
  const { data, isLoading, error } = useQuery({
    queryKey: ["linear", "myIssues"],
    queryFn: () => fetchMyIssues({}),
    enabled: keyStatus?.hasKey === true,
  });
  const openWorkspaces = useOpenWorkspacesByIssueId(keyStatus?.hasKey === true && !!data);
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
      message: { color: theme.colors.foregroundMuted, padding: layout.compact ? 16 : 24 },
      button: {
        padding: layout.compact ? 8 : 10,
        borderRadius: 8,
        backgroundColor: theme.colors.accent,
        alignSelf: "flex-start" as const,
      },
      buttonText: { color: theme.colors.accentForeground, fontSize: 13 },
      prLink: { fontSize: 12 },
      pickerRow: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 8 },
      pickerOption: {
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

  async function handleStartWorkspace(issue: IssueSummary) {
    setStartingId(issue.id);
    try {
      const projects = await resolveProjectsForIssue(paseo);
      if (projects.length === 0) {
        setPicker({ kind: "empty", issueId: issue.id });
        return;
      }
      if (projects.length === 1) {
        await startWorkspaceForIssue(paseo, projects[0], issue);
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
      await startWorkspaceForIssue(paseo, project, issue);
      setPicker(null);
    } catch (caught) {
      setPicker({ kind: "error", issueId: issue.id, message: describeError(caught) });
    } finally {
      setStartingId(null);
    }
  }

  if (isLoadingKeyStatus) {
    return (
      <View style={styles.screen}>
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
    const openWorkspace = openWorkspaces.get(issue.id);
    return (
      <View key={issue.id} style={styles.row}>
        <Text style={styles.title}>{issue.title}</Text>
        <Text style={styles.subtitle}>{issue.identifier}</Text>
        {issue.prs.map((pr) => (
          <Pressable key={pr.url} accessibilityRole="link" onPress={() => Linking.openURL(pr.url)}>
            <Text style={[styles.prLink, { color: prColor(theme, pr.state) }]}>
              {PR_INDICATOR[pr.state].glyph} PR #{pr.number} {PR_INDICATOR[pr.state].label}
            </Text>
          </Pressable>
        ))}
        {openWorkspace ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open workspace for ${issue.identifier}`}
            style={styles.button}
            onPress={() => navigation?.openWorkspace({ workspaceId: openWorkspace.workspaceId })}
          >
            <Text style={styles.buttonText}>Open workspace</Text>
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Start workspace for ${issue.identifier}`}
            style={styles.button}
            disabled={startingId === issue.id}
            onPress={() => handleStartWorkspace(issue)}
          >
            <Text style={styles.buttonText}>{startingId === issue.id ? "Starting…" : "Start workspace"}</Text>
          </Pressable>
        )}
        {picker?.issueId === issue.id && picker.kind === "empty" ? (
          <Text style={styles.message}>No projects available to start a workspace.</Text>
        ) : null}
        {picker?.issueId === issue.id && picker.kind === "error" ? (
          <Text style={styles.message}>{picker.message}</Text>
        ) : null}
        {picker?.issueId === issue.id && picker.kind === "choose" ? (
          <View style={styles.pickerRow}>
            {picker.projects.map((project) => (
              <Pressable
                key={project.projectId}
                accessibilityRole="button"
                accessibilityLabel={`Start workspace in ${project.projectDisplayName}`}
                style={styles.pickerOption}
                onPress={() => handlePickProject(issue, project)}
              >
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
      <View style={styles.screen}>
        <Text style={styles.message}>Loading issues…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.screen}>
        <Text style={styles.message}>Could not load Linear issues.</Text>
      </View>
    );
  }

  if (columns.length === 0) {
    return (
      <View style={styles.screen}>
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

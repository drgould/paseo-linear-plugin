import type { PluginAgentPanelProps, PluginClientContext } from "@getpaseo/plugin/client";
import { useAgent, useRpc } from "@getpaseo/plugin/client";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { issueDetailRpc } from "../../shared/issueDetail";

function IssueDetailPanel({ theme, layout, agentId }: PluginAgentPanelProps) {
  const linearIssueId = useAgent(agentId, (agent) => agent.labels.linearIssueId || null);
  const getIssueDetail = useRpc(issueDetailRpc);

  const styles = useMemo(
    () => ({
      screen: {
        flex: 1,
        padding: layout.compact ? 16 : 24,
        gap: layout.compact ? 8 : 12,
        backgroundColor: theme.colors.surface0,
      },
      title: { color: theme.colors.foreground, fontSize: layout.compact ? 18 : 22, fontWeight: "600" as const },
      label: { color: theme.colors.foregroundMuted, fontSize: 13 },
      value: { color: theme.colors.foreground, fontSize: 15 },
      link: { color: theme.colors.accent, fontSize: 15 },
    }),
    [theme, layout.compact],
  );

  const { data: issue, isLoading } = useQuery({
    queryKey: ["linear-issue-detail", linearIssueId],
    queryFn: () => getIssueDetail({ id: linearIssueId as string }),
    enabled: linearIssueId != null,
  });

  if (!linearIssueId) {
    return (
      <View style={styles.screen}>
        <Text style={styles.value}>No linked Linear issue.</Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.screen}>
        <Text style={styles.value}>Loading…</Text>
      </View>
    );
  }

  if (!issue) {
    return (
      <View style={styles.screen}>
        <Text style={styles.value}>Could not find {linearIssueId} in Linear.</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>
        {issue.identifier}: {issue.title}
      </Text>
      <View>
        <Text style={styles.label}>Status</Text>
        <Text style={styles.value}>{issue.status}</Text>
      </View>
      <View>
        <Text style={styles.label}>Assignee</Text>
        <Text style={styles.value}>{issue.assignee ?? "Unassigned"}</Text>
      </View>
      <Pressable accessibilityRole="link" onPress={() => Linking.openURL(issue.url)}>
        <Text style={styles.link}>{issue.url}</Text>
      </Pressable>
    </View>
  );
}

export function registerIssuePanel(client: PluginClientContext) {
  return client.addWorkspacePanel({
    id: "linear-issue-detail",
    title: "Linear issue",
    icon: "Link",
    context: "agent",
    Component: IssueDetailPanel,
  });
}

import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { usePaseo, useRpc } from "@getpaseo/plugin/client";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { myIssuesRpc } from "../../shared/myIssues";
import type { IssueSummary } from "../../shared/types";
import { type LinearProject, resolveProjectsForIssue, startWorkspaceForIssue } from "./createWorkspace";

type PickerState =
  | { kind: "empty"; issueId: string }
  | { kind: "choose"; issueId: string; projects: LinearProject[] }
  | null;

export function MyIssuesSurface({ theme, layout }: PluginSurfaceProps) {
  const paseo = usePaseo();
  const fetchMyIssues = useRpc(myIssuesRpc);
  const { data, isLoading, error } = useQuery({
    queryKey: ["linear", "myIssues"],
    queryFn: () => fetchMyIssues({}),
  });
  const [picker, setPicker] = useState<PickerState>(null);
  const [startingId, setStartingId] = useState<string | null>(null);

  const styles = useMemo(
    () => ({
      screen: {
        flex: 1,
        padding: layout.compact ? 16 : 24,
        gap: layout.compact ? 8 : 12,
        backgroundColor: theme.colors.surface0,
      },
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
      button: {
        padding: layout.compact ? 8 : 10,
        borderRadius: 8,
        backgroundColor: theme.colors.accent,
        alignSelf: "flex-start" as const,
      },
      buttonText: { color: theme.colors.accentForeground, fontSize: 13 },
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
    } finally {
      setStartingId(null);
    }
  }

  async function handlePickProject(issue: IssueSummary, project: LinearProject) {
    setStartingId(issue.id);
    try {
      await startWorkspaceForIssue(paseo, project, issue);
      setPicker(null);
    } finally {
      setStartingId(null);
    }
  }

  return (
    <View style={styles.screen}>
      {isLoading && <Text style={styles.message}>Loading issues…</Text>}
      {error && <Text style={styles.message}>Could not load Linear issues.</Text>}
      {!isLoading && data?.items.length === 0 && <Text style={styles.message}>No assigned issues.</Text>}
      {data?.items.map((issue) => (
        <View key={issue.id} style={styles.row}>
          <Text style={styles.title}>
            {issue.identifier}: {issue.title}
          </Text>
          {issue.subtitle ? <Text style={styles.subtitle}>{issue.subtitle}</Text> : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Start workspace for ${issue.identifier}`}
            style={styles.button}
            disabled={startingId === issue.id}
            onPress={() => handleStartWorkspace(issue)}
          >
            <Text style={styles.buttonText}>{startingId === issue.id ? "Starting…" : "Start workspace"}</Text>
          </Pressable>
          {picker?.issueId === issue.id && picker.kind === "empty" ? (
            <Text style={styles.message}>No projects available to start a workspace.</Text>
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
      ))}
    </View>
  );
}

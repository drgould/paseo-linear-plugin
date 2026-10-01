import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { usePaseo, useRpc } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Linking, type LayoutChangeEvent, ScrollView, Text, TextInput, View } from "react-native";
import { ConnectCard } from "../settings/ConnectCard";
import {
  connectionRpc,
  getDefaultProfileRpc,
  getSettingsRpc,
  getLastWorkspaceSettingsRpc,
  hasApiKeyRpc,
  saveLastWorkspaceSettingsRpc,
  saveSettingsRpc,
  VIEWS,
} from "../../shared/settings";
import { myIssuesRpc } from "../../shared/myIssues";
import { gitRemoteOwnerRpc, parseGitHubSlug } from "../../shared/gitRemote";
import { branchExistsRpc } from "../../shared/branchExists";
import { listBranchesRpc } from "../../shared/listBranches";
import { issueDetailRpc } from "../../shared/issueDetail";
import type { IssueSummary } from "../../shared/types";
import { type LinearProject, resolveProjectsForIssue } from "./createWorkspace";
import { CreateWorkspaceDialog } from "./CreateWorkspaceDialog";
import { IssueSidePanel, PANEL_DEFAULT_WIDTH } from "./IssueSidePanel";
import {
  filterIssues,
  formatDueDate,
  hasActiveFilters,
  type SortDirection,
  type SortField,
  sortIssues,
  statusCounts,
} from "./issueFilters";
import { blockerToIssue, nestedIssues } from "./blockers";
import { PR_INDICATOR, prColor } from "./prIndicator";
import {
  Chip,
  EmptyState,
  IconButton,
  LabelChip,
  Press,
  PriorityMark,
  Segmented,
  Skeleton,
  StatusMark,
  TREE_CONTENT_PAD,
  TREE_GAP,
  TREE_INDENT,
  TreeConnector,
} from "./ui";
import type { Blocker } from "../../shared/types";

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

function describeError(caught: unknown): string {
  return caught instanceof Error ? caught.message : "Could not create workspace.";
}

type PickerState =
  | { kind: "empty"; issueId: string }
  | { kind: "configure"; issue: IssueSummary; projects: LinearProject[] }
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
  const fetchListBranches = useRpc(listBranchesRpc);
  const fetchDefaultProfile = useRpc(getDefaultProfileRpc);
  const fetchLastWorkspaceSettings = useRpc(getLastWorkspaceSettingsRpc);
  const saveLastWorkspaceSettings = useRpc(saveLastWorkspaceSettingsRpc);
  const fetchIssueDetail = useRpc(issueDetailRpc);
  const fetchSettings = useRpc(getSettingsRpc);
  const saveSettings = useRpc(saveSettingsRpc);
  const fetchConnection = useRpc(connectionRpc);
  const { data: settings, isLoading: isSettingsLoading } = useQuery({
    queryKey: ["linear", "settings"],
    queryFn: () => fetchSettings({}),
    enabled: keyStatus?.hasKey === true,
  });
  const { data: connection } = useQuery({
    queryKey: ["linear", "connection"],
    queryFn: () => fetchConnection({}),
    enabled: keyStatus?.hasKey === true,
  });
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>("updated");
  const [sortDirection, setSortDirection] = useState<SortDirection>("newest");
  const [view, setView] = useState<(typeof VIEWS)[number]>("board");
  const [notice, setNotice] = useState<string | null>(null);
  const [hiddenColumns, setHiddenColumns] = useState<string[]>([]);
  const [columnPickerOpen, setColumnPickerOpen] = useState(false);
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["linear", "myIssues"],
    queryFn: () => fetchMyIssues({}),
    enabled: keyStatus?.hasKey === true,
  });
  const lookupIssues = useMemo(() => {
    const items = data?.items ?? [];
    return [...items, ...nestedIssues(items)];
  }, [data]);
  const openWorkspaceIds = useOpenWorkspaceIdsByIssueId(keyStatus?.hasKey === true && !!data, lookupIssues);
  const visibleIssues = useMemo(
    () =>
      sortIssues(filterIssues(data?.items ?? [], { query, status }), { field: sortField, direction: sortDirection }),
    [data, query, status, sortField, sortDirection],
  );
  const columns = useMemo(() => {
    const byStatus = new Map<string, IssueSummary[]>();
    for (const issue of visibleIssues) {
      const column = byStatus.get(issue.status) ?? [];
      column.push(issue);
      byStatus.set(issue.status, column);
    }
    // Only statuses with tickets get a column, in workflow order (unknown statuses last).
    const order = data?.statuses ?? [];
    const rank = (status: string) => {
      const index = order.indexOf(status);
      return index === -1 ? order.length : index;
    };
    return Array.from(byStatus.entries())
      .map(([status, items]) => ({ status, items }))
      .sort((a, b) => rank(a.status) - rank(b.status));
  }, [data, visibleIssues]);
  const counts = useMemo(() => statusCounts(data?.items ?? []), [data]);
  const [picker, setPicker] = useState<PickerState>(null);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [panelWidth, setPanelWidth] = useState(PANEL_DEFAULT_WIDTH);
  const hydrated = useRef(false);
  // Restore the remembered view once; after that local state is the source of truth.
  useEffect(() => {
    if (!settings || hydrated.current) return;
    hydrated.current = true;
    const { ui } = settings;
    if (ui.status !== undefined) setStatus(ui.status);
    if (ui.sortField) setSortField(ui.sortField);
    if (ui.sortDirection) setSortDirection(ui.sortDirection);
    if (ui.panelWidth) setPanelWidth(ui.panelWidth);
    if (ui.view) setView(ui.view);
    if (ui.hiddenColumns) setHiddenColumns(ui.hiddenColumns);
  }, [settings]);
  useEffect(() => {
    if (!hydrated.current) return;
    const timer = setTimeout(() => {
      void saveSettings({ ui: { status, sortField, sortDirection, panelWidth, view, hiddenColumns } }).catch(() => undefined);
    }, 500);
    return () => clearTimeout(timer);
  }, [status, sortField, sortDirection, panelWidth, view, hiddenColumns, saveSettings]);
  const [contentWidth, setContentWidth] = useState(0);
  // Looked up live off `data` each render rather than snapshotting the clicked IssueSummary, so a
  // background refetch (e.g. window refocus) updates the open panel's status/PR list instead of
  // leaving it stuck on what the card looked like at click time.
  const selectedIssue = selectedIssueId ? (data?.items.find((item) => item.id === selectedIssueId) ?? null) : null;

  const styles = useMemo(
    () => ({
      screen: {
        flex: 1,
        width: "100%" as const,
        backgroundColor: theme.colors.surface0,
      },
      header: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        justifyContent: "space-between" as const,
        gap: 12,
        paddingHorizontal: layout.compact ? 16 : 24,
        paddingTop: layout.compact ? 20 : 32,
      },
      headerTitle: { color: theme.colors.foreground, fontSize: layout.compact ? 18 : 22, fontWeight: "700" as const },
      headerEyebrow: { color: theme.colors.foregroundMuted, fontSize: 10, fontWeight: "700" as const, letterSpacing: 1.6 },
      pill: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: theme.colors.border,
      },
      dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: theme.colors.statusSuccess },
      toolbar: {
        gap: 10,
        paddingHorizontal: layout.compact ? 16 : 24,
        paddingTop: 12,
      },
      toolbarRow: { flexDirection: "row" as const, flexWrap: "wrap" as const, alignItems: "center" as const, gap: 8 },
      search: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 8,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface1,
      },
      searchInput: { flex: 1, color: theme.colors.foreground, fontSize: 14, padding: 0 },
      meta: { flexDirection: "row" as const, flexWrap: "wrap" as const, alignItems: "center" as const, gap: 6 },
      metaText: { color: theme.colors.foregroundMuted, fontSize: 12 },
      cardTop: { flexDirection: "row" as const, alignItems: "center" as const, gap: 6 },
      identifier: { color: theme.colors.accent, fontSize: 12, fontFamily: "monospace" },
      content: { flex: 1, flexDirection: "row" as const, width: "100%" as const },
      board: {
        flex: 1,
        flexDirection: "row" as const,
        padding: layout.compact ? 16 : 24,
        gap: layout.compact ? 12 : 16,
      },
      column: {
        flexGrow: 1,
        flexShrink: 1,
        flexBasis: layout.compact ? 240 : 280,
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
      cardBody: { flex: 1, gap: 6 },
      relatedCard: {
        padding: 8,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface1,
        gap: 4,
      },
      nestedRow: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8 },
      cardRow: { flexDirection: "row" as const, alignItems: "flex-start" as const, gap: 8 },
      listHeader: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 10,
        paddingHorizontal: layout.compact ? 12 : 16,
        paddingVertical: 6,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
        backgroundColor: theme.colors.surface1,
      },
      listHeaderText: { color: theme.colors.foregroundMuted, fontSize: 11, fontWeight: "700" as const, letterSpacing: 0.8 },
      listRow: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 10,
        paddingHorizontal: layout.compact ? 12 : 16,
        paddingVertical: 8,
      },
      listCellText: { color: theme.colors.foregroundMuted, fontSize: 12 },
      prLink: { flexDirection: "row" as const, alignItems: "center" as const, gap: 4 },
      prLinkText: { fontSize: 12 },
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
      setPicker({ kind: "configure", issue, projects });
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
        <ConnectCard
          theme={theme}
          onSaved={() =>
            Promise.all([
              queryClient.invalidateQueries({ queryKey: ["linear", "hasApiKey"] }),
              queryClient.invalidateQueries({ queryKey: ["linear", "connection"] }),
            ])
          }
        />
      </View>
    );
  }

  function renderPrLinks(issue: IssueSummary) {
    return issue.prs.map((pr) => (
      <Press
        key={pr.url}
        style={styles.prLink}
        accessibilityRole="link"
        onPress={(event) => {
          event.stopPropagation();
          Linking.openURL(pr.url);
        }}
      >
        <Icon name={PR_INDICATOR[pr.state].icon} size={14} color={prColor(theme, pr.state)} />
        <Text style={[styles.prLinkText, { color: prColor(theme, pr.state) }]}>
          PR #{pr.number} {PR_INDICATOR[pr.state].label}
        </Text>
      </Press>
    ));
  }

  function renderWorkspaceButton(issue: IssueSummary, small = false) {
    const workspaceId = openWorkspaceIds.get(issue.id);
    return workspaceId ? (
      <IconButton
        colors={theme.colors}
        icon="ArrowRight"
        small={small}
        label={`Go to workspace for ${issue.identifier}`}
        onPress={() => navigation?.openWorkspace({ workspaceId })}
      />
    ) : (
      <IconButton
        colors={theme.colors}
        icon={startingId === issue.id ? "Loader" : "Plus"}
        label={`Create workspace for ${issue.identifier}`}
        primary
        small={small}
        disabled={startingId === issue.id}
        onPress={() => void handleStartWorkspace(issue)}
      />
    );
  }

  function renderPickerMessage(issue: IssueSummary) {
    if (picker?.kind === "empty" && picker.issueId === issue.id) {
      return (
        <View style={styles.messageRow}>
          <Icon name="FolderX" size={14} color={theme.colors.foregroundMuted} />
          <Text style={styles.message}>No projects available to create a workspace.</Text>
        </View>
      );
    }
    if (picker?.kind === "error" && picker.issueId === issue.id) {
      return (
        <View style={styles.messageRow}>
          <Icon name="AlertCircle" size={14} color={theme.colors.statusDanger} />
          <Text style={styles.message}>{picker.message}</Text>
        </View>
      );
    }
    return null;
  }

  function renderCard(issue: IssueSummary) {
    return (
      <Press
        key={issue.id}
        style={styles.row}
        hoverStyle={{ backgroundColor: theme.colors.surface2 }}
        accessibilityRole="button"
        accessibilityLabel={`Open details for ${issue.identifier}`}
        onPress={() => setSelectedIssueId(issue.id)}
      >
        <View style={styles.cardRow}>
          <View style={styles.cardBody}>
            <View style={styles.cardTop}>
              <PriorityMark colors={theme.colors} priority={issue.priority} />
              <Text style={styles.identifier}>{issue.identifier}</Text>
              {issue.project ? <Text style={styles.subtitle}>· {issue.project}</Text> : null}
            </View>
            <Text style={styles.title}>{issue.title}</Text>
            {issue.labels.length > 0 || issue.dueDate || issue.estimate ? (
              <View style={styles.meta}>
                {issue.labels.slice(0, 2).map((label) => (
                  <LabelChip key={label} colors={theme.colors} label={label} />
                ))}
                {issue.labels.length > 2 ? <Text style={styles.metaText}>+{issue.labels.length - 2}</Text> : null}
                {issue.dueDate ? (
                  <Text style={[styles.metaText, { color: theme.colors.accent }]}>Due {formatDueDate(issue.dueDate)}</Text>
                ) : null}
                {issue.estimate ? <Text style={styles.metaText}>{issue.estimate} pts</Text> : null}
              </View>
            ) : null}
            {renderPrLinks(issue)}
          </View>
          {renderWorkspaceButton(issue)}
        </View>
        {renderPickerMessage(issue)}
      </Press>
    );
  }

  /** A blocker/blocked ticket as its own compact card: number, title and a small create/open workspace button. */
  function renderRelatedCard(ref: Blocker, kind: "blockedBy" | "blocks") {
    const nested = blockerToIssue(ref, data?.items ?? []);
    const blocker = kind === "blockedBy";
    return (
      <View style={styles.relatedCard}>
        <View style={styles.nestedRow}>
          <Icon
            name={blocker ? "Lock" : "ArrowRightFromLine"}
            size={13}
            color={blocker ? theme.colors.statusDanger : theme.colors.foregroundMuted}
          />
          <Text style={styles.identifier}>{ref.identifier}</Text>
          <Text style={[styles.metaText, { flex: 1, color: theme.colors.foreground }]} numberOfLines={1}>
            {ref.title}
          </Text>
          {renderWorkspaceButton(nested, true)}
        </View>
        {renderPickerMessage(nested)}
      </View>
    );
  }

  /**
   * Board entry for one ticket. Its blockers stack above it with the ticket nested beneath the last one; anything it
   * blocks hangs below it, each joined by a dotted "L" from the ticket above.
   */
  function renderCardGroup(issue: IssueSummary) {
    const mainDepth = issue.blockedBy.length > 0 ? 1 : 0;
    return (
      <View key={issue.id} style={{ gap: TREE_GAP }}>
        {issue.blockedBy.map((ref) => (
          <View key={ref.id}>{renderRelatedCard(ref, "blockedBy")}</View>
        ))}
        <View style={{ paddingLeft: mainDepth * TREE_INDENT }}>
          {mainDepth > 0 ? <TreeConnector colors={theme.colors} parentDepth={0} last /> : null}
          {renderCard(issue)}
        </View>
        {issue.blocks.map((ref, index) => (
          <View key={ref.id} style={{ paddingLeft: (mainDepth + 1) * TREE_INDENT }}>
            <TreeConnector colors={theme.colors} parentDepth={mainDepth} last={index === issue.blocks.length - 1} />
            {renderRelatedCard(ref, "blocks")}
          </View>
        ))}
      </View>
    );
  }

  /** Column widths shared by the header and every row so the table lines up; `flex` marks the one that stretches. */
  const listColumns = [
    { key: "status", title: "", width: 18 },
    { key: "priority", title: "", width: 18, label: "Priority" },
    { key: "id", title: "ID", width: 72 },
    { key: "title", title: "TITLE", flex: true },
    { key: "labels", title: "LABELS", width: 170, wideOnly: true, label: "Labels" },
    { key: "project", title: "PROJECT", width: 120, wideOnly: true, label: "Project" },
    { key: "state", title: "STATUS", width: 110, wideOnly: true, label: "Status" },
    { key: "due", title: "DUE", width: 56, wideOnly: true, label: "Due" },
    { key: "prs", title: "PRS", width: 120, label: "PRs" },
    { key: "action", title: "", width: 30 },
  ];
  /** Columns the user can switch off carry a `label`; status, ID, title and the workspace button are always shown. */
  const toggleableColumns = listColumns.filter((column) => column.label);
  const shownColumns = listColumns.filter(
    (column) => (!column.wideOnly || !layout.compact) && !hiddenColumns.includes(column.key),
  );
  function toggleColumn(key: string) {
    setHiddenColumns((hidden) => (hidden.includes(key) ? hidden.filter((item) => item !== key) : [...hidden, key]));
  }

  function cellStyle(column: { width?: number; flex?: boolean }) {
    return column.flex ? { flex: 1, minWidth: 0 } : { width: column.width };
  }

  function renderListCell(key: string, issue: IssueSummary) {
    switch (key) {
      case "status":
        return <StatusMark colors={theme.colors} stateType={issue.stateType} />;
      case "priority":
        return <PriorityMark colors={theme.colors} priority={issue.priority} />;
      case "id":
        return <Text style={styles.identifier}>{issue.identifier}</Text>;
      case "title":
        return (
          <Text style={[styles.title, { fontSize: 14, fontWeight: "400" }]} numberOfLines={1}>
            {issue.title}
          </Text>
        );
      case "labels":
        return (
          <View style={styles.meta}>
            {issue.labels.slice(0, 2).map((label) => (
              <LabelChip key={label} colors={theme.colors} label={label} />
            ))}
            {issue.labels.length > 2 ? <Text style={styles.metaText}>+{issue.labels.length - 2}</Text> : null}
          </View>
        );
      case "project":
        return (
          <Text style={styles.listCellText} numberOfLines={1}>
            {issue.project ?? ""}
          </Text>
        );
      case "state":
        return (
          <Text style={styles.listCellText} numberOfLines={1}>
            {issue.status}
          </Text>
        );
      case "due":
        return <Text style={styles.listCellText}>{issue.dueDate ? formatDueDate(issue.dueDate) : ""}</Text>;
      case "prs":
        return <View style={{ gap: 2 }}>{renderPrLinks(issue)}</View>;
      default:
        return renderWorkspaceButton(issue);
    }
  }

  function renderListHeader() {
    return (
      <View style={styles.listHeader}>
        {shownColumns.map((column) => (
          <View key={column.key} style={cellStyle(column)}>
            <Text style={styles.listHeaderText}>{column.title}</Text>
          </View>
        ))}
      </View>
    );
  }

  const listPadding = layout.compact ? 12 : 16;

  function renderListRow(issue: IssueSummary, indent: number) {
    return (
      <View>
        <Press
          style={[styles.listRow, { paddingLeft: listPadding + indent + (indent > 0 ? TREE_CONTENT_PAD : 0) }]}
          hoverStyle={{ backgroundColor: theme.colors.surface1 }}
          accessibilityRole="button"
          accessibilityLabel={`Open details for ${issue.identifier}`}
          onPress={() => setSelectedIssueId(issue.id)}
        >
          {shownColumns.map((column) => (
            <View key={column.key} style={cellStyle(column)}>
              {renderListCell(column.key, issue)}
            </View>
          ))}
        </Press>
        {renderPickerMessage(issue)}
      </View>
    );
  }

  /** Blocker/blocked ticket as a compact table row: number, title and a small workspace button at the right edge. */
  function renderRelatedRow(ref: Blocker, kind: "blockedBy" | "blocks", depth: number) {
    const nested = blockerToIssue(ref, data?.items ?? []);
    const blocker = kind === "blockedBy";
    return (
      <View>
        <View style={[styles.listRow, { paddingLeft: listPadding + depth * TREE_INDENT + (depth > 0 ? TREE_CONTENT_PAD : 0) }]}>
          <Icon
            name={blocker ? "Lock" : "ArrowRightFromLine"}
            size={13}
            color={blocker ? theme.colors.statusDanger : theme.colors.foregroundMuted}
          />
          <Text style={styles.identifier}>{ref.identifier}</Text>
          <Text style={[styles.metaText, { flexShrink: 1, color: theme.colors.foreground }]} numberOfLines={1}>
            {ref.title}
          </Text>
          {renderWorkspaceButton(nested, true)}
        </View>
        {renderPickerMessage(nested)}
      </View>
    );
  }

  /** Same tree as the board: blockers above, the ticket nested under them, blocked tickets below, joined by dotted "L" lines. */
  function renderListGroup(issue: IssueSummary) {
    const mainDepth = issue.blockedBy.length > 0 ? 1 : 0;
    return (
      <View key={issue.id} style={{ borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
        {issue.blockedBy.map((ref) => (
          <View key={ref.id}>{renderRelatedRow(ref, "blockedBy", 0)}</View>
        ))}
        <View>
          {renderListRow(issue, mainDepth * TREE_INDENT)}
          {/* After the row so its hover background doesn't paint over the line. */}
          {mainDepth > 0 ? (
            <TreeConnector colors={theme.colors} parentDepth={0} last offset={listPadding} gap={0} />
          ) : null}
        </View>
        {issue.blocks.map((ref, index) => (
          <View key={ref.id}>
            {renderRelatedRow(ref, "blocks", mainDepth + 1)}
            <TreeConnector
              colors={theme.colors}
              parentDepth={mainDepth}
              last={index === issue.blocks.length - 1}
              offset={listPadding}
              gap={0}
            />
          </View>
        ))}
      </View>
    );
  }

  // Waiting for saved view state too, so it can't overwrite a choice made before it arrives.
  if (isLoading || isSettingsLoading) {
    return (
      <View style={[styles.screen, styles.board]}>
        {[0, 1, 2].map((column) => (
          <View key={column} style={styles.column}>
            <Skeleton colors={theme.colors} height={14} width="40%" />
            <Skeleton colors={theme.colors} height={84} />
            <Skeleton colors={theme.colors} height={84} />
          </View>
        ))}
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.screen}>
        <EmptyState
          colors={theme.colors}
          icon="AlertCircle"
          title="Could not load Linear issues"
          hint={error instanceof Error ? error.message : undefined}
          action={{ label: "Retry", onPress: () => void refetch() }}
        />
      </View>
    );
  }

  const filtersActive = hasActiveFilters({ query, status });
  const noIssuesAtAll = (data?.items.length ?? 0) === 0 && !filtersActive;

  function clearFilters() {
    setQuery("");
    setStatus(null);
  }

  const totalCount = data?.items.length ?? 0;
  // A remembered status that no longer has tickets stays visible (and selected) so an empty board has a visible cause.
  const statusChips = (data?.statuses ?? []).filter((name) => counts.has(name) || name === status);
  if (status !== null && !statusChips.includes(status)) statusChips.push(status);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerEyebrow}>LINEAR · MY WORK</Text>
          <Text style={styles.headerTitle}>Assigned to me</Text>
        </View>
        <View style={styles.toolbarRow}>
          {connection?.connected ? (
            <View style={styles.pill}>
              <View style={styles.dot} />
              <Text style={styles.metaText}>{connection.source === "environment" ? "Host key" : "Connected"}</Text>
            </View>
          ) : null}
          <Segmented
            colors={theme.colors}
            value={view}
            options={[
              { label: "Board", value: "board" },
              { label: "List", value: "list" },
            ]}
            onChange={setView}
          />
          <Chip
            colors={theme.colors}
            label="Refresh"
            leading="RefreshCw"
            spinning={isFetching}
            onPress={() => {
              void queryClient.invalidateQueries({ queryKey: ["linear", "myIssues"] });
              void invalidateWorkspaceQueries();
            }}
          />
        </View>
      </View>
      <View style={styles.toolbar}>
        <View style={styles.search}>
          <Icon name="Search" size={14} color={theme.colors.foregroundMuted} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search by number, title, project, label…"
            placeholderTextColor={theme.colors.foregroundMuted}
            accessibilityLabel="Search issues"
          />
          {query ? (
            <Press accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setQuery("")}>
              <Icon name="X" size={14} color={theme.colors.foregroundMuted} />
            </Press>
          ) : null}
        </View>
        <View style={styles.toolbarRow}>
          <Chip colors={theme.colors} label={`All · ${totalCount}`} chosen={status === null} onPress={() => setStatus(null)} />
          {statusChips.map((name) => (
            <Chip
              key={name}
              colors={theme.colors}
              label={`${name} · ${counts.get(name)}`}
              chosen={status === name}
              onPress={() => setStatus(status === name ? null : name)}
            />
          ))}
        </View>
        <View style={styles.toolbarRow}>
          <Segmented
            colors={theme.colors}
            value={sortField}
            options={[
              { label: "Updated", value: "updated" },
              { label: "Created", value: "created" },
              { label: "Due", value: "due" },
              { label: "Priority", value: "priority" },
            ]}
            onChange={setSortField}
          />
          <Segmented
            colors={theme.colors}
            value={sortDirection}
            options={
              sortField === "due"
                ? [
                    { label: "Latest", value: "newest" },
                    { label: "Soonest", value: "oldest" },
                  ]
                : sortField === "priority"
                  ? [
                      { label: "Highest", value: "newest" },
                      { label: "Lowest", value: "oldest" },
                    ]
                  : [
                      { label: "Newest", value: "newest" },
                      { label: "Oldest", value: "oldest" },
                    ]
            }
            onChange={setSortDirection}
          />
          {view === "list" ? (
            <Chip
              colors={theme.colors}
              label="Columns"
              leading="Columns3"
              chosen={columnPickerOpen}
              onPress={() => setColumnPickerOpen((open) => !open)}
            />
          ) : null}
          {filtersActive ? <Chip colors={theme.colors} label="Clear filters" leading="X" onPress={clearFilters} /> : null}
          <Text style={styles.metaText}>
            {visibleIssues.length} of {totalCount} tickets
          </Text>
        </View>
        {view === "list" && columnPickerOpen ? (
          <View style={styles.toolbarRow}>
            {toggleableColumns.map((column) => (
              <Chip
                key={column.key}
                colors={theme.colors}
                label={column.label ?? column.key}
                leading={hiddenColumns.includes(column.key) ? "Square" : "SquareCheck"}
                chosen={!hiddenColumns.includes(column.key)}
                onPress={() => toggleColumn(column.key)}
              />
            ))}
          </View>
        ) : null}
      </View>
      {notice ? (
        <View style={[styles.toolbar, styles.toolbarRow]}>
          <Icon name="AlertCircle" size={14} color={theme.colors.statusWarning} />
          <Text style={[styles.metaText, { flexShrink: 1, color: theme.colors.foreground }]}>{notice}</Text>
          <Press accessibilityRole="button" accessibilityLabel="Dismiss" onPress={() => setNotice(null)}>
            <Icon name="X" size={14} color={theme.colors.foregroundMuted} />
          </Press>
        </View>
      ) : null}
      {columns.length === 0 ? (
        <EmptyState
          colors={theme.colors}
          icon={noIssuesAtAll ? "Inbox" : "SearchX"}
          title={noIssuesAtAll ? "No assigned issues" : "No tickets match these filters"}
          action={noIssuesAtAll ? undefined : { label: "Clear filters", onPress: clearFilters }}
        />
      ) : (
      <View style={styles.content} onLayout={(event: LayoutChangeEvent) => setContentWidth(event.nativeEvent.layout.width)}>
        {view === "list" ? (
          <View style={[styles.columnScroll, { marginTop: 16 }]}>
            {renderListHeader()}
            <ScrollView style={styles.columnScroll}>{visibleIssues.map(renderListGroup)}</ScrollView>
          </View>
        ) : (
        <View style={styles.board}>
          {columns.map(({ status: columnStatus, items }) => (
            <View key={columnStatus} style={styles.column}>
              <View style={styles.cardTop}>
                <StatusMark colors={theme.colors} stateType={items[0]?.stateType} />
                <Text style={styles.columnHeader}>
                  {columnStatus.toUpperCase()} · {items.length}
                </Text>
              </View>
              <ScrollView style={styles.columnScroll} contentContainerStyle={styles.columnList}>
                {items.map(renderCardGroup)}
              </ScrollView>
            </View>
          ))}
        </View>
        )}
        {selectedIssue ? (
          <IssueSidePanel
            theme={theme}
            issue={selectedIssue}
            fetchIssueDetail={fetchIssueDetail}
            onClose={() => setSelectedIssueId(null)}
            width={panelWidth}
            onWidthChange={setPanelWidth}
            containerWidth={contentWidth}
          />
        ) : null}
      </View>
      )}
      {picker?.kind === "configure" ? (
        <CreateWorkspaceDialog
          theme={theme}
          issue={picker.issue}
          projects={picker.projects}
          fetchBranchExists={fetchBranchExists}
          fetchListBranches={fetchListBranches}
          fetchDefaultProfile={fetchDefaultProfile}
          fetchLastWorkspaceSettings={fetchLastWorkspaceSettings}
          saveLastWorkspaceSettings={saveLastWorkspaceSettings}
          onCancel={() => setPicker(null)}
          onCreated={(workspaceId, warning) => {
            void invalidateWorkspaceQueries();
            // The ticket may have just moved to In Progress.
            void queryClient.invalidateQueries({ queryKey: ["linear", "myIssues"] });
            setNotice(warning ?? null);
            setPicker(null);
            navigation?.openWorkspace({ workspaceId });
          }}
        />
      ) : null}
    </View>
  );
}

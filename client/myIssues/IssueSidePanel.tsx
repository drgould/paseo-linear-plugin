import type { PluginTheme, RpcInput, RpcOutput } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef } from "react";
import { Linking, PanResponder, Platform, Pressable, ScrollView, Text, View, type ViewStyle } from "react-native";
import type { issueDetailRpc } from "../../shared/issueDetail";
import type { IssueRef, IssueSummary } from "../../shared/types";
import { MarkdownText } from "./Markdown";
import { trackWindowDrag } from "../web";
import { PR_INDICATOR, prColor } from "./prIndicator";

type FetchIssueDetail = (input: RpcInput<typeof issueDetailRpc>) => Promise<RpcOutput<typeof issueDetailRpc>>;

export const PANEL_MIN_WIDTH = 280;
export const PANEL_DEFAULT_WIDTH = 380;
/** Columns have no minimum and reflow to whatever's left, so the panel's only ceiling is the handle staying on-screen. */
const HANDLE_RESERVED_WIDTH = 24;

/** react-native-web supports "col-resize" at runtime; RN's ViewStyle types only list "auto"/"pointer". */
const HANDLE_CURSOR_STYLE = { cursor: "col-resize" } as unknown as ViewStyle;

interface IssueSidePanelProps {
  theme: PluginTheme;
  issue: IssueSummary;
  fetchIssueDetail: FetchIssueDetail;
  onClose: () => void;
  width: number;
  onWidthChange: (width: number) => void;
  /** Width of the row this panel shares with the board — not the OS/browser window, which can be wider than the surface's own pane. */
  containerWidth: number;
}

function IssueRefRow({ theme, label, issue }: { theme: PluginTheme; label: string; issue: IssueRef }) {
  return (
    <Pressable accessibilityRole="link" onPress={() => Linking.openURL(issue.url)} style={{ gap: 2 }}>
      <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>{label}</Text>
      <Text style={{ color: theme.colors.accent, fontSize: 14 }}>
        {issue.identifier} · {issue.title}
      </Text>
    </Pressable>
  );
}

/** Docked detail column for a clicked kanban card: pushes the board over rather than floating above it, and its width is user-draggable via the left-edge handle. */
export function IssueSidePanel({
  theme,
  issue,
  fetchIssueDetail,
  onClose,
  width,
  onWidthChange,
  containerWidth,
}: IssueSidePanelProps) {
  const {
    data: detail,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["linear", "issueDetail", issue.id],
    queryFn: () => fetchIssueDetail({ id: issue.id }),
  });

  const widthRef = useRef(width);
  widthRef.current = width;
  const dragStartWidthRef = useRef(width);

  const maxWidthRef = useRef(0);
  maxWidthRef.current = Math.max(PANEL_MIN_WIDTH, containerWidth - HANDLE_RESERVED_WIDTH);

  function clampWidth(next: number): number {
    return Math.min(maxWidthRef.current, Math.max(PANEL_MIN_WIDTH, next));
  }

  // Reclamps against the container on every render (not just mid-drag), so a stored width that no
  // longer fits — e.g. the window shrank while the panel was closed — never renders wider than
  // what's actually available.
  const displayWidth = clampWidth(width);

  // Native's touch responder system keeps routing moves to the view that started the gesture
  // no matter where the finger travels, so PanResponder alone is enough on mobile.
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        dragStartWidthRef.current = widthRef.current;
      },
      onPanResponderMove: (_event, gesture) => {
        onWidthChange(clampWidth(dragStartWidthRef.current - gesture.dx));
      },
    }),
  ).current;

  // On web a fast drag outruns the 6px handle's hover area, so mousemove has to be tracked on
  // the whole window instead of the handle element — see client/web.ts. Ends any drag still live
  // from a previous mousedown first — if the mouse was released outside the window, that drag's
  // own mouseup never fired to clean itself up.
  const activeDragEndRef = useRef<(() => void) | null>(null);
  const dragHandlers =
    Platform.OS === "web"
      ? {
          onMouseDown: (event: { clientX: number; preventDefault: () => void }) => {
            event.preventDefault();
            activeDragEndRef.current?.();
            dragStartWidthRef.current = widthRef.current;
            const startX = event.clientX;
            activeDragEndRef.current = trackWindowDrag(
              (moveEvent) => onWidthChange(clampWidth(dragStartWidthRef.current - (moveEvent.clientX - startX))),
              () => {
                activeDragEndRef.current = null;
              },
            );
          },
        }
      : panResponder.panHandlers;

  const styles = useMemo(
    () => ({
      wrapper: { flexDirection: "row" as const, height: "100%" as const },
      handle: { width: 6, height: "100%" as const },
      handleBar: { width: 1, height: "100%" as const, backgroundColor: theme.colors.border },
      panel: {
        width: displayWidth,
        flex: 1,
        backgroundColor: theme.colors.surface1,
        padding: 20,
      },
      scroll: { flex: 1 },
      scrollContent: { gap: 14 },
      header: { flexDirection: "row" as const, alignItems: "flex-start" as const, justifyContent: "space-between" as const },
      identifier: { color: theme.colors.foregroundMuted, fontSize: 12 },
      title: { color: theme.colors.foreground, fontSize: 18, fontWeight: "600" as const },
      section: { gap: 6 },
      label: { color: theme.colors.foregroundMuted, fontSize: 12 },
      value: { color: theme.colors.foreground, fontSize: 14 },
      errorText: { color: theme.colors.statusDanger, fontSize: 14 },
      row: { flexDirection: "row" as const, gap: 16 },
      prLink: { flexDirection: "row" as const, alignItems: "center" as const, gap: 4 },
      prLinkText: { fontSize: 13 },
      link: { color: theme.colors.accent, fontSize: 13 },
    }),
    [theme, displayWidth],
  );

  return (
    <View style={styles.wrapper}>
      <View {...dragHandlers} style={[styles.handle, HANDLE_CURSOR_STYLE]}>
        <View style={styles.handleBar} />
      </View>
      <View style={styles.panel}>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <View style={{ gap: 2, flex: 1 }}>
              <Text style={styles.identifier}>{issue.identifier}</Text>
              <Text style={styles.title}>{issue.title}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose}>
              <Icon name="X" size={18} color={theme.colors.foregroundMuted} />
            </Pressable>
          </View>

          <View style={styles.row}>
            <View style={styles.section}>
              <Text style={styles.label}>Status</Text>
              <Text style={styles.value}>{issue.status}</Text>
            </View>
            {detail?.assignee ? (
              <View style={styles.section}>
                <Text style={styles.label}>Assignee</Text>
                <Text style={styles.value}>{detail.assignee}</Text>
              </View>
            ) : null}
            {detail?.project ? (
              <View style={styles.section}>
                <Text style={styles.label}>Project</Text>
                <Text style={styles.value}>{detail.project}</Text>
              </View>
            ) : null}
          </View>

          {detail?.labels.length ? (
            <View style={styles.section}>
              <Text style={styles.label}>Labels</Text>
              <Text style={styles.value}>{detail.labels.join(", ")}</Text>
            </View>
          ) : null}

          {issue.prs.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.label}>Pull requests</Text>
              {issue.prs.map((pr) => (
                <Pressable key={pr.url} style={styles.prLink} accessibilityRole="link" onPress={() => Linking.openURL(pr.url)}>
                  <Icon name={PR_INDICATOR[pr.state].icon} size={14} color={prColor(theme, pr.state)} />
                  <Text style={[styles.prLinkText, { color: prColor(theme, pr.state) }]}>
                    PR #{pr.number} {PR_INDICATOR[pr.state].label}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          {isLoading ? <Text style={styles.value}>Loading details…</Text> : null}
          {error ? <Text style={styles.errorText}>Could not load issue details.</Text> : null}

          {detail?.description ? (
            <View style={styles.section}>
              <Text style={styles.label}>Description</Text>
              <MarkdownText theme={theme} text={detail.description} />
            </View>
          ) : null}

          {detail?.parent ? (
            <View style={styles.section}>
              <IssueRefRow theme={theme} label="Parent" issue={detail.parent} />
            </View>
          ) : null}

          {detail && detail.children.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.label}>Sub-issues</Text>
              {detail.children.map((child) => (
                <IssueRefRow key={child.id} theme={theme} label={child.status} issue={child} />
              ))}
            </View>
          ) : null}

          {detail && detail.relations.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.label}>Relationships</Text>
              {detail.relations.map((relation, index) => (
                <IssueRefRow key={`${relation.issue.id}-${index}`} theme={theme} label={relation.label} issue={relation.issue} />
              ))}
            </View>
          ) : null}

          <Pressable accessibilityRole="link" onPress={() => Linking.openURL(issue.url)}>
            <Text style={styles.link}>Open in Linear</Text>
          </Pressable>
        </ScrollView>
      </View>
    </View>
  );
}

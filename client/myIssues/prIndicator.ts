import type { PluginTheme } from "@getpaseo/plugin";
import type { PrState } from "../../shared/types";

export const PR_INDICATOR: Record<PrState, { icon: string; label: string }> = {
  draft: { icon: "GitPullRequestDraft", label: "Draft" },
  open: { icon: "GitPullRequest", label: "Open" },
  merged: { icon: "GitMerge", label: "Merged" },
  closed: { icon: "GitPullRequestClosed", label: "Closed" },
};

export function prColor(theme: PluginTheme, state: PrState): string {
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

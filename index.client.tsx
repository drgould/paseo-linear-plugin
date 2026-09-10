import type { PluginClientContext } from "@getpaseo/plugin/client";
import { registerAttachments } from "./client/attachments";
import { LinearSettings } from "./client/settings";
import { registerIssuePanel } from "./client/panel/IssueDetailPanel";
import { registerMyIssues } from "./client/myIssues";

export default function contribute(client: PluginClientContext) {
  const cleanups: Array<() => void> = [
    registerAttachments(client),
    client.addSettingsScreen({
      id: "linear",
      title: "Linear",
      icon: "KeyRound",
      Component: LinearSettings,
    }),
    registerMyIssues(client),
    registerIssuePanel(client),
  ];
  return () => cleanups.forEach((fn) => fn());
}

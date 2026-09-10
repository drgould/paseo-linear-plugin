import type { PluginClientContext } from "@getpaseo/plugin/client";
import { registerAttachments } from "./client/attachments";
import { LinearSettings } from "./client/settings";

export default function contribute(client: PluginClientContext) {
  const cleanups: Array<() => void> = [
    registerAttachments(client),
    client.addSettingsScreen({
      id: "linear",
      title: "Linear",
      icon: "KeyRound",
      Component: LinearSettings,
    }),
    // TODO(issue 3): registerMyIssues(client),
    // TODO(issue 4): registerIssuePanel(client),
  ];
  return () => cleanups.forEach((fn) => fn());
}

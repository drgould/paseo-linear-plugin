import type { PluginClientContext } from "@getpaseo/plugin/client";

export default function contribute(client: PluginClientContext) {
  const cleanups: Array<() => void> = [
    // TODO(issue 2): registerAttachments(client),
    // TODO(issue 3): registerMyIssues(client),
    // TODO(issue 4): registerIssuePanel(client),
  ];
  return () => cleanups.forEach((fn) => fn());
}

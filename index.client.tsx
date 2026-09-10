import type { PluginClientContext } from "@getpaseo/plugin/client";
import { registerAttachments } from "./client/attachments";

export default function contribute(client: PluginClientContext) {
  const cleanups: Array<() => void> = [
    registerAttachments(client),
    // TODO(issue 3): registerMyIssues(client),
    // TODO(issue 4): registerIssuePanel(client),
  ];
  return () => cleanups.forEach((fn) => fn());
}

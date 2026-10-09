import type { PluginClientContext } from "@getpaseo/plugin/client";
import { registerAttachments } from "./client/attachments";
import { registerIssuePanel } from "./client/panel/IssueDetailPanel";
import { registerMyIssues } from "./client/myIssues";

export default function contribute(client: PluginClientContext) {
  const cleanups: Array<() => void> = [
    registerAttachments(client),
    registerMyIssues(client),
    registerIssuePanel(client),
  ];
  return () => cleanups.forEach((fn) => fn());
}

import type { PluginServerContext } from "@getpaseo/plugin/server";
import { searchIssuesRpc } from "./shared/issues";
import { searchIssues } from "./server/issues";
import { saveApiKeyRpc } from "./shared/settings";
import { saveApiKey } from "./server/settings";

export default function contribute(server: PluginServerContext) {
  server.handle(searchIssuesRpc, searchIssues);
  server.handle(saveApiKeyRpc, saveApiKey);
  // TODO(issue 3): server.handle(myIssuesRpc, listMyIssues);
  // TODO(issue 4): server.handle(issueDetailRpc, getIssueDetail);
  return () => {};
}

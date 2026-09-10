import type { PluginServerContext } from "@getpaseo/plugin/server";
import { searchIssuesRpc } from "./shared/issues";
import { searchIssues } from "./server/issues";
import { saveApiKeyRpc } from "./shared/settings";
import { saveApiKey } from "./server/settings";
import { getIssueDetail } from "./server/issueDetail";
import { issueDetailRpc } from "./shared/issueDetail";
import { listMyIssues } from "./server/myIssues";
import { myIssuesRpc } from "./shared/myIssues";

export default function contribute(server: PluginServerContext) {
  server.handle(searchIssuesRpc, searchIssues);
  server.handle(saveApiKeyRpc, saveApiKey);
  server.handle(myIssuesRpc, listMyIssues);
  server.handle(issueDetailRpc, getIssueDetail);
  return () => {};
}

import type { PluginServerContext } from "@getpaseo/plugin/server";
import { searchIssuesRpc } from "./shared/issues";
import { searchIssues } from "./server/issues";
import {
  hasApiKeyRpc,
  saveApiKeyRpc,
  getDefaultProfileRpc,
  saveDefaultProfileRpc,
  connectionRpc,
  disconnectRpc,
  getSettingsRpc,
  saveSettingsRpc,
  startIssueRpc,
} from "./shared/settings";
import {
  hasApiKey,
  connectApiKey,
  getDefaultProfile,
  saveDefaultProfile,
  getConnection,
  disconnect,
  getSettings,
  saveSettings,
} from "./server/settings";
import { startIssue } from "./server/startIssue";
import { getIssueDetail } from "./server/issueDetail";
import { issueDetailRpc } from "./shared/issueDetail";
import { listMyIssues } from "./server/myIssues";
import { myIssuesRpc } from "./shared/myIssues";
import { resolveGitRemoteOwners } from "./server/gitRemote";
import { gitRemoteOwnerRpc } from "./shared/gitRemote";
import { checkBranchExists } from "./server/branchExists";
import { branchExistsRpc } from "./shared/branchExists";
import { listBranches } from "./server/listBranches";
import { listBranchesRpc } from "./shared/listBranches";

export default function contribute(server: PluginServerContext) {
  server.handle(searchIssuesRpc, searchIssues);
  server.handle(saveApiKeyRpc, connectApiKey);
  server.handle(connectionRpc, getConnection);
  server.handle(disconnectRpc, disconnect);
  server.handle(getSettingsRpc, getSettings);
  server.handle(saveSettingsRpc, saveSettings);
  server.handle(startIssueRpc, startIssue);
  server.handle(hasApiKeyRpc, hasApiKey);
  server.handle(getDefaultProfileRpc, getDefaultProfile);
  server.handle(saveDefaultProfileRpc, saveDefaultProfile);
  server.handle(myIssuesRpc, listMyIssues);
  server.handle(issueDetailRpc, getIssueDetail);
  server.handle(gitRemoteOwnerRpc, resolveGitRemoteOwners);
  server.handle(branchExistsRpc, checkBranchExists);
  server.handle(listBranchesRpc, listBranches);
  return () => {};
}

import type { PluginServerContext } from "@getpaseo/plugin/server";
import { searchIssuesRpc } from "./shared/issues";
import { searchIssues } from "./server/issues";
import { hasApiKeyRpc, saveApiKeyRpc, getDefaultProfileRpc, saveDefaultProfileRpc } from "./shared/settings";
import { hasApiKey, saveApiKey, getDefaultProfile, saveDefaultProfile } from "./server/settings";
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
  server.handle(saveApiKeyRpc, saveApiKey);
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

import type { PluginTheme, RpcInput, RpcOutput } from "@getpaseo/plugin";
import { usePaseo, useRpc } from "@getpaseo/plugin/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { renderPromptTemplate } from "../../shared/promptTemplate";
import { ChoicePicker } from "./ChoicePicker";
import { Press } from "./ui";
import type { branchExistsRpc } from "../../shared/branchExists";
import type { listBranchesRpc } from "../../shared/listBranches";
import {
  type getDefaultProfileRpc,
  type getLastWorkspaceSettingsRpc,
  getSettingsRpc,
  type saveLastWorkspaceSettingsRpc,
  startIssueRpc,
} from "../../shared/settings";
import type { IssueSummary } from "../../shared/types";
import {
  type BranchSourceOverride,
  findActiveGithubPr,
  type LinearProject,
  startWorkspaceForIssue,
} from "./createWorkspace";

type FetchBranchExists = (input: RpcInput<typeof branchExistsRpc>) => Promise<RpcOutput<typeof branchExistsRpc>>;
type FetchListBranches = (input: RpcInput<typeof listBranchesRpc>) => Promise<RpcOutput<typeof listBranchesRpc>>;
type FetchDefaultProfile = (
  input: RpcInput<typeof getDefaultProfileRpc>,
) => Promise<RpcOutput<typeof getDefaultProfileRpc>>;

type FetchLastWorkspaceSettings = (
  input: RpcInput<typeof getLastWorkspaceSettingsRpc>,
) => Promise<RpcOutput<typeof getLastWorkspaceSettingsRpc>>;
type SaveLastWorkspaceSettings = (
  input: RpcInput<typeof saveLastWorkspaceSettingsRpc>,
) => Promise<RpcOutput<typeof saveLastWorkspaceSettingsRpc>>;

const AUTO_PROFILE = "";
const BRANCH_AUTO = "auto";
const BRANCH_NEW = "new";
const BRANCH_EXISTING = "existing";

function describeError(caught: unknown): string {
  return caught instanceof Error ? caught.message : "Could not create workspace.";
}

function Field({ label, theme, children }: { label: string; theme: PluginTheme; children: ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Text
        style={{
          color: theme.colors.foregroundMuted,
          fontSize: 12,
          fontWeight: "600",
        }}
      >
        {label}
      </Text>
      {children}
    </View>
  );
}

interface CreateWorkspaceDialogProps {
  theme: PluginTheme;
  issue: IssueSummary;
  projects: LinearProject[];
  fetchBranchExists: FetchBranchExists;
  fetchListBranches: FetchListBranches;
  fetchDefaultProfile: FetchDefaultProfile;
  fetchLastWorkspaceSettings: FetchLastWorkspaceSettings;
  saveLastWorkspaceSettings: SaveLastWorkspaceSettings;
  onCancel: () => void;
  /** `warning` is set when the workspace was created but moving the ticket to In Progress failed. */
  onCreated: (workspaceId: string, warning?: string) => void;
}

/** Mirrors Paseo's native "new workspace" dialog (project, agent profile, branch source) plus an editable prompt prefilled from the launch prompt template setting. */
export function CreateWorkspaceDialog({
  theme,
  issue,
  projects,
  fetchBranchExists,
  fetchListBranches,
  fetchDefaultProfile,
  fetchLastWorkspaceSettings,
  saveLastWorkspaceSettings,
  onCancel,
  onCreated,
}: CreateWorkspaceDialogProps) {
  const paseo = usePaseo();
  const queryClient = useQueryClient();
  const { data: config, isLoading: isConfigLoading } = useQuery({
    queryKey: ["linear", "daemonConfig"],
    queryFn: () => paseo.config.get(),
  });
  const fetchSettings = useRpc(getSettingsRpc);
  const startIssue = useRpc(startIssueRpc);
  const { data: settings, isLoading: isSettingsLoading } = useQuery({
    queryKey: ["linear", "settings"],
    queryFn: () => fetchSettings({}),
  });
  const { data: defaultProfile, isLoading: isDefaultProfileLoading } = useQuery({
    queryKey: ["linear", "defaultProfile"],
    queryFn: () => fetchDefaultProfile({}),
  });

  const { data: lastUsed, isLoading: isLastUsedLoading } = useQuery({
    queryKey: ["linear", "lastWorkspaceSettings"],
    queryFn: () => fetchLastWorkspaceSettings({}),
    retry: false,
  });

  const [projectId, setProjectId] = useState(projects[0]?.projectId ?? "");
  const [profileId, setProfileId] = useState(AUTO_PROFILE);
  const [profileTouched, setProfileTouched] = useState(false);
  const [projectTouched, setProjectTouched] = useState(false);
  const [branchMode, setBranchMode] = useState(BRANCH_NEW);
  const [branchModeTouched, setBranchModeTouched] = useState(false);
  const [existingBranchRef, setExistingBranchRef] = useState("");
  const [baseBranch, setBaseBranch] = useState("");
  /** `null` until the user edits, so the field follows the saved template until then. */
  const [promptDraft, setPromptDraft] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const prompt = promptDraft ?? renderPromptTemplate(settings?.promptTemplate, issue);
  const activePr = findActiveGithubPr(issue);
  const project = projects.find((entry) => entry.projectId === projectId);
  const { data: branchExists, isLoading: isBranchExistsLoading } = useQuery({
    queryKey: ["linear", "branchExists", project?.projectRootPath, issue.branchName],
    queryFn: () =>
      fetchBranchExists({
        projectRootPath: project!.projectRootPath,
        branchName: issue.branchName,
      }),
    enabled: !activePr && !!project,
  });
  /** Whether there's actually something to "continue" — omits that option when a fresh/existing branch is the only sensible choice. */
  const hasExistingWork = !!activePr || !!branchExists?.exists;
  /** Blocks Create until the defaults it would otherwise silently submit (profile, auto branch mode) have resolved. */
  // Settings carry the launch prompt and Mark In Progress, so creating before they load would silently skip both.
  const pendingDefaults =
    (!profileTouched &&
      (isDefaultProfileLoading || isLastUsedLoading || (!!lastUsed?.settings?.profileId && isConfigLoading))) ||
    (!projectTouched && isLastUsedLoading) ||
    (!branchModeTouched && isBranchExistsLoading) ||
    isSettingsLoading;
  const { data: branchList } = useQuery({
    queryKey: ["linear", "listBranches", project?.projectRootPath],
    queryFn: () => fetchListBranches({ projectRootPath: project!.projectRootPath }),
    enabled: !!project,
  });

  const lastSettings = lastUsed?.settings;
  const lastProfileId = lastSettings?.profileId ?? AUTO_PROFILE;
  // Last-used agent beats the saved default, but only while that profile still exists.
  const lastProfileValid =
    !!lastSettings &&
    (lastProfileId === AUTO_PROFILE || !!config?.config.agentProfiles?.some((entry) => entry.id === lastProfileId));

  useEffect(() => {
    if (profileTouched) return;
    if (lastProfileValid) setProfileId(lastProfileId);
    else if (defaultProfile) setProfileId(defaultProfile.profileId ?? AUTO_PROFILE);
  }, [defaultProfile, profileTouched, lastProfileValid, lastProfileId]);

  useEffect(() => {
    if (projectTouched || !lastSettings) return;
    if (projects.some((entry) => entry.projectId === lastSettings.projectId)) setProjectId(lastSettings.projectId);
  }, [lastSettings, projects, projectTouched]);

  useEffect(() => {
    if (!branchModeTouched && hasExistingWork) setBranchMode(BRANCH_AUTO);
  }, [hasExistingWork, branchModeTouched]);

  const projectOptions = useMemo(
    () =>
      projects.map((project) => ({
        label: project.projectDisplayName,
        value: project.projectId,
        description: project.projectRootPath,
      })),
    [projects],
  );
  const profileOptions = useMemo(
    () => [
      { label: "Auto (first available provider)", value: AUTO_PROFILE },
      ...(config?.config.agentProfiles ?? []).map((profile) => ({
        label: profile.name,
        value: profile.id,
      })),
    ],
    [config],
  );
  const branchModeOptions = useMemo(() => {
    const options: { label: string; value: string }[] = [];
    if (hasExistingWork)
      options.push({
        label: "Continue existing branch/PR",
        value: BRANCH_AUTO,
      });
    options.push({ label: "New branch", value: BRANCH_NEW });
    options.push({ label: "Existing branch", value: BRANCH_EXISTING });
    return options;
  }, [hasExistingWork]);
  const existingBranchOptions = useMemo(
    () =>
      (branchList?.branches ?? [])
        .filter((b) => b.name !== issue.branchName)
        .map((b) => ({ label: b.name, value: b.ref })),
    [branchList, issue.branchName],
  );
  const baseBranchOptions = useMemo(() => {
    const defaultName = branchList?.defaultBranch;
    return [
      {
        label: defaultName ? `${defaultName} (default)` : "Project default",
        value: "",
      },
      ...(branchList?.branches ?? [])
        .filter((b) => b.name !== defaultName)
        .map((b) => ({ label: b.name, value: b.name })),
    ];
  }, [branchList]);
  async function handleCreate() {
    if (!project) return;
    if (branchMode === BRANCH_EXISTING && !existingBranchRef) return;
    setCreating(true);
    setError(null);
    let startWarning: string | undefined;
    try {
      const selectedProfileId = profileId === AUTO_PROFILE ? null : profileId;
      const branchSource: BranchSourceOverride =
        branchMode === BRANCH_EXISTING
          ? { kind: "checkout", ref: existingBranchRef }
          : branchMode === BRANCH_AUTO
            ? { kind: "auto" }
            : { kind: "fresh", baseBranch: baseBranch || undefined };
      const workspaceId = await startWorkspaceForIssue(paseo, project, issue, fetchBranchExists, fetchDefaultProfile, {
        profileId: selectedProfileId,
        branchSource,
        prompt: prompt.trim() ? prompt : renderPromptTemplate(settings?.promptTemplate, issue),
        onWorkspaceCreated: settings?.markInProgress
          ? async (target) => {
              try {
                await startIssue({ id: target.id });
              } catch (caught) {
                const reason = caught instanceof Error ? caught.message : "unknown error";
                startWarning = `Workspace created, but ${target.identifier} was not moved to In Progress: ${reason}`;
              }
            }
          : undefined,
      });
      const last = { projectId, profileId: selectedProfileId };
      // Seed the cache so reopening the dialog doesn't briefly show the previous selection.
      queryClient.setQueryData(["linear", "lastWorkspaceSettings"], {
        settings: last,
      });
      saveLastWorkspaceSettings(last).catch((caught) => console.warn("Could not save last workspace settings", caught));
      onCreated(workspaceId, startWarning);
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setCreating(false);
    }
  }

  return (
    <Pressable
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(0, 0, 0, 0.4)",
        zIndex: 10,
      }}
      onPress={() => {
        if (!creating) onCancel();
      }}
    >
      <Pressable
        style={{
          width: 560,
          maxWidth: "95%",
          maxHeight: "92%",
          // Pressable defaults to the hand cursor on web; only the controls inside should show it.
          ...({ cursor: "default" } as object),
          padding: 16,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface1,
          gap: 12,
        }}
        onPress={(event) => event.stopPropagation()}
      >
        <Text
          style={{
            color: theme.colors.foreground,
            fontSize: 15,
            fontWeight: "600",
          }}
        >
          Create workspace for {issue.identifier}
        </Text>
        <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: 12 }}>
          <Field label="Project" theme={theme}>
            <ChoicePicker
              theme={theme}
              label="Projects"
              icon="Folder"
              placeholder="Choose a project"
              options={projectOptions}
              value={projectId}
              onChange={(value) => {
                setProjectTouched(true);
                setProjectId(value);
                setExistingBranchRef("");
                setBaseBranch("");
              }}
              disabled={creating}
            />
          </Field>
          <Field label="Branch" theme={theme}>
            <ChoicePicker
              theme={theme}
              label="Branch source"
              icon="GitFork"
              placeholder="Choose a branch source"
              options={branchModeOptions}
              value={branchMode}
              onChange={(value) => {
                setBranchModeTouched(true);
                setBranchMode(value);
              }}
              disabled={creating}
            />
            {branchMode === BRANCH_EXISTING ? (
              <ChoicePicker
                theme={theme}
                label="Branches"
                icon="GitBranch"
                placeholder="Choose a branch to check out"
                options={existingBranchOptions}
                value={existingBranchRef}
                onChange={setExistingBranchRef}
                disabled={creating}
              />
            ) : null}
            {branchMode === BRANCH_NEW ? (
              <ChoicePicker
                theme={theme}
                label="Base branches"
                icon="GitBranch"
                placeholder="Choose a base branch"
                options={baseBranchOptions}
                value={baseBranch}
                onChange={setBaseBranch}
                disabled={creating}
              />
            ) : null}
          </Field>
          <Field label="Agent" theme={theme}>
            <ChoicePicker
              theme={theme}
              label="Agents"
              icon="Bot"
              placeholder="Choose an agent"
              options={profileOptions}
              value={profileId}
              onChange={(value) => {
                setProfileTouched(true);
                setProfileId(value);
              }}
              disabled={creating}
            />
          </Field>
          <Field label="Prompt" theme={theme}>
            <TextInput
              accessibilityLabel="Prompt"
              multiline
              value={prompt}
              onChangeText={setPromptDraft}
              editable={!creating}
              placeholderTextColor={theme.colors.foregroundMuted}
              style={{
                minHeight: 200,
                maxHeight: 360,
                paddingHorizontal: 12,
                paddingVertical: 9,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surface0,
                color: theme.colors.foreground,
                fontSize: 13,
                textAlignVertical: "top",
              }}
            />
          </Field>
        </ScrollView>
        {error ? <Text style={{ color: theme.colors.statusDanger, fontSize: 13 }}>{error}</Text> : null}
        <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
          <Press
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            hoverStyle={{ backgroundColor: theme.colors.surface2 }}
            style={{
              paddingVertical: 8,
              paddingHorizontal: 12,
              borderRadius: 8,
            }}
            onPress={onCancel}
            disabled={creating}
          >
            <Text style={{ color: theme.colors.foregroundMuted, fontSize: 13 }}>Cancel</Text>
          </Press>
          <Press
            accessibilityRole="button"
            accessibilityLabel="Create workspace"
            style={{
              paddingVertical: 8,
              paddingHorizontal: 12,
              borderRadius: 8,
              backgroundColor: theme.colors.accent,
            }}
            onPress={handleCreate}
            disabled={
              creating || !projectId || pendingDefaults || (branchMode === BRANCH_EXISTING && !existingBranchRef)
            }
          >
            <Text style={{ color: theme.colors.accentForeground, fontSize: 13 }}>
              {creating ? "Creating…" : "Create"}
            </Text>
          </Press>
        </View>
      </Pressable>
    </Pressable>
  );
}

import type { PluginTheme, RpcInput, RpcOutput } from "@getpaseo/plugin";
import { usePaseo } from "@getpaseo/plugin/client";
import { SettingsInput, SettingsSection, SettingsSelect } from "@getpaseo/plugin/client/ui";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { branchExistsRpc } from "../../shared/branchExists";
import type { listBranchesRpc } from "../../shared/listBranches";
import type { getDefaultProfileRpc } from "../../shared/settings";
import type { IssueSummary } from "../../shared/types";
import {
  type BranchSourceOverride,
  findActiveGithubPr,
  type LinearProject,
  startWorkspaceForIssue,
} from "./createWorkspace";

type FetchBranchExists = (input: RpcInput<typeof branchExistsRpc>) => Promise<RpcOutput<typeof branchExistsRpc>>;
type FetchListBranches = (input: RpcInput<typeof listBranchesRpc>) => Promise<RpcOutput<typeof listBranchesRpc>>;
type FetchDefaultProfile = (input: RpcInput<typeof getDefaultProfileRpc>) => Promise<RpcOutput<typeof getDefaultProfileRpc>>;

const AUTO_PROFILE = "";
const BRANCH_AUTO = "auto";
const BRANCH_NEW = "new";
const BRANCH_EXISTING = "existing";
const RECENT_BRANCH_LIMIT = 10;

function describeError(caught: unknown): string {
  return caught instanceof Error ? caught.message : "Could not create workspace.";
}

interface CreateWorkspaceDialogProps {
  theme: PluginTheme;
  issue: IssueSummary;
  projects: LinearProject[];
  fetchBranchExists: FetchBranchExists;
  fetchListBranches: FetchListBranches;
  fetchDefaultProfile: FetchDefaultProfile;
  onCancel: () => void;
  onCreated: (workspaceId: string) => void;
}

/** Mirrors Paseo's native "new workspace" dialog (repo, agent profile, branch source) minus the prompt input — the prompt is fixed to the issue title, same as `startWorkspaceForIssue`'s default. */
export function CreateWorkspaceDialog({
  theme,
  issue,
  projects,
  fetchBranchExists,
  fetchListBranches,
  fetchDefaultProfile,
  onCancel,
  onCreated,
}: CreateWorkspaceDialogProps) {
  const paseo = usePaseo();
  const { data: config } = useQuery({
    queryKey: ["linear", "daemonConfig"],
    queryFn: () => paseo.config.get(),
  });
  const { data: defaultProfile, isLoading: isDefaultProfileLoading } = useQuery({
    queryKey: ["linear", "defaultProfile"],
    queryFn: () => fetchDefaultProfile({}),
  });

  const [projectId, setProjectId] = useState(projects[0]?.projectId ?? "");
  const [profileId, setProfileId] = useState(AUTO_PROFILE);
  const [profileTouched, setProfileTouched] = useState(false);
  const [branchMode, setBranchMode] = useState(BRANCH_NEW);
  const [branchModeTouched, setBranchModeTouched] = useState(false);
  const [branchSearch, setBranchSearch] = useState("");
  const [existingBranchRef, setExistingBranchRef] = useState("");
  const [baseBranch, setBaseBranch] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activePr = findActiveGithubPr(issue);
  const project = projects.find((entry) => entry.projectId === projectId);
  const { data: branchExists, isLoading: isBranchExistsLoading } = useQuery({
    queryKey: ["linear", "branchExists", project?.projectRootPath, issue.branchName],
    queryFn: () => fetchBranchExists({ projectRootPath: project!.projectRootPath, branchName: issue.branchName }),
    enabled: !activePr && !!project,
  });
  /** Whether there's actually something to "continue" — omits that option when a fresh/existing branch is the only sensible choice. */
  const hasExistingWork = !!activePr || !!branchExists?.exists;
  /** Blocks Create until the defaults it would otherwise silently submit (profile, auto branch mode) have resolved. */
  const pendingDefaults = (!profileTouched && isDefaultProfileLoading) || (!branchModeTouched && isBranchExistsLoading);
  const { data: branchList } = useQuery({
    queryKey: ["linear", "listBranches", project?.projectRootPath],
    queryFn: () => fetchListBranches({ projectRootPath: project!.projectRootPath }),
    enabled: !!project,
  });

  useEffect(() => {
    if (!profileTouched && defaultProfile) setProfileId(defaultProfile.profileId ?? AUTO_PROFILE);
  }, [defaultProfile, profileTouched]);

  useEffect(() => {
    if (!branchModeTouched && hasExistingWork) setBranchMode(BRANCH_AUTO);
  }, [hasExistingWork, branchModeTouched]);

  const projectOptions = useMemo(
    () => projects.map((project) => ({ label: project.projectDisplayName, value: project.projectId })),
    [projects],
  );
  const profileOptions = useMemo(
    () => [
      { label: "Auto (first available provider)", value: AUTO_PROFILE },
      ...(config?.config.agentProfiles ?? []).map((profile) => ({ label: profile.name, value: profile.id })),
    ],
    [config],
  );
  const branchModeOptions = useMemo(() => {
    const options: { label: string; value: string }[] = [];
    if (hasExistingWork) options.push({ label: "Continue existing branch/PR", value: BRANCH_AUTO });
    options.push({ label: "New branch", value: BRANCH_NEW });
    options.push({ label: "Existing branch", value: BRANCH_EXISTING });
    return options;
  }, [hasExistingWork]);
  const existingBranchOptions = useMemo(() => {
    const eligible = (branchList?.branches ?? []).filter((b) => b.name !== issue.branchName);
    const search = branchSearch.trim().toLowerCase();
    const matches = search ? eligible.filter((b) => b.name.toLowerCase().includes(search)) : eligible.slice(0, RECENT_BRANCH_LIMIT);
    const selected = eligible.find((b) => b.ref === existingBranchRef);
    const list = selected && !matches.some((b) => b.ref === selected.ref) ? [selected, ...matches] : matches;
    return list.map((b) => ({ label: b.name, value: b.ref }));
  }, [branchList, issue.branchName, existingBranchRef, branchSearch]);
  const baseBranchOptions = useMemo(() => {
    const defaultLabel = branchList?.defaultBranch ? `${branchList.defaultBranch} (default)` : "Repo default";
    return [
      { label: defaultLabel, value: "" },
      ...(branchList?.branches ?? []).slice(0, RECENT_BRANCH_LIMIT).map((b) => ({ label: b.name, value: b.name })),
    ];
  }, [branchList]);
  const styles = useMemo(
    () => ({
      fieldBorder: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8, overflow: "hidden" as const },
    }),
    [theme],
  );

  async function handleCreate() {
    if (!project) return;
    if (branchMode === BRANCH_EXISTING && !existingBranchRef) return;
    setCreating(true);
    setError(null);
    try {
      const branchSource: BranchSourceOverride =
        branchMode === BRANCH_EXISTING
          ? { kind: "checkout", ref: existingBranchRef }
          : branchMode === BRANCH_AUTO
            ? { kind: "auto" }
            : { kind: "fresh", baseBranch: baseBranch || undefined };
      const workspaceId = await startWorkspaceForIssue(paseo, project, issue, fetchBranchExists, fetchDefaultProfile, {
        profileId: profileId === AUTO_PROFILE ? null : profileId,
        branchSource,
      });
      onCreated(workspaceId);
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
          width: 460,
          padding: 16,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface1,
          gap: 12,
        }}
        onPress={(event) => event.stopPropagation()}
      >
        <Text style={{ color: theme.colors.foreground, fontSize: 15, fontWeight: "600" }}>
          Create workspace for {issue.identifier}
        </Text>
        <SettingsSection title="Workspace">
          {projectOptions.length > 1 ? (
            <View style={styles.fieldBorder}>
              <SettingsSelect
                label="Repo"
                value={projectId}
                options={projectOptions}
                onValueChange={(value) => {
                  setProjectId(value);
                  setExistingBranchRef("");
                  setBaseBranch("");
                  setBranchSearch("");
                }}
              />
            </View>
          ) : null}
          <View style={styles.fieldBorder}>
            <SettingsSelect
              label="Branch"
              value={branchMode}
              options={branchModeOptions}
              onValueChange={(value) => {
                setBranchModeTouched(true);
                setBranchMode(value);
              }}
            />
          </View>
          {branchMode === BRANCH_EXISTING ? (
            <View style={styles.fieldBorder}>
              <SettingsInput label="Search branches" placeholder="Filter by name" onChangeText={setBranchSearch} />
              <ScrollView style={{ maxHeight: 180 }}>
                {existingBranchOptions.map((option) => (
                  <Pressable
                    key={option.value}
                    accessibilityRole="button"
                    accessibilityLabel={`Check out branch ${option.label}`}
                    onPress={() => setExistingBranchRef(option.value)}
                    style={{
                      paddingVertical: 8,
                      paddingHorizontal: 10,
                      backgroundColor: option.value === existingBranchRef ? theme.colors.surface0 : "transparent",
                    }}
                  >
                    <Text
                      style={{
                        color: option.value === existingBranchRef ? theme.colors.accent : theme.colors.foreground,
                        fontSize: 13,
                      }}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}
          {branchMode === BRANCH_NEW ? (
            <View style={styles.fieldBorder}>
              <SettingsSelect
                label="Base branch"
                value={baseBranch}
                options={baseBranchOptions}
                onValueChange={setBaseBranch}
              />
            </View>
          ) : null}
          <View style={styles.fieldBorder}>
            <SettingsSelect
              label="Agent"
              value={profileId}
              options={profileOptions}
              onValueChange={(value) => {
                setProfileTouched(true);
                setProfileId(value);
              }}
            />
          </View>
        </SettingsSection>
        {error ? <Text style={{ color: theme.colors.statusDanger, fontSize: 13 }}>{error}</Text> : null}
        <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8 }}
            onPress={onCancel}
            disabled={creating}
          >
            <Text style={{ color: theme.colors.foregroundMuted, fontSize: 13 }}>Cancel</Text>
          </Pressable>
          <Pressable
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
          </Pressable>
        </View>
      </Pressable>
    </Pressable>
  );
}

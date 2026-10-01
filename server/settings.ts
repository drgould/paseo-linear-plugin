import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { RpcInput } from "@getpaseo/plugin";
import {
  type PluginSettings,
  type saveApiKeyRpc,
  type saveDefaultProfileRpc,
  type saveLastWorkspaceSettingsRpc,
  type saveSettingsRpc,
} from "../shared/settings";
import { createLinearClient } from "./linear";

interface StoredSettings extends Partial<PluginSettings> {
  apiKey?: string;
  defaultProfileId?: string | null;
  lastWorkspace?: { projectId: string; profileId: string | null };
}

/** PASEO_HOME is the daemon's own override for its home dir; default matches its on-disk convention. */
function pluginDataDir(): string {
  const paseoHome = process.env.PASEO_HOME ?? join(homedir(), ".paseo");
  return join(paseoHome, "plugin-data", "linear");
}

function settingsFilePath(): string {
  return join(pluginDataDir(), "settings.json");
}

/**
 * Only treats "no file yet" as empty settings. `writeSettings` merges onto this, so swallowing
 * every error here (e.g. a corrupted file) would silently drop whatever settings already existed
 * on the next save; a real read failure must propagate instead of merging onto a false `{}`.
 */
async function readSettings(): Promise<StoredSettings> {
  try {
    return JSON.parse(await fs.readFile(settingsFilePath(), "utf8")) as StoredSettings;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

let writeQueue: Promise<unknown> = Promise.resolve();

/**
 * Read-modify-write under a queue, so overlapping saves (the board's debounced view state and a settings toggle)
 * can't each start from the same snapshot and drop the other's field.
 */
function mutateSettings(update: (current: StoredSettings) => StoredSettings): Promise<void> {
  const run = writeQueue.then(async () => {
    const next = update(await readSettings());
    await fs.mkdir(pluginDataDir(), { recursive: true, mode: 0o700 });
    await fs.writeFile(settingsFilePath(), JSON.stringify(next), { mode: 0o600 });
  });
  writeQueue = run.catch(() => undefined);
  return run;
}

async function writeSettings(patch: StoredSettings): Promise<void> {
  await mutateSettings((current) => ({ ...current, ...patch }));
}

/** Validates the key against Linear before saving, so a typo surfaces here instead of as an empty board. */
export async function connectApiKey({ apiKey }: RpcInput<typeof saveApiKeyRpc>): Promise<{ ok: boolean }> {
  const trimmed = apiKey.trim();
  await createLinearClient({ apiKey: trimmed }).authenticate();
  return saveApiKey({ apiKey: trimmed });
}

export async function disconnect(): Promise<{ ok: boolean }> {
  await mutateSettings(({ apiKey: _removed, ...rest }) => rest);
  return { ok: true };
}

export async function getConnection(): Promise<{ connected: boolean; source: "environment" | "saved" | "none" }> {
  if ((await readSettings()).apiKey) return { connected: true, source: "saved" };
  if (process.env.LINEAR_API_KEY?.trim()) return { connected: true, source: "environment" };
  return { connected: false, source: "none" };
}

export async function getSettings(): Promise<PluginSettings> {
  const stored = await readSettings();
  return {
    showClosed: stored.showClosed ?? false,
    markInProgress: stored.markInProgress ?? false,
    promptTemplate: stored.promptTemplate ?? null,
    ui: stored.ui ?? {},
  };
}

export async function saveSettings(patch: RpcInput<typeof saveSettingsRpc>): Promise<PluginSettings> {
  const { ui, ...rest } = patch;
  // `ui` is merged field-by-field so saving the panel width doesn't drop the filters, and vice versa.
  await mutateSettings((current) => ({ ...current, ...rest, ...(ui ? { ui: { ...current.ui, ...ui } } : {}) }));
  return getSettings();
}

export async function saveApiKey({ apiKey }: RpcInput<typeof saveApiKeyRpc>): Promise<{ ok: boolean }> {
  await writeSettings({ apiKey });
  return { ok: true };
}

export async function getApiKey(): Promise<string> {
  const apiKey = (await readSettings()).apiKey;
  return apiKey || process.env.LINEAR_API_KEY || "";
}

export async function hasApiKey(): Promise<{ hasKey: boolean }> {
  const apiKey = await getApiKey();
  return { hasKey: apiKey.trim().length > 0 };
}

export async function saveDefaultProfile({
  profileId,
}: RpcInput<typeof saveDefaultProfileRpc>): Promise<{ ok: boolean }> {
  await writeSettings({ defaultProfileId: profileId });
  return { ok: true };
}

export async function getDefaultProfile(): Promise<{ profileId: string | null }> {
  return { profileId: (await readSettings()).defaultProfileId ?? null };
}

export async function saveLastWorkspaceSettings(
  lastWorkspace: RpcInput<typeof saveLastWorkspaceSettingsRpc>,
): Promise<{ ok: boolean }> {
  await writeSettings({ lastWorkspace });
  return { ok: true };
}

export async function getLastWorkspaceSettings(): Promise<{
  settings: { projectId: string; profileId: string | null } | null;
}> {
  return { settings: (await readSettings()).lastWorkspace ?? null };
}

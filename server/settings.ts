import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { RpcInput } from "@getpaseo/plugin";
import type { saveApiKeyRpc, saveDefaultProfileRpc } from "../shared/settings";

interface StoredSettings {
  apiKey?: string;
  defaultProfileId?: string | null;
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

async function writeSettings(patch: StoredSettings): Promise<void> {
  const current = await readSettings();
  await fs.mkdir(pluginDataDir(), { recursive: true, mode: 0o700 });
  await fs.writeFile(settingsFilePath(), JSON.stringify({ ...current, ...patch }), { mode: 0o600 });
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

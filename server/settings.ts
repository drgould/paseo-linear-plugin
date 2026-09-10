import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { RpcInput, RpcOutput } from "@getpaseo/plugin";
import type { saveApiKeyRpc } from "../shared/settings";

/** PASEO_HOME is the daemon's own override for its home dir; default matches its on-disk convention. */
function pluginDataDir(): string {
  const paseoHome = process.env.PASEO_HOME ?? join(homedir(), ".paseo");
  return join(paseoHome, "plugin-data", "linear");
}

function settingsFilePath(): string {
  return join(pluginDataDir(), "settings.json");
}

export async function saveApiKey({
  apiKey,
}: RpcInput<typeof saveApiKeyRpc>): Promise<RpcOutput<typeof saveApiKeyRpc>> {
  await fs.mkdir(pluginDataDir(), { recursive: true, mode: 0o700 });
  await fs.writeFile(settingsFilePath(), JSON.stringify({ apiKey }), { mode: 0o600 });
  return { ok: true };
}

export async function getApiKey(): Promise<string> {
  try {
    const raw = await fs.readFile(settingsFilePath(), "utf8");
    const apiKey = (JSON.parse(raw) as { apiKey?: string }).apiKey;
    if (apiKey) return apiKey;
  } catch {
    // No saved key yet — fall back to the daemon-level env var.
  }
  return process.env.LINEAR_API_KEY ?? "";
}

export async function hasApiKey(): Promise<{ hasKey: boolean }> {
  const apiKey = await getApiKey();
  return { hasKey: apiKey.trim().length > 0 };
}

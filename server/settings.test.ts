import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getApiKey, getDefaultProfile, hasApiKey, saveApiKey, saveDefaultProfile } from "./settings";

describe("plugin API key settings", () => {
  let dir: string;
  const originalPaseoHome = process.env.PASEO_HOME;
  const originalApiKey = process.env.LINEAR_API_KEY;

  beforeEach(async () => {
    dir = await fs.mkdtemp(join(tmpdir(), "paseo-linear-settings-"));
    process.env.PASEO_HOME = dir;
    delete process.env.LINEAR_API_KEY;
  });

  afterEach(async () => {
    if (originalPaseoHome === undefined) delete process.env.PASEO_HOME;
    else process.env.PASEO_HOME = originalPaseoHome;
    if (originalApiKey === undefined) delete process.env.LINEAR_API_KEY;
    else process.env.LINEAR_API_KEY = originalApiKey;
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("returns an empty string when nothing is configured", async () => {
    expect(await getApiKey()).toBe("");
  });

  it("falls back to LINEAR_API_KEY when no key has been saved", async () => {
    process.env.LINEAR_API_KEY = "lin_api_env";
    expect(await getApiKey()).toBe("lin_api_env");
  });

  it("persists the key to a restrictively-permissioned file under the plugin data dir", async () => {
    await expect(saveApiKey({ apiKey: "lin_api_saved" })).resolves.toEqual({ ok: true });

    const filePath = join(dir, "plugin-data", "linear", "settings.json");
    const stat = await fs.stat(filePath);
    expect(stat.mode & 0o777).toBe(0o600);
    expect(await getApiKey()).toBe("lin_api_saved");
  });

  it("prefers a saved key over the env fallback", async () => {
    process.env.LINEAR_API_KEY = "lin_api_env";
    await saveApiKey({ apiKey: "lin_api_saved" });
    expect(await getApiKey()).toBe("lin_api_saved");
  });

  it("reports no key when nothing is configured", async () => {
    expect(await hasApiKey()).toEqual({ hasKey: false });
  });

  it("reports a key once one is saved", async () => {
    await saveApiKey({ apiKey: "lin_api_saved" });
    expect(await hasApiKey()).toEqual({ hasKey: true });
  });

  it("saving the default profile does not clobber a previously saved API key", async () => {
    await saveApiKey({ apiKey: "lin_api_saved" });
    await saveDefaultProfile({ profileId: "profile-1" });
    expect(await getApiKey()).toBe("lin_api_saved");
    expect(await getDefaultProfile()).toEqual({ profileId: "profile-1" });
  });

  it("rejects a save instead of silently dropping other settings when the file is corrupted", async () => {
    await saveApiKey({ apiKey: "lin_api_saved" });
    const filePath = join(dir, "plugin-data", "linear", "settings.json");
    await fs.writeFile(filePath, "not json", { mode: 0o600 });

    await expect(saveDefaultProfile({ profileId: "profile-1" })).rejects.toThrow();
    expect(await fs.readFile(filePath, "utf8")).toBe("not json");
  });
});

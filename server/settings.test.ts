import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  connectApiKey,
  disconnect,
  getApiKey,
  getConnection,
  getDefaultProfile,
  getLastWorkspaceSettings,
  getSettings,
  hasApiKey,
  saveApiKey,
  saveDefaultProfile,
  saveLastWorkspaceSettings,
  saveSettings,
} from "./settings";

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

  it("round-trips last workspace settings without clobbering other settings", async () => {
    expect(await getLastWorkspaceSettings()).toEqual({ settings: null });
    await saveApiKey({ apiKey: "lin_api_saved" });
    await saveLastWorkspaceSettings({ projectId: "p1", profileId: null });
    expect(await getLastWorkspaceSettings()).toEqual({ settings: { projectId: "p1", profileId: null } });
    expect(await getApiKey()).toBe("lin_api_saved");
  });

  it("overwrites the previous last workspace settings", async () => {
    await saveLastWorkspaceSettings({ projectId: "p1", profileId: "prof" });
    await saveLastWorkspaceSettings({ projectId: "p2", profileId: null });
    expect(await getLastWorkspaceSettings()).toEqual({ settings: { projectId: "p2", profileId: null } });
  });

  it("rejects a save instead of silently dropping other settings when the file is corrupted", async () => {
    await saveApiKey({ apiKey: "lin_api_saved" });
    const filePath = join(dir, "plugin-data", "linear", "settings.json");
    await fs.writeFile(filePath, "not json", { mode: 0o600 });

    await expect(saveDefaultProfile({ profileId: "profile-1" })).rejects.toThrow();
    expect(await fs.readFile(filePath, "utf8")).toBe("not json");
  });

  it("returns defaults when no settings are stored", async () => {
    expect(await getSettings()).toEqual({ showClosed: false, markInProgress: false, promptTemplate: null, ui: {} });
  });

  it("merges ui patches field by field and keeps the API key", async () => {
    await saveApiKey({ apiKey: "lin_api_saved" });
    await saveSettings({ ui: { panelWidth: 500 } });
    const saved = await saveSettings({ showClosed: true, ui: { status: "Todo" } });

    expect(saved).toEqual({
      showClosed: true,
      markInProgress: false,
      promptTemplate: null,
      ui: { panelWidth: 500, status: "Todo" },
    });
    expect(await getApiKey()).toBe("lin_api_saved");
  });

  it("reports where the connection comes from", async () => {
    expect(await getConnection()).toEqual({ connected: false, source: "none" });
    process.env.LINEAR_API_KEY = "lin_api_env";
    expect(await getConnection()).toEqual({ connected: true, source: "environment" });
    await saveApiKey({ apiKey: "lin_api_saved" });
    expect(await getConnection()).toEqual({ connected: true, source: "saved" });
  });

  it("disconnect drops only the saved key", async () => {
    await saveApiKey({ apiKey: "lin_api_saved" });
    await saveSettings({ markInProgress: true });
    await disconnect();

    expect(await getConnection()).toEqual({ connected: false, source: "none" });
    expect((await getSettings()).markInProgress).toBe(true);
  });

  it("keeps both fields when saves overlap", async () => {
    await Promise.all([saveSettings({ ui: { panelWidth: 500 } }), saveSettings({ showClosed: true, ui: { view: "list" } })]);

    expect(await getSettings()).toMatchObject({ showClosed: true, ui: { panelWidth: 500, view: "list" } });
  });

  describe("connectApiKey", () => {
    const originalFetch = global.fetch;
    afterEach(() => {
      global.fetch = originalFetch;
    });

    it("saves the key once Linear confirms it", async () => {
      global.fetch = vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ data: { viewer: { id: "u1" } } }),
      })) as unknown as typeof fetch;

      await expect(connectApiKey({ apiKey: " lin_api_new " })).resolves.toEqual({ ok: true });
      const [, init] = vi.mocked(global.fetch).mock.calls[0];
      expect((init?.headers as Record<string, string>).Authorization).toBe("lin_api_new");
      expect(await getApiKey()).toBe("lin_api_new");
    });

    it("does not save a key Linear rejects", async () => {
      global.fetch = vi.fn(async () => ({ ok: false, status: 401 })) as unknown as typeof fetch;

      await expect(connectApiKey({ apiKey: "lin_api_bad" })).rejects.toThrow("Linear rejected this API key");
      expect(await getApiKey()).toBe("");
    });
  });
});

import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const saveApiKeyRpc = defineRpc({
  name: "settings.save-api-key",
  input: z.object({ apiKey: z.string().min(1, "API key is required") }),
  output: z.object({ ok: z.boolean() }),
});

export const hasApiKeyRpc = defineRpc({
  name: "settings.has-api-key",
  input: z.object({}),
  output: z.object({ hasKey: z.boolean() }),
});

/** `environment` keys come from the daemon's `LINEAR_API_KEY` and can't be removed from the UI. */
export const connectionRpc = defineRpc({
  name: "settings.connection",
  input: z.object({}),
  output: z.object({ connected: z.boolean(), source: z.enum(["environment", "saved", "none"]) }),
});

export const disconnectRpc = defineRpc({
  name: "settings.disconnect",
  input: z.object({}),
  output: z.object({ ok: z.boolean() }),
});

export const saveDefaultProfileRpc = defineRpc({
  name: "settings.save-default-profile",
  input: z.object({ profileId: z.string().nullable() }),
  output: z.object({ ok: z.boolean() }),
});

export const getDefaultProfileRpc = defineRpc({
  name: "settings.get-default-profile",
  input: z.object({}),
  output: z.object({ profileId: z.string().nullable() }),
});

export const SORT_FIELDS = ["updated", "created", "due", "priority"] as const;
export const SORT_DIRECTIONS = ["newest", "oldest"] as const;
export const VIEWS = ["board", "list"] as const;

/** Board view state remembered across sessions. */
export const UiPrefsSchema = z.object({
  panelWidth: z.number().optional(),
  status: z.string().nullable().optional(),
  sortField: z.enum(SORT_FIELDS).optional(),
  sortDirection: z.enum(SORT_DIRECTIONS).optional(),
  view: z.enum(VIEWS).optional(),
  /** Optional list-view columns the user turned off. */
  hiddenColumns: z.array(z.string()).optional(),
});

export type UiPrefs = z.infer<typeof UiPrefsSchema>;

export const PluginSettingsSchema = z.object({
  showClosed: z.boolean(),
  markInProgress: z.boolean(),
  /** `null` means the built-in prompt. */
  promptTemplate: z.string().nullable(),
  ui: UiPrefsSchema,
});

export type PluginSettings = z.infer<typeof PluginSettingsSchema>;

export const getSettingsRpc = defineRpc({
  name: "settings.get",
  input: z.object({}),
  output: PluginSettingsSchema,
});

export const saveSettingsRpc = defineRpc({
  name: "settings.save",
  input: PluginSettingsSchema.partial(),
  output: PluginSettingsSchema,
});

export const startIssueRpc = defineRpc({
  name: "linear.start-issue",
  input: z.object({ id: z.string() }),
  output: z.object({ ok: z.boolean() }),
});

const lastWorkspaceSettingsSchema = z.object({ projectId: z.string(), profileId: z.string().nullable() });

export const saveLastWorkspaceSettingsRpc = defineRpc({
  name: "settings.save-last-workspace",
  input: lastWorkspaceSettingsSchema,
  output: z.object({ ok: z.boolean() }),
});

export const getLastWorkspaceSettingsRpc = defineRpc({
  name: "settings.get-last-workspace",
  input: z.object({}),
  output: z.object({ settings: lastWorkspaceSettingsSchema.nullable() }),
});

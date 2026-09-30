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

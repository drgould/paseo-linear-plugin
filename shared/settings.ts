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

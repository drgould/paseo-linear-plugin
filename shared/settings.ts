import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const saveApiKeyRpc = defineRpc({
  name: "settings.saveApiKey",
  input: z.object({ apiKey: z.string().min(1, "API key is required") }),
  output: z.object({ ok: z.boolean() }),
});

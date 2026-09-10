import type { PluginClientContext } from "@getpaseo/plugin/client";
import { issueAttachments } from "../../shared/issues";

export function registerAttachments(client: PluginClientContext): () => void {
  return client.addAttachmentSource(issueAttachments);
}

import { defineAttachmentSource, defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
import { IssueSummarySchema } from "./types";

export const searchIssuesRpc = defineRpc({
  name: "issues.search",
  input: z.object({ query: z.string() }),
  output: z.object({ items: z.array(IssueSummarySchema) }),
});

export const issueAttachments = defineAttachmentSource({
  id: "issues",
  title: "Linear issue",
  icon: "CircleDot",
  pickerTitle: "Attach Linear issue",
  searchPlaceholder: "Search by identifier or title",
  search: searchIssuesRpc,
});

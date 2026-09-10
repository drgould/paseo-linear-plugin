import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
import { IssueSummarySchema } from "./types";

export const myIssuesRpc = defineRpc({
  name: "linear.myIssues",
  input: z.object({}),
  output: z.object({ items: z.array(IssueSummarySchema) }),
});

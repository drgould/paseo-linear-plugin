import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
import { IssueDetailSchema } from "./types";

export const issueDetailRpc = defineRpc({
  name: "linear.issueDetail",
  input: z.object({ id: z.string() }),
  output: IssueDetailSchema.nullable(),
});

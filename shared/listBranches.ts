import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const listBranchesRpc = defineRpc({
  name: "linear.list-branches",
  input: z.object({ projectRootPath: z.string() }),
  output: z.object({
    branches: z.array(z.object({ name: z.string(), ref: z.string() })),
    defaultBranch: z.string().nullable(),
  }),
});

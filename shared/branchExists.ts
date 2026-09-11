import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const branchExistsRpc = defineRpc({
  name: "linear.branch-exists",
  input: z.object({ projectRootPath: z.string(), branchName: z.string() }),
  output: z.object({ exists: z.boolean() }),
});

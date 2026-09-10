import type { PluginClientContext } from "@getpaseo/plugin/client";
import { MyIssuesSurface } from "./MyIssuesSurface";

export function registerMyIssues(client: PluginClientContext) {
  const removers = [
    client.addSurface("my-issues", MyIssuesSurface),
    client.addSidebarItem({
      id: "my-issues",
      title: "Linear",
      icon: "CircleDot",
      surface: "my-issues",
    }),
    client.addCommandCenterItem({
      id: "linear-my-issues",
      title: "Linear: My issues",
      icon: "CircleDot",
      context: "global",
      onSelect({ openSurface }) {
        openSurface("my-issues");
      },
    }),
  ];
  return () => removers.forEach((remove) => remove());
}

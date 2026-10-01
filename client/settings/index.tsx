import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { BehaviorForm } from "./BehaviorForm";
import { ConnectionForm } from "./ConnectionForm";
import { DefaultAgentForm } from "./DefaultAgentForm";

export function LinearSettings({ theme }: PluginSurfaceProps) {
  return (
    <>
      <ConnectionForm theme={theme} />
      <BehaviorForm theme={theme} />
      <DefaultAgentForm theme={theme} />
    </>
  );
}

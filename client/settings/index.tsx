import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { ApiKeyForm } from "./ApiKeyForm";
import { DefaultAgentForm } from "./DefaultAgentForm";

export function LinearSettings({ theme }: PluginSurfaceProps) {
  return (
    <>
      <ApiKeyForm theme={theme} />
      <DefaultAgentForm theme={theme} />
    </>
  );
}

import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { ApiKeyForm } from "./ApiKeyForm";

export function LinearSettings({ theme }: PluginSurfaceProps) {
  return <ApiKeyForm theme={theme} />;
}

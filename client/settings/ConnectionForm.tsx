import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Text } from "react-native";
import { useRpc } from "@getpaseo/plugin/client";
import type { PluginTheme } from "@getpaseo/plugin";
import { SettingsAction, SettingsSection } from "@getpaseo/plugin/client/ui";
import { connectionRpc, disconnectRpc } from "../../shared/settings";
import { ApiKeyForm } from "./ApiKeyForm";

const SOURCE_LABEL = { environment: "LINEAR_API_KEY in the daemon environment", saved: "key saved on this host", none: "" };

export function ConnectionForm({ theme }: { theme: PluginTheme }) {
  const queryClient = useQueryClient();
  const fetchConnection = useRpc(connectionRpc);
  const disconnect = useRpc(disconnectRpc);
  const [message, setMessage] = useState<string | null>(null);
  const { data: connection } = useQuery({
    queryKey: ["linear", "connection"],
    queryFn: () => fetchConnection({}),
  });

  async function refreshConnection() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["linear", "connection"] }),
      queryClient.invalidateQueries({ queryKey: ["linear", "hasApiKey"] }),
      queryClient.invalidateQueries({ queryKey: ["linear", "myIssues"] }),
    ]);
  }

  async function handleDisconnect() {
    setMessage(null);
    try {
      await disconnect({});
      await refreshConnection();
    } catch {
      setMessage("Failed to disconnect.");
    }
  }

  return (
    <>
      <SettingsSection title="Linear connection">
        <SettingsAction
          label={connection?.connected ? "Connected" : "Not connected"}
          hint={connection?.connected ? `Using ${SOURCE_LABEL[connection.source]}.` : "Add an API key below."}
          actionLabel="Disconnect"
          onPress={handleDisconnect}
          disabled={connection?.source !== "saved"}
        />
        {message ? <Text style={{ color: theme.colors.statusDanger }}>{message}</Text> : null}
      </SettingsSection>
      <ApiKeyForm theme={theme} onSaved={refreshConnection} />
    </>
  );
}

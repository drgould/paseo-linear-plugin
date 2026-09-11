import { useCallback, useMemo, useState } from "react";
import { Text } from "react-native";
import { usePaseo, useRpc } from "@getpaseo/plugin/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { PluginTheme } from "@getpaseo/plugin";
import { SettingsSection, SettingsSelect } from "@getpaseo/plugin/client/ui";
import { getDefaultProfileRpc, saveDefaultProfileRpc } from "../../shared/settings";

const AUTO_VALUE = "";

interface DefaultAgentFormProps {
  theme: PluginTheme;
}

export function DefaultAgentForm({ theme }: DefaultAgentFormProps) {
  const paseo = usePaseo();
  const queryClient = useQueryClient();
  const fetchConfig = useQuery({
    queryKey: ["linear", "daemonConfig"],
    queryFn: () => paseo.config.get(),
  });
  const fetchDefaultProfile = useRpc(getDefaultProfileRpc);
  const { data: defaultProfile } = useQuery({
    queryKey: ["linear", "defaultProfile"],
    queryFn: () => fetchDefaultProfile({}),
  });
  const saveDefaultProfile = useRpc(saveDefaultProfileRpc);
  const [message, setMessage] = useState<string | null>(null);

  const options = useMemo(() => {
    const profiles = fetchConfig.data?.config.agentProfiles ?? [];
    return [
      { label: "Auto (first available provider)", value: AUTO_VALUE },
      ...profiles.map((profile) => ({ label: profile.name, value: profile.id })),
    ];
  }, [fetchConfig.data]);

  const handleChange = useCallback(
    async (value: string) => {
      setMessage(null);
      try {
        await saveDefaultProfile({ profileId: value === AUTO_VALUE ? null : value });
        await queryClient.invalidateQueries({ queryKey: ["linear", "defaultProfile"] });
      } catch {
        setMessage("Failed to save default agent.");
      }
    },
    [saveDefaultProfile, queryClient],
  );

  return (
    <SettingsSection title="Start workspace">
      <SettingsSelect
        label="Default agent"
        hint="Agent profile used when starting a workspace from a Linear issue."
        value={defaultProfile?.profileId ?? AUTO_VALUE}
        options={options}
        onValueChange={handleChange}
        disabled={fetchConfig.isLoading}
      />
      {message ? <Text style={{ color: theme.colors.foreground }}>{message}</Text> : null}
      {fetchConfig.error ? (
        <Text style={{ color: theme.colors.statusDanger }}>Could not load agent profiles.</Text>
      ) : null}
    </SettingsSection>
  );
}

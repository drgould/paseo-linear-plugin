import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Text } from "react-native";
import { useRpc } from "@getpaseo/plugin/client";
import type { PluginTheme } from "@getpaseo/plugin";
import { SettingsAction, SettingsInput, SettingsSection, SettingsSwitch } from "@getpaseo/plugin/client/ui";
import { DEFAULT_PROMPT_TEMPLATE, PROMPT_PLACEHOLDERS } from "../../shared/promptTemplate";
import { getSettingsRpc, type PluginSettings, saveSettingsRpc } from "../../shared/settings";

export function BehaviorForm({ theme }: { theme: PluginTheme }) {
  const queryClient = useQueryClient();
  const fetchSettings = useRpc(getSettingsRpc);
  const saveSettings = useRpc(saveSettingsRpc);
  const [message, setMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const { data: settings } = useQuery({
    queryKey: ["linear", "settings"],
    queryFn: () => fetchSettings({}),
  });

  async function save(patch: Partial<PluginSettings>): Promise<boolean> {
    setMessage(null);
    try {
      await saveSettings(patch);
      await queryClient.invalidateQueries({ queryKey: ["linear", "settings"] });
      if ("showClosed" in patch) await queryClient.invalidateQueries({ queryKey: ["linear", "myIssues"] });
      return true;
    } catch {
      setMessage("Failed to save settings.");
      return false;
    }
  }

  return (
    <SettingsSection title="Board and workspaces">
      <SettingsSwitch
        label="Show closed tickets"
        hint="Include completed, canceled and duplicate tickets on the board."
        value={settings?.showClosed ?? false}
        onValueChange={(showClosed) => save({ showClosed })}
        disabled={!settings}
      />
      <SettingsSwitch
        label="Mark In Progress on launch"
        hint="Move a ticket to its team's In Progress state when a workspace is created for it."
        value={settings?.markInProgress ?? false}
        onValueChange={(markInProgress) => save({ markInProgress })}
        disabled={!settings}
      />
      {settings ? (
        <SettingsInput
          // Remount when the saved template changes (e.g. Reset) so the field shows the new value.
          key={settings.promptTemplate ?? "default"}
          label="Launch prompt"
          hint={`First message sent to the agent. Placeholders: ${PROMPT_PLACEHOLDERS.join(", ")}.`}
          initialValue={settings.promptTemplate ?? DEFAULT_PROMPT_TEMPLATE}
          onChangeText={setDraft}
        />
      ) : null}
      <SettingsAction
        label="Save launch prompt"
        actionLabel="Save"
        onPress={async () => {
          // Keep the draft (and an enabled Save) if the save fails, so it can be retried.
          if (await save({ promptTemplate: draft?.trim() ? draft : null })) setDraft(null);
        }}
        disabled={draft === null}
      />
      <SettingsAction
        label="Reset launch prompt"
        actionLabel="Reset"
        onPress={() => {
          setDraft(null);
          void save({ promptTemplate: null });
        }}
        disabled={!settings?.promptTemplate}
      />
      {message ? <Text style={{ color: theme.colors.statusDanger }}>{message}</Text> : null}
    </SettingsSection>
  );
}

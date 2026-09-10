import { useCallback, useState } from "react";
import { Text } from "react-native";
import { useRpc } from "@getpaseo/plugin/client";
import type { PluginTheme } from "@getpaseo/plugin";
import { SettingsAction, SettingsInput, SettingsSection } from "@getpaseo/plugin/client/ui";
import { saveApiKeyRpc } from "../../shared/settings";

interface ApiKeyFormProps {
  theme: PluginTheme;
  onSaved?: () => void;
}

export function ApiKeyForm({ theme, onSaved }: ApiKeyFormProps) {
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const saveApiKey = useRpc(saveApiKeyRpc);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setMessage(null);
    try {
      await saveApiKey({ apiKey: apiKey.trim() });
      setMessage("Saved.");
      onSaved?.();
    } catch {
      setMessage("Failed to save API key.");
    } finally {
      setSaving(false);
    }
  }, [apiKey, saveApiKey, onSaved]);

  return (
    <SettingsSection title="Linear">
      <SettingsInput
        label="API key"
        hint="Paste a Linear personal API key. Stored locally and used to search Linear issues."
        placeholder="lin_api_..."
        initialValue={apiKey}
        onChangeText={setApiKey}
        secureTextEntry
        disabled={saving}
      />
      <SettingsAction
        label="Save API key"
        actionLabel={saving ? "Saving…" : "Save"}
        onPress={handleSave}
        disabled={saving || apiKey.trim().length === 0}
      />
      {message ? <Text style={{ color: theme.colors.foreground }}>{message}</Text> : null}
    </SettingsSection>
  );
}

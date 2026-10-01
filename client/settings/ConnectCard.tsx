import type { PluginTheme } from "@getpaseo/plugin";
import { Text, View } from "react-native";
import { ApiKeyForm } from "./ApiKeyForm";

const STEPS = [
  "In Linear, open Settings → Security & access and create a personal API key (read-only is enough, unless you use Mark In Progress).",
  "Paste it below, or set LINEAR_API_KEY in the Paseo daemon's environment.",
  "The key is checked with Linear, then stored privately on this Paseo host.",
];

interface ConnectCardProps {
  theme: PluginTheme;
  onSaved?: () => void;
}

/** Shown in place of the board until a working API key exists. */
export function ConnectCard({ theme, onSaved }: ConnectCardProps) {
  const { colors } = theme;
  return (
    <View style={{ gap: 12, padding: 24, maxWidth: 560, width: "100%", alignSelf: "center" }}>
      <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "700" }}>Connect your Linear work</Text>
      {STEPS.map((step, index) => (
        <View key={step} style={{ flexDirection: "row", gap: 10 }}>
          <Text style={{ color: colors.accent, fontWeight: "700" }}>{index + 1}.</Text>
          <Text style={{ color: colors.foregroundMuted, flex: 1 }}>{step}</Text>
        </View>
      ))}
      <ApiKeyForm theme={theme} onSaved={onSaved} />
    </View>
  );
}

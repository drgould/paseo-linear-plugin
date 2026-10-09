import type { PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { Press } from "./ui";

export interface Choice {
  value: string;
  label: string;
  description?: string;
}

interface ChoicePickerProps {
  theme: PluginTheme;
  label: string;
  icon: string;
  placeholder: string;
  options: Choice[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

const SEARCH_THRESHOLD = 6;

/** Dropdown that expands inline into a searchable list (search appears once there are enough options to need it). */
export function ChoicePicker({ theme, label, icon, placeholder, options, value, onChange, disabled }: ChoicePickerProps) {
  const { colors } = theme;
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = options.find((option) => option.value === value);
  const needle = search.trim().toLowerCase();
  const visible = options.filter((option) => `${option.label} ${option.description ?? ""}`.toLowerCase().includes(needle));

  return (
    <View style={{ gap: 6 }}>
      <Press
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selected?.label ?? placeholder}`}
        accessibilityState={{ expanded: open }}
        disabled={disabled}
        onPress={() => {
          setOpen(!open);
          setSearch("");
        }}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          paddingHorizontal: 12,
          paddingVertical: 9,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: open ? colors.accent : colors.border,
          backgroundColor: colors.surface0,
        }}
      >
        <Icon name={icon} size={15} color={selected ? colors.accent : colors.foregroundMuted} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ color: selected ? colors.foreground : colors.foregroundMuted, fontSize: 13 }}>
            {selected?.label ?? placeholder}
          </Text>
          {selected?.description ? (
            <Text numberOfLines={1} style={{ color: colors.foregroundMuted, fontSize: 11 }}>
              {selected.description}
            </Text>
          ) : null}
        </View>
        <Icon name={open ? "ChevronUp" : "ChevronDown"} size={14} color={colors.foregroundMuted} />
      </Press>
      {open ? (
        <View style={{ borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface0, padding: 6, gap: 4 }}>
          {options.length > SEARCH_THRESHOLD || search ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                paddingHorizontal: 10,
                borderRadius: 6,
                backgroundColor: colors.surface1,
              }}
            >
              <Icon name="Search" size={13} color={colors.foregroundMuted} />
              <TextInput
                accessibilityLabel={`Search ${label.toLowerCase()}`}
                placeholder={`Search ${label.toLowerCase()}…`}
                placeholderTextColor={colors.foregroundMuted}
                value={search}
                onChangeText={setSearch}
                autoCapitalize="none"
                autoCorrect={false}
                style={{ flex: 1, minWidth: 0, paddingVertical: 8, fontSize: 13, color: colors.foreground }}
              />
            </View>
          ) : null}
          <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
            {visible.map((option) => (
              <Press
                key={option.value}
                accessibilityRole="button"
                accessibilityState={{ selected: option.value === value }}
                disabled={disabled}
                onPress={() => {
                  onChange(option.value);
                  setOpen(false);
                  setSearch("");
                }}
                hoverStyle={{ backgroundColor: colors.surface1 }}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  borderRadius: 6,
                  backgroundColor: option.value === value ? colors.surface2 : "transparent",
                }}
              >
                <Text
                  numberOfLines={1}
                  style={{ color: option.value === value ? colors.accent : colors.foreground, fontSize: 13 }}
                >
                  {option.label}
                </Text>
                {option.description ? (
                  <Text numberOfLines={1} style={{ color: colors.foregroundMuted, fontSize: 11 }}>
                    {option.description}
                  </Text>
                ) : null}
              </Press>
            ))}
            {visible.length === 0 ? (
              <Text style={{ color: colors.foregroundMuted, padding: 10, fontSize: 13 }}>No matching {label.toLowerCase()}.</Text>
            ) : null}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

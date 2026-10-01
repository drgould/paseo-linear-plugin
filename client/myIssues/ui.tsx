import type { PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/react-native";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Pressable,
  type PressableProps,
  Text,
  View,
  type ViewStyle,
} from "react-native";

type Colors = PluginTheme["colors"];

const HOVER_DEFAULT: ViewStyle = { opacity: 0.7 };

interface PressProps extends Omit<PressableProps, "style" | "children"> {
  style?: ViewStyle | ViewStyle[];
  /** Applied while the pointer is over the element (web only; react-native-web reports `hovered`). */
  hoverStyle?: ViewStyle;
  children?: ReactNode;
}

/** `Pressable` with a hover state, so every interactive element answers the pointer. */
export function Press({ style, hoverStyle = HOVER_DEFAULT, children, ...props }: PressProps) {
  return (
    <Pressable
      {...props}
      style={(state) => [
        ...(Array.isArray(style) ? style : [style]),
        (state as { hovered?: boolean }).hovered && !props.disabled ? hoverStyle : null,
        props.disabled ? { opacity: 0.5 } : null,
      ]}
    >
      {children}
    </Pressable>
  );
}

/** Rotates its child continuously while `active`, e.g. a refresh icon during a fetch. */
export function Spin({ active, children }: { active: boolean; children: ReactNode }) {
  const rotation = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) {
      rotation.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(rotation, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [active, rotation]);
  const rotate = rotation.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  return <Animated.View style={{ transform: [{ rotate }] }}>{children}</Animated.View>;
}

interface IconButtonProps {
  colors: Colors;
  icon: string;
  label: string;
  /** Filled accent button for the primary action; outlined otherwise. */
  primary?: boolean;
  disabled?: boolean;
  small?: boolean;
  onPress: () => void;
}

export function IconButton({ colors, icon, label, primary, disabled, small, onPress }: IconButtonProps) {
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={(event) => {
        event.stopPropagation();
        onPress();
      }}
      style={{
        width: small ? 22 : 30,
        height: small ? 22 : 30,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 8,
        borderWidth: primary ? 0 : 1,
        borderColor: colors.border,
        backgroundColor: primary ? colors.accent : "transparent",
      }}
      hoverStyle={primary ? { opacity: 0.85 } : { backgroundColor: colors.surface2 }}
    >
      <Icon name={icon} size={small ? 12 : 15} color={primary ? colors.accentForeground : colors.foregroundMuted} />
    </Press>
  );
}

const STATE_ICONS: Record<string, string> = {
  triage: "CircleDashed",
  backlog: "CircleDashed",
  unstarted: "Circle",
  started: "CircleDot",
  completed: "CircleCheck",
  canceled: "CircleSlash",
  duplicate: "CircleSlash",
};

export function stateColor(colors: Colors, stateType: string | undefined): string {
  if (stateType === "started") return colors.statusWarning;
  if (stateType === "completed") return colors.statusSuccess;
  return colors.foregroundMuted;
}

export function StatusMark({ colors, stateType, size = 14 }: { colors: Colors; stateType?: string; size?: number }) {
  return <Icon name={STATE_ICONS[stateType ?? ""] ?? "Circle"} size={size} color={stateColor(colors, stateType)} />;
}

const PRIORITY_ICONS: Record<string, string> = {
  urgent: "Flame",
  high: "SignalHigh",
  medium: "SignalMedium",
  low: "SignalLow",
};

/** Renders nothing for "No priority" so unprioritised cards stay quiet. */
export function PriorityMark({ colors, priority, size = 14 }: { colors: Colors; priority?: string; size?: number }) {
  const key = priority?.toLowerCase() ?? "";
  const icon = PRIORITY_ICONS[key];
  if (!icon) return null;
  const color = key === "urgent" ? colors.statusDanger : key === "high" ? colors.statusWarning : colors.foregroundMuted;
  return <Icon name={icon} size={size} color={color} />;
}

export function LabelChip({ colors, label }: { colors: Colors; label: string }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent }} />
      <Text style={{ color: colors.foregroundMuted, fontSize: 11 }}>{label}</Text>
    </View>
  );
}

interface ChipProps {
  colors: Colors;
  label: string;
  chosen?: boolean;
  leading?: string;
  /** Spins the leading icon, e.g. while a refresh is in flight. */
  spinning?: boolean;
  onPress: () => void;
}

/** Pill toggle used for status chips, sort controls and header buttons. */
export function Chip({ colors, label, chosen, leading, spinning, onPress }: ChipProps) {
  const foreground = chosen ? colors.foreground : colors.foregroundMuted;
  return (
    <Press
      accessibilityRole="button"
      accessibilityState={{ selected: !!chosen }}
      accessibilityLabel={label}
      onPress={onPress}
      hoverStyle={chosen ? { opacity: 0.85 } : { backgroundColor: colors.surface2, borderColor: colors.foregroundMuted }}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: chosen ? colors.accent : colors.border,
        backgroundColor: chosen ? colors.surface2 : "transparent",
      }}
    >
      {leading ? (
        <Spin active={!!spinning}>
          <Icon name={leading} size={13} color={foreground} />
        </Spin>
      ) : null}
      <Text style={{ color: foreground, fontSize: 12, fontWeight: chosen ? "600" : "400" }}>{label}</Text>
    </Press>
  );
}

interface SegmentedProps<Value extends string> {
  colors: Colors;
  value: Value;
  options: readonly { label: string; value: Value }[];
  onChange: (value: Value) => void;
}

export function Segmented<Value extends string>({ colors, value, options, onChange }: SegmentedProps<Value>) {
  return (
    <View
      style={{
        flexDirection: "row",
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface0,
        padding: 2,
        gap: 2,
      }}
    >
      {options.map((option) => {
        const chosen = option.value === value;
        return (
          <Press
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: chosen }}
            onPress={() => onChange(option.value)}
            hoverStyle={chosen ? { opacity: 0.85 } : { backgroundColor: colors.surface1 }}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 6,
              backgroundColor: chosen ? colors.surface2 : "transparent",
            }}
          >
            <Text style={{ color: chosen ? colors.foreground : colors.foregroundMuted, fontSize: 12 }}>
              {option.label}
            </Text>
          </Press>
        );
      })}
    </View>
  );
}

/** Pulsing placeholder block shown while the board loads. */
export function Skeleton({ colors, height, width }: { colors: Colors; height: number; width?: number | `${number}%` }) {
  const opacity = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View style={{ height, width, borderRadius: 10, backgroundColor: colors.surface2, opacity }} />;
}

interface EmptyStateProps {
  colors: Colors;
  icon: string;
  title: string;
  hint?: string;
  action?: { label: string; onPress: () => void };
}

export function EmptyState({ colors, icon, title, hint, action }: EmptyStateProps) {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 8, padding: 24 }}>
      <Icon name={icon} size={24} color={colors.foregroundMuted} />
      <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "600" }}>{title}</Text>
      {hint ? <Text style={{ color: colors.foregroundMuted, textAlign: "center" }}>{hint}</Text> : null}
      {action ? (
        <Chip colors={colors} label={action.label} onPress={action.onPress} />
      ) : null}
    </View>
  );
}

/** Tree geometry shared by the connector and the group layout that positions cards around it. */
export const TREE_INDENT = 20;
export const TREE_GAP = 8;
/** Space between the end of a connector's horizontal arm and the nested row's content. */
export const TREE_CONTENT_PAD = 8;
const TREE_LINE_X = 10;
const TREE_CORNER_Y = 20;

interface TreeConnectorProps {
  colors: Colors;
  /** Depth of the card this one hangs from; the line starts under that card's left edge. */
  parentDepth: number;
  /** The last child ends the line with an "L"; earlier siblings keep it running down with a tick. */
  last: boolean;
  /** Extra left offset, for rows whose content starts inside horizontal padding. */
  offset?: number;
  /** Space between stacked siblings; the line reaches back up across it. */
  gap?: number;
}

/** Dotted line from a parent card to a nested child, drawn inside the child's wrapper (which is indented to the child's depth). */
export function TreeConnector({ colors, parentDepth, last, offset = 0, gap = TREE_GAP }: TreeConnectorProps) {
  const left = parentDepth * TREE_INDENT + TREE_LINE_X + offset;
  const line = { position: "absolute", left, borderColor: colors.foregroundMuted, borderStyle: "dotted" } as const;
  const reach = TREE_INDENT - TREE_LINE_X;
  if (last) {
    return (
      <View
        pointerEvents="none"
        style={{
          ...line,
          top: -gap,
          width: reach,
          height: gap + TREE_CORNER_Y,
          borderLeftWidth: 1,
          borderBottomWidth: 1,
          borderBottomLeftRadius: 6,
        }}
      />
    );
  }
  return (
    <>
      <View pointerEvents="none" style={{ ...line, top: -gap, bottom: -gap, borderLeftWidth: 1 }} />
      <View pointerEvents="none" style={{ ...line, top: TREE_CORNER_Y, width: reach, borderBottomWidth: 1 }} />
    </>
  );
}

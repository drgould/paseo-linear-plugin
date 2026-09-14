import type { PluginTheme } from "@getpaseo/plugin";
import { useMemo } from "react";
import { Linking, Text, View } from "react-native";
import type { ReactNode } from "react";

type InlineToken =
  | { type: "text"; text: string }
  | { type: "bold" | "italic" | "code"; text: string }
  | { type: "link"; text: string; url: string };

const INLINE_PATTERN = /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)|\*([^*]+)\*|_([^_]+)_/g;

/** Issue descriptions are attacker-influenceable text, so a markdown link can name any scheme — only open http(s). */
function isSafeUrl(url: string): boolean {
  try {
    const protocol = new URL(url).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

function parseInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  INLINE_PATTERN.lastIndex = 0;
  while ((match = INLINE_PATTERN.exec(text))) {
    if (match.index > lastIndex) tokens.push({ type: "text", text: text.slice(lastIndex, match.index) });
    if (match[1] !== undefined) tokens.push({ type: "bold", text: match[1] });
    else if (match[2] !== undefined) tokens.push({ type: "code", text: match[2] });
    else if (match[3] !== undefined) tokens.push({ type: "link", text: match[3], url: match[4] });
    else if (match[5] !== undefined) tokens.push({ type: "italic", text: match[5] });
    else if (match[6] !== undefined) tokens.push({ type: "italic", text: match[6] });
    lastIndex = INLINE_PATTERN.lastIndex;
  }
  if (lastIndex < text.length) tokens.push({ type: "text", text: text.slice(lastIndex) });
  return tokens;
}

function renderInline(tokens: InlineToken[], theme: PluginTheme, baseStyle: object): ReactNode {
  return tokens.map((token, index) => {
    switch (token.type) {
      case "bold":
        return (
          <Text key={index} style={[baseStyle, { fontWeight: "700" as const }]}>
            {token.text}
          </Text>
        );
      case "italic":
        return (
          <Text key={index} style={[baseStyle, { fontStyle: "italic" as const }]}>
            {token.text}
          </Text>
        );
      case "code":
        return (
          <Text key={index} style={[baseStyle, { fontFamily: "monospace", backgroundColor: theme.colors.surface0 }]}>
            {token.text}
          </Text>
        );
      case "link":
        return isSafeUrl(token.url) ? (
          <Text
            key={index}
            accessibilityRole="link"
            style={[baseStyle, { color: theme.colors.accent }]}
            onPress={() => Linking.openURL(token.url)}
          >
            {token.text}
          </Text>
        ) : (
          <Text key={index} style={baseStyle}>
            {token.text}
          </Text>
        );
      default:
        return (
          <Text key={index} style={baseStyle}>
            {token.text}
          </Text>
        );
    }
  });
}

const HEADER_PATTERN = /^(#{1,6})\s+(.*)/;
const BULLET_PATTERN = /^[-*]\s+(.*)/;
const ORDERED_PATTERN = /^\d+\.\s+(.*)/;

/** Minimal markdown renderer for Linear issue descriptions: headers, bold/italic/code, links, lists, code fences. */
export function MarkdownText({ theme, text }: { theme: PluginTheme; text: string }) {
  const styles = useMemo(
    () => ({
      paragraph: { color: theme.colors.foreground, fontSize: 14, lineHeight: 20, flexShrink: 1 },
      heading: { color: theme.colors.foreground, fontSize: 15, fontWeight: "700" as const, lineHeight: 22 },
      code: {
        color: theme.colors.foreground,
        fontFamily: "monospace",
        fontSize: 13,
        backgroundColor: theme.colors.surface0,
        padding: 8,
        borderRadius: 6,
      },
      list: { gap: 4 },
      listRow: { flexDirection: "row" as const, gap: 6 },
      bullet: { color: theme.colors.foreground, fontSize: 14 },
    }),
    [theme],
  );

  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") {
      i++;
      continue;
    }

    if (line.startsWith("```")) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      blocks.push(
        <Text key={key++} style={styles.code}>
          {codeLines.join("\n")}
        </Text>,
      );
      continue;
    }

    const headerMatch = HEADER_PATTERN.exec(line);
    if (headerMatch) {
      blocks.push(
        <Text key={key++} style={styles.heading}>
          {renderInline(parseInline(headerMatch[2]), theme, styles.heading)}
        </Text>,
      );
      i++;
      continue;
    }

    if (BULLET_PATTERN.test(line) || ORDERED_PATTERN.test(line)) {
      const ordered = ORDERED_PATTERN.test(line);
      const pattern = ordered ? ORDERED_PATTERN : BULLET_PATTERN;
      const items: string[] = [];
      while (i < lines.length && pattern.test(lines[i])) {
        items.push(pattern.exec(lines[i])![1]);
        i++;
      }
      blocks.push(
        <View key={key++} style={styles.list}>
          {items.map((item, index) => (
            <View key={index} style={styles.listRow}>
              <Text style={styles.bullet}>{ordered ? `${index + 1}.` : "•"}</Text>
              <Text style={styles.paragraph}>{renderInline(parseInline(item), theme, styles.paragraph)}</Text>
            </View>
          ))}
        </View>,
      );
      continue;
    }

    const paragraphLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !HEADER_PATTERN.test(lines[i]) && !BULLET_PATTERN.test(lines[i]) && !ORDERED_PATTERN.test(lines[i]) && !lines[i].startsWith("```")) {
      paragraphLines.push(lines[i]);
      i++;
    }
    blocks.push(
      <Text key={key++} style={styles.paragraph}>
        {renderInline(parseInline(paragraphLines.join(" ")), theme, styles.paragraph)}
      </Text>,
    );
  }

  return <View style={{ gap: 8 }}>{blocks}</View>;
}

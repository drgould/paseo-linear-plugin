export const DEFAULT_PROMPT_TEMPLATE = "Work on {{identifier}}: {{title}}\n\n{{description}}";

export const PROMPT_PLACEHOLDERS = ["{{identifier}}", "{{title}}", "{{url}}", "{{description}}"] as const;

/**
 * Fills the placeholders in the launch prompt; a blank template falls back to the default.
 * One pass, so a title that itself contains `{{url}}` isn't expanded.
 */
export function renderPromptTemplate(
  template: string | null | undefined,
  issue: { identifier: string; title: string; url: string; description?: string | null },
): string {
  const source = template?.trim() ? template : DEFAULT_PROMPT_TEMPLATE;
  return source
    .replace(/\{\{(identifier|title|url|description)\}\}/g, (_match, key: keyof typeof issue) => issue[key] ?? "")
    .trim();
}

export const DEFAULT_PROMPT_TEMPLATE = "Work on {{identifier}}: {{title}}";

export const PROMPT_PLACEHOLDERS = ["{{identifier}}", "{{title}}", "{{url}}"] as const;

/**
 * Fills the placeholders in the launch prompt; a blank template falls back to the default.
 * One pass, so a title that itself contains `{{url}}` isn't expanded.
 */
export function renderPromptTemplate(
  template: string | null | undefined,
  issue: { identifier: string; title: string; url: string },
): string {
  const source = template?.trim() ? template : DEFAULT_PROMPT_TEMPLATE;
  return source.replace(/\{\{(identifier|title|url)\}\}/g, (_match, key: "identifier" | "title" | "url") => issue[key]);
}

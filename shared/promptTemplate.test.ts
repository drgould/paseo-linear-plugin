import { describe, expect, it } from "vitest";
import { DEFAULT_PROMPT_TEMPLATE, renderPromptTemplate } from "./promptTemplate";

const issue = { identifier: "ENG-1", title: "Fix it", url: "https://linear.app/x/ENG-1" };

describe("renderPromptTemplate", () => {
  it("fills every placeholder occurrence", () => {
    expect(renderPromptTemplate("{{identifier}} {{identifier}}: {{title}} ({{url}})", issue)).toBe(
      "ENG-1 ENG-1: Fix it (https://linear.app/x/ENG-1)",
    );
  });

  it("does not expand placeholders that appear inside an inserted value", () => {
    expect(renderPromptTemplate("{{title}} {{url}}", { ...issue, title: "see {{url}}" })).toBe(
      "see {{url}} https://linear.app/x/ENG-1",
    );
  });

  it("renders a missing description as nothing", () => {
    expect(renderPromptTemplate("{{title}}: {{description}}", { ...issue, description: null })).toBe("Fix it:");
  });

  it("falls back to the default for null or blank templates", () => {
    expect(renderPromptTemplate(null, issue)).toBe("Work on ENG-1: Fix it");
    expect(renderPromptTemplate("   ", issue)).toBe("Work on ENG-1: Fix it");
    expect(renderPromptTemplate(null, { ...issue, description: "Body text" })).toBe("Work on ENG-1: Fix it\n\nBody text");
    expect(DEFAULT_PROMPT_TEMPLATE).toContain("{{title}}");
  });
});

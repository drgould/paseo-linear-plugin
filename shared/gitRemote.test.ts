import { describe, expect, it } from "vitest";
import { parseGitHubSlug } from "./gitRemote";

describe("parseGitHubSlug", () => {
  it("parses an https remote", () => {
    expect(parseGitHubSlug("https://github.com/acme/repo.git")).toBe("acme/repo");
  });

  it("parses an scp-style ssh remote", () => {
    expect(parseGitHubSlug("git@github.com:acme/repo.git")).toBe("acme/repo");
  });

  it("parses a PR url", () => {
    expect(parseGitHubSlug("https://github.com/acme/repo/pull/42")).toBe("acme/repo");
  });

  it("lowercases the slug for case-insensitive comparison", () => {
    expect(parseGitHubSlug("https://github.com/Acme/Repo/pull/42")).toBe("acme/repo");
  });

  it("preserves dots inside the repo name instead of truncating at the first one", () => {
    expect(parseGitHubSlug("https://github.com/socketio/socket.io.git")).toBe("socketio/socket.io");
    expect(parseGitHubSlug("https://github.com/socketio/socket.io/pull/5")).toBe("socketio/socket.io");
  });

  it("returns null for a non-github url", () => {
    expect(parseGitHubSlug("https://gitlab.com/acme/repo/-/merge_requests/1")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(parseGitHubSlug("")).toBeNull();
  });
});

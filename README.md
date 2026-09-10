# paseo-linear-plugin

A [Paseo](https://paseo.sh) plugin for viewing Linear tickets and starting workspaces based on them.

## What it does

- Browse and view Linear tickets from within Paseo.
- Start a new Paseo workspace scoped to a selected ticket, pre-populated with its context.

Built against the [Paseo plugin API v0.8](https://paseo.sh/docs/plugins/v0.8).

## Status

Early scaffolding — not yet functional.

## Development

```bash
npm ci
npm run typecheck
npm test
```

PRs merge by squash only, and the PR title becomes the commit message on `main` — use a
[Conventional Commits](https://www.conventionalcommits.org/) title (`feat:`, `fix:`, `chore:`, …).
CI lints the title and runs typecheck + tests. [release-please](https://github.com/googleapis/release-please)
watches `main` and opens a release PR from those commits.

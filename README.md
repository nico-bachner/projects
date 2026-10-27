# Projects

Personal projects in a Bun workspace.

## Packages

- [Markdown Paper](packages/mdpaper/README.md): Markdown-to-PDF CLI with a bundled LaTeX engine.
- [Treasury](packages/treasury/README.md): reimbursement claims and approvals for the Sydney University Canoe Club.

## Development

Use the Bun version in `package.json`. Each package's README covers how to build and run it.

These checks run across the whole workspace:

```sh
bun ci
bun fmt
bun audit
bun check -b
bun test
```

Lefthook runs them before commits and builds every package before pushes. CI runs each of them, and the builds, as a separate job.

## Conventions

- Changes reach `main` through squash-merged pull requests, and the pull request title becomes the commit. CI requires titles to follow [Conventional Commits](https://www.conventionalcommits.org), scoped by the packages they affect: `feat(mdpaper): add a template option`, `fix(mdpaper,other): share date parsing`. Changes outside `packages/` have no scope: `ci: cache dependencies`.
- Package releases follow from those titles; see each package's README.
- Branches are named `<type>/<description>`, such as `feat/template-option`, or `wip/<description>` while in progress. Merging a pull request deletes its `wip/` branch.
- Branches hold one focused commit per logical change, on the latest `main`.
- Code has no comments. Anything that needs explaining goes in the relevant README.
- Configs use platform and library defaults where possible and omit settings that match them. Infrastructure is the exception: OpenTofu declares every setting, defaults included.

## Agents

Agents MAY:

- create `wip/` branches, even when their session assigns another name
- push and force-push `wip/` branches at any time
- enable squash auto-merge on pull requests

Agents MUST NOT, unless asked:

- open pull requests
- create branches outside `wip/`

## Infrastructure

OpenTofu configuration lives in [infra](infra/README.md).

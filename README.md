# Projects

Personal projects in a Bun workspace.

## Packages

- [Markdown Paper](packages/mdpaper/README.md): Markdown-to-PDF CLI with a bundled LaTeX engine.

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
- Code has no comments. Anything that needs explaining goes in the relevant README.
- Configs use platform and library defaults where possible and omit settings that match them. Infrastructure is the exception: OpenTofu declares every setting, defaults included.

## Infrastructure

OpenTofu configuration lives in [infra](infra/README.md).

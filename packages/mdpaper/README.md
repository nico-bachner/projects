# Markdown Paper

Markdown and YAML frontmatter to PDF, with a bundled LaTeX engine.

## Install

The executable includes Bun, Tectonic, and the default template, so no separate runtime or TeX installation is needed. Tectonic downloads and caches TeX resources on first use; custom templates may require installed fonts.

With Homebrew on macOS (Apple Silicon):

```sh
brew install nico-bachner/tap/mdpaper
```

With [mise](https://mise.jdx.dev) on macOS or Linux:

```sh
mise use 'github:nico-bachner/projects[version_prefix=mdpaper-v]@latest'
```

Or download the archive for your platform from [GitHub Releases](https://github.com/nico-bachner/projects/releases) (`darwin-arm64`, `linux-x64`, or `linux-arm64`) and extract it:

```sh
tar -xzf mdpaper-linux-x64.tar.gz
./mdpaper build paper.md
```

## Development

From the workspace root:

```sh
bun ci
bun run build
./packages/mdpaper/dist/mdpaper build paper.md
```

`brew install --HEAD nico-bachner/tap/mdpaper` builds the latest `main` the same way.

## Releases

Every merge to `main` with releasable changes publishes a release. [git-cliff](https://git-cliff.org) reads the Conventional Commits that change files in `packages/mdpaper` since the last `mdpaper-v*` tag: `feat` bumps the minor version, `fix` and `perf` the patch version, and breaking changes the major version. Other types do not release. The release workflow builds executables for macOS ARM64, Linux x64, and Linux ARM64, and publishes them with `SHA256SUMS` and git-cliff's notes as a GitHub Release. Each platform builds on its own runner because the build bundles the Tectonic binary installed for that runner. It then updates the macOS formula in `nico-bachner/homebrew-tap`. Releases need the `HOMEBREW_TAP_TOKEN` Actions secret, which [infra](../../infra/README.md) manages.

## Input

Save this as `paper.md`:

```markdown
---
title: My paper
author: Alex Smith
---

## Introduction

A paragraph with **bold**, _emphasis_, and a [link](https://example.com).
```

Every document must start with YAML frontmatter. The title defaults to `Untitled essay`, author to empty, and date is hidden by default. Use `date: auto` for today's date, or provide a date as text. `date: false` and `date: ""` also hide it. Multiline author values are supported.

Pass files or folders; folders are searched recursively for `.md` files with frontmatter, skipping `.git`, `node_modules`, and `dist`. With no inputs, the CLI searches the current directory and offers an interactive picker, or builds all discovered documents in a noninteractive run.

## Options

```sh
mdpaper build paper.md notes/ --out-dir output --template custom.tex
```

| Option         | Default          | Purpose                                              |
| -------------- | ---------------- | ---------------------------------------------------- |
| `--out-dir`    | `dist`           | Output directory, relative to the current directory. |
| `--template`   | Bundled template | Custom LaTeX template.                               |
| `--help`, `-h` |                  | Show usage.                                          |

PDFs are named after their source files: `paper.md` becomes `dist/paper.pdf`. Duplicate names within a batch are rejected. Successful builds replace existing PDFs; failed builds preserve the previous output. Reported word counts are approximate and exclude frontmatter.

## Templates and Markdown support

Custom `.tex` templates need exactly one `{{body}}` placeholder. Use `{{title}}`, `{{author}}`, `{{date}}`, or additional frontmatter fields for metadata. Metadata is escaped as text; missing placeholder values cause an error. See [the default template](templates/default.tex) for an example.

Supported: paragraphs, `##` through `####` headings, bold, emphasis, HTTP(S) links, basic lists, blockquotes, inline code, and horizontal rules. Put the document title in frontmatter.

Currently unsupported: images, tables, code blocks, raw HTML, strikethrough, task lists, and ordered lists starting after 1.

## Implementation notes

- Metadata field names are validated on the whole record, not as record keys, because Zod replaces key errors with a generic message.
- The bundled Tectonic binary is copied to a temporary directory before it runs, because the operating system cannot execute a file embedded in the Markdown Paper executable.
- A failed build leaves any existing PDF in place.
- The release workflow passes the bare version as `tag-name` to bump-homebrew-formula-action, which reads the formula version from it.

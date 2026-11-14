#!/usr/bin/env bun
import { spawn } from 'bun'
import { type BuildOutcome, buildDocuments } from './lib/build'
import { cancel, isCancel, log, multiselect } from '@clack/prompts'
import { compilePdf } from './lib/pdf'
import { discoverDocuments } from './lib/inputs'
import { parseArgs } from 'node:util'
import path from 'node:path'
import process from 'node:process'

type CliOptions = Readonly<{
  inputs: readonly string[]
  output: string | null
  templatePath: string | null
  open: boolean
  verbose: boolean
  wordCountPage: boolean
}>

const displayPath = (filename: string): string =>
  path.relative(process.cwd(), filename)

const selectDocuments = (inputs: readonly string[]): Promise<string[]> => {
  if (inputs.length > 0) {
    return Promise.resolve(discoverDocuments(inputs))
  }
  const documents = discoverDocuments([process.cwd()])
  if (!process.stdin.isTTY) {
    return Promise.resolve(documents)
  }
  return multiselect({
    message: 'Choose documents to build',
    options: documents.map((filename) => ({
      label: displayPath(filename),
      value: filename,
    })),
    required: true,
  }).then((selection) => {
    if (isCancel(selection)) {
      cancel('Build cancelled')
      return []
    }
    return selection
  })
}

const openCommand = (): string =>
  process.platform === 'darwin' ? 'open' : 'xdg-open'

const openPdf = (filename: string): void => {
  try {
    spawn([openCommand(), filename], {
      stderr: 'ignore',
      stdout: 'ignore',
    }).unref()
  } catch (error) {
    log.warn(`Could not open ${displayPath(filename)}: ${errorMessage(error)}`)
  }
}

const reportOutcome = (outcome: BuildOutcome): void => {
  if (outcome.ok) {
    const { outputPath: destination, sections, wordCount } = outcome.result
    const breakdown = sections
      .filter((section) => section.title !== null)
      .map(
        (section) =>
          `${'  '.repeat(section.level - 2)}${section.title} · ${section.wordCount}${section.counted ? '' : ' (not counted)'}`,
      )
    log.success(
      [`${displayPath(destination)} · ${wordCount} words`, ...breakdown].join(
        '\n',
      ),
    )
    return
  }
  log.error(
    `${displayPath(outcome.sourcePath)}: ${errorMessage(outcome.error)}`,
  )
}

const buildSelectedDocuments = (
  files: readonly string[],
  options: CliOptions,
): Promise<void> => {
  if (files.length === 0) {
    return Promise.resolve()
  }
  const onOutcome = (outcome: BuildOutcome): void => {
    reportOutcome(outcome)
    if (options.open && outcome.ok) {
      openPdf(outcome.result.outputPath)
    }
  }
  const compile = (latex: string, outputPath: string): Promise<void> =>
    compilePdf(latex, outputPath, options.verbose)
  return buildDocuments(files, { ...options, compile }, onOutcome).then(
    (outcomes) => {
      const failures = outcomes.filter((outcome) => !outcome.ok)
      if (failures.length > 0)
        throw new Error(`${failures.length} document(s) failed to build.`)
    },
  )
}

const runBuild = (options: CliOptions): Promise<void> =>
  Promise.resolve()
    .then(() => selectDocuments(options.inputs))
    .then((files) => buildSelectedDocuments(files, options))

const usage = `Usage: mdpaper build [files or folders...] [options]

Options:
  -o, --output <file>    PDF path, for a single document (default: beside the source)
  --template <file>      Custom LaTeX template
  --open                 Open each built PDF
  --verbose              Show the LaTeX engine's log
  --word-count           Add a page with the word count by section
  -h, --help             Show this help
`

class UsageError extends Error {}

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const readArgs = () => {
  try {
    return parseArgs({
      allowPositionals: true,
      args: process.argv.slice(2),
      options: {
        help: { short: 'h', type: 'boolean' },
        open: { type: 'boolean' },
        verbose: { type: 'boolean' },
        'word-count': { type: 'boolean' },
        output: { short: 'o', type: 'string' },
        template: { type: 'string' },
      },
    })
  } catch (error) {
    const [problem = ''] = errorMessage(error).split(/(?<=\.) /u)
    throw new UsageError(`${problem}\n\n${usage}`)
  }
}

const parseOptions = (): CliOptions | false => {
  const { values, positionals } = readArgs()
  if (values.help) {
    process.stdout.write(usage)
    return false
  }
  const inputs = positionals.filter(
    (value, index) => value !== 'build' || index !== 0,
  )
  return {
    inputs,
    open: values.open ?? false,
    output: values.output ? path.resolve(values.output) : null,
    verbose: values.verbose ?? false,
    wordCountPage: values['word-count'] ?? false,
    templatePath: values.template ? path.resolve(values.template) : null,
  }
}

if (import.meta.main) {
  await Promise.resolve()
    .then(() => {
      const options = parseOptions()
      if (options !== false) {
        return runBuild(options)
      }
    })
    .catch((error) => {
      log.error(
        error instanceof UsageError
          ? error.message
          : `Build failed: ${errorMessage(error)}`,
      )
      process.exitCode = 1
    })
}

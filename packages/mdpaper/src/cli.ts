#!/usr/bin/env bun
import { cancel, isCancel, log, multiselect } from '@clack/prompts'
import {
  discoverDocuments,
  outputPath,
  validateOutputNames,
} from './lib/inputs'
import { parseArgs } from 'node:util'
import { readFileSync } from 'node:fs'
import { compilePdf } from './lib/pdf'
import path from 'node:path'
import { prepareDocument } from './lib/document'
import process from 'node:process'
import defaultTemplate from '../templates/default.tex' with { type: 'text' }

type BuildOptions = Readonly<{
  inputs: readonly string[]
  outputDirectory: string
  templatePath: string | null
}>

type BuildResult = Readonly<{
  sourcePath: string
  outputPath: string
  wordCount: number
}>

type BuildOutcome =
  | Readonly<{ ok: true; result: BuildResult }>
  | Readonly<{ ok: false; sourcePath: string; error: unknown }>

const buildDocument = (
  sourcePath: string,
  template: string,
  outputDirectory: string,
): Promise<BuildResult> => {
  const document = prepareDocument(readFileSync(sourcePath, 'utf8'), template)
  const destination = outputPath(sourcePath, outputDirectory)
  return compilePdf(document.latex, destination).then(() => ({
    outputPath: destination,
    sourcePath,
    wordCount: document.wordCount,
  }))
}

const tryBuildDocument = (
  sourcePath: string,
  template: string,
  outputDirectory: string,
): Promise<BuildOutcome> => {
  try {
    return buildDocument(sourcePath, template, outputDirectory)
      .then((result): BuildOutcome => ({ ok: true, result }))
      .catch((error): BuildOutcome => ({ error, ok: false, sourcePath }))
  } catch (error) {
    return Promise.resolve({ error, ok: false, sourcePath })
  }
}

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

const reportOutcome = (outcome: BuildOutcome): void => {
  if (outcome.ok) {
    const { outputPath: destination, wordCount } = outcome.result
    log.success(`${displayPath(destination)} · ${wordCount} words`)
    return
  }
  log.error(`${displayPath(outcome.sourcePath)}: ${String(outcome.error)}`)
}

const buildSelectedDocuments = (
  files: readonly string[],
  options: BuildOptions,
): Promise<void> => {
  if (files.length === 0) {
    return Promise.resolve()
  }
  validateOutputNames(files)
  const template = options.templatePath
    ? readFileSync(options.templatePath, 'utf8')
    : defaultTemplate
  return Promise.all(
    files.map((filename) =>
      tryBuildDocument(filename, template, options.outputDirectory).then(
        (outcome) => {
          reportOutcome(outcome)
          return outcome
        },
      ),
    ),
  ).then((outcomes) => {
    const failures = outcomes.filter((outcome) => !outcome.ok)
    if (failures.length > 0)
      throw new Error(`${failures.length} document(s) failed to build.`)
  })
}

const runBuild = (options: BuildOptions): Promise<void> =>
  Promise.resolve()
    .then(() => selectDocuments(options.inputs))
    .then((files) => buildSelectedDocuments(files, options))

const parseOptions = (): BuildOptions | false => {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    args: process.argv.slice(2),
    options: {
      help: { short: 'h', type: 'boolean' },
      'out-dir': { default: 'dist', type: 'string' },
      template: { type: 'string' },
    },
  })
  if (values.help) {
    process.stdout.write(
      'Usage: mdpaper build [files or folders...] [--out-dir dist] [--template paper.tex]\n',
    )
    return false
  }
  const inputs = positionals.filter(
    (value, index) => value !== 'build' || index !== 0,
  )
  return {
    inputs,
    outputDirectory: path.resolve(values['out-dir']),
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
      log.error(`Build failed: ${String(error)}`)
      process.exitCode = 1
    })
}

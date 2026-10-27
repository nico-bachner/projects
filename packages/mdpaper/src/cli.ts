#!/usr/bin/env bun
import { type BuildOutcome, buildDocuments } from './lib/build'
import { cancel, isCancel, log, multiselect } from '@clack/prompts'
import { discoverDocuments } from './lib/inputs'
import { parseArgs } from 'node:util'
import path from 'node:path'
import process from 'node:process'

type CliOptions = Readonly<{
  inputs: readonly string[]
  outputDirectory: string
  templatePath: string | null
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
  options: CliOptions,
): Promise<void> => {
  if (files.length === 0) {
    return Promise.resolve()
  }
  return buildDocuments(files, options, reportOutcome).then((outcomes) => {
    const failures = outcomes.filter((outcome) => !outcome.ok)
    if (failures.length > 0)
      throw new Error(`${failures.length} document(s) failed to build.`)
  })
}

const runBuild = (options: CliOptions): Promise<void> =>
  Promise.resolve()
    .then(() => selectDocuments(options.inputs))
    .then((files) => buildSelectedDocuments(files, options))

const parseOptions = (): CliOptions | false => {
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

import { readFileSync, readdirSync, realpathSync, statSync } from 'node:fs'
import path from 'node:path'

const excludedDirectories = new Set(['.git', 'node_modules', 'dist'])
const frontmatterStart = /^(?:\uFEFF)?---\r?\n/u

const discoverDirectory = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true })
    .filter(
      (entry) =>
        !entry.isSymbolicLink() && !excludedDirectories.has(entry.name),
    )
    .flatMap((entry) => {
      const filename = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        return discoverDirectory(filename)
      }
      if (
        entry.isFile() &&
        entry.name.endsWith('.md') &&
        frontmatterStart.test(readFileSync(filename, 'utf8'))
      ) {
        return [filename]
      }
      return []
    })

const discoverInput = (input: string): string[] => {
  const resolved = realpathSync(input)
  if (statSync(resolved).isDirectory()) {
    return discoverDirectory(resolved)
  }
  if (path.extname(resolved) !== '.md') {
    throw new Error(`Expected a Markdown file: ${input}`)
  }
  return [resolved]
}

export const discoverDocuments = (inputs: readonly string[]): string[] => {
  const documents = [
    ...new Set(inputs.flatMap((input) => discoverInput(input))),
  ].toSorted()
  if (documents.length === 0) {
    throw new Error('No Markdown documents with frontmatter found.')
  }
  return documents
}

export const outputPath = (
  sourcePath: string,
  outputDirectory: string,
): string =>
  path.join(outputDirectory, `${path.basename(sourcePath, '.md')}.pdf`)

export const validateOutputNames = (files: readonly string[]): void => {
  const names = files.map((file) => path.basename(file, '.md').toLowerCase())
  if (new Set(names).size !== names.length) {
    throw new Error(
      'Choose documents with unique filenames; generated PDFs share one folder.',
    )
  }
}

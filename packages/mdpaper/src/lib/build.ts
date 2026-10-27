import { compilePdf } from './pdf'
import defaultTemplate from '../../templates/default.tex' with { type: 'text' }
import path from 'node:path'
import { prepareDocument } from './document'
import { readFileSync } from 'node:fs'

export type Compile = (latex: string, outputPath: string) => Promise<void>

export type BuildOptions = Readonly<{
  outputDirectory: string
  templatePath: string | null
  compile?: Compile
}>

export type BuildResult = Readonly<{
  sourcePath: string
  outputPath: string
  wordCount: number
}>

export type BuildOutcome =
  | Readonly<{ ok: true; result: BuildResult }>
  | Readonly<{ ok: false; sourcePath: string; error: unknown }>

const outputPath = (sourcePath: string, outputDirectory: string): string =>
  path.join(outputDirectory, `${path.basename(sourcePath, '.md')}.pdf`)

const validateOutputNames = (files: readonly string[]): void => {
  const names = files.map((file) => path.basename(file, '.md').toLowerCase())
  if (new Set(names).size !== names.length) {
    throw new Error(
      'Choose documents with unique filenames; generated PDFs share one folder.',
    )
  }
}

const buildDocument = (
  sourcePath: string,
  template: string,
  outputDirectory: string,
  compile: Compile,
): Promise<BuildOutcome> => {
  try {
    const document = prepareDocument(readFileSync(sourcePath, 'utf8'), template)
    const destination = outputPath(sourcePath, outputDirectory)
    return compile(document.latex, destination)
      .then((): BuildOutcome => ({
        ok: true,
        result: {
          outputPath: destination,
          sourcePath,
          wordCount: document.wordCount,
        },
      }))
      .catch((error): BuildOutcome => ({ error, ok: false, sourcePath }))
  } catch (error) {
    return Promise.resolve({ error, ok: false, sourcePath })
  }
}

export const buildDocuments = (
  files: readonly string[],
  options: BuildOptions,
  onOutcome: (outcome: BuildOutcome) => void,
): Promise<BuildOutcome[]> =>
  Promise.resolve().then(() => {
    validateOutputNames(files)
    const template = options.templatePath
      ? readFileSync(options.templatePath, 'utf8')
      : defaultTemplate
    const compile = options.compile ?? compilePdf
    return Promise.all(
      files.map((file) =>
        buildDocument(file, template, options.outputDirectory, compile).then(
          (outcome) => {
            onOutcome(outcome)
            return outcome
          },
        ),
      ),
    )
  })

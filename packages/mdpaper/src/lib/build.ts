import { compilePdf } from './pdf'
import defaultTemplate from '../../templates/default.tex' with { type: 'text' }
import path from 'node:path'
import { prepareDocument } from './document'
import { readFileSync } from 'node:fs'

export type Compile = (latex: string, outputPath: string) => Promise<void>

export type BuildOptions = Readonly<{
  output: string | null
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

const outputPath = (sourcePath: string, output: string | null): string =>
  output ??
  path.join(path.dirname(sourcePath), `${path.basename(sourcePath, '.md')}.pdf`)

const validateOutputNames = (
  files: readonly string[],
  output: string | null,
): void => {
  if (output !== null && files.length !== 1) {
    throw new Error('Choose one document when setting an output path.')
  }
  const names = files.map((file) => outputPath(file, output).toLowerCase())
  if (new Set(names).size !== names.length) {
    throw new Error(
      'Choose documents with unique filenames; their PDFs would share a path.',
    )
  }
}

const buildDocument = (
  sourcePath: string,
  template: string,
  output: string | null,
  compile: Compile,
): Promise<BuildOutcome> => {
  try {
    const document = prepareDocument(readFileSync(sourcePath, 'utf8'), template)
    const destination = outputPath(sourcePath, output)
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
    validateOutputNames(files, options.output)
    const template = options.templatePath
      ? readFileSync(options.templatePath, 'utf8')
      : defaultTemplate
    const compile = options.compile ?? compilePdf
    return Promise.all(
      files.map((file) =>
        buildDocument(file, template, options.output, compile).then(
          (outcome) => {
            onOutcome(outcome)
            return outcome
          },
        ),
      ),
    )
  })

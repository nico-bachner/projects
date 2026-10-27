import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { type BuildOutcome, buildDocuments } from './build'
import os from 'node:os'
import path from 'node:path'

let directory = ''
let compiled: Record<string, string> = {}

const compile = (latex: string, outputPath: string): Promise<void> => {
  if (latex.includes('Broken')) {
    return Promise.reject(new Error('engine failed'))
  }
  compiled[outputPath] = latex
  return Promise.resolve()
}

const writeDocument = (name: string, source: string): string => {
  const filename = path.join(directory, name)
  writeFileSync(filename, source)
  return filename
}

const build = (
  files: readonly string[],
  templatePath: string | null = null,
): Promise<BuildOutcome[]> =>
  buildDocuments(
    files,
    { compile, outputDirectory: path.join(directory, 'dist'), templatePath },
    () => {},
  )

beforeEach(() => {
  directory = mkdtempSync(path.join(os.tmpdir(), 'mdpaper-build-'))
  compiled = {}
})

afterEach(() => {
  rmSync(directory, { force: true, recursive: true })
})

describe('buildDocuments', () => {
  test('names each PDF after its source in the output folder', async () => {
    const source = writeDocument(
      'essay.md',
      '---\ntitle: Essay\n---\nOne two three\n',
    )
    const [outcome] = await build([source])
    expect(outcome).toEqual({
      ok: true,
      result: {
        outputPath: path.join(directory, 'dist', 'essay.pdf'),
        sourcePath: source,
        wordCount: 3,
      },
    })
  })

  test('fills the bundled template by default', async () => {
    await build([writeDocument('essay.md', '---\ntitle: Essay\n---\nBody\n')])
    expect(Object.values(compiled)[0]).toContain('\\documentclass')
  })

  test('fills a custom template', async () => {
    const templatePath = path.join(directory, 'custom.tex')
    writeFileSync(templatePath, 'TITLE={{title}} {{body}}')
    await build(
      [writeDocument('essay.md', '---\ntitle: Essay\n---\nBody\n')],
      templatePath,
    )
    expect(Object.values(compiled)[0]).toBe('TITLE=Essay Body\\par\n\n')
  })

  test('keeps building when one document fails', async () => {
    const reported: BuildOutcome[] = []
    const outcomes = await buildDocuments(
      [
        writeDocument('broken.md', '---\ntitle: Broken\n---\n'),
        writeDocument('invalid.md', '# No frontmatter\n'),
        writeDocument('good.md', '---\ntitle: Good\n---\n'),
      ],
      { compile, outputDirectory: directory, templatePath: null },
      (outcome) => reported.push(outcome),
    )
    expect(outcomes.map((outcome) => outcome.ok)).toEqual([false, false, true])
    expect(reported).toHaveLength(3)
  })

  test('rejects documents whose PDFs would collide', async () => {
    await expect(
      build([
        writeDocument('essay.md', '---\n---\n'),
        writeDocument('Essay.md', '---\n---\n'),
      ]),
    ).rejects.toThrow('unique filenames')
    expect(compiled).toEqual({})
  })

  test('rejects a missing template before building', async () => {
    await expect(
      build(
        [writeDocument('essay.md', '---\n---\n')],
        path.join(directory, 'missing.tex'),
      ),
    ).rejects.toThrow()
    expect(compiled).toEqual({})
  })
})

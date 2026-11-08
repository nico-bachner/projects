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
  buildDocuments(files, { compile, output: null, templatePath }, () => {})

beforeEach(() => {
  directory = mkdtempSync(path.join(os.tmpdir(), 'mdpaper-build-'))
  compiled = {}
})

afterEach(() => {
  rmSync(directory, { force: true, recursive: true })
})

describe('buildDocuments', () => {
  test('writes to the chosen output path', async () => {
    const output = path.join(directory, 'out', 'final.pdf')
    const [outcome] = await buildDocuments(
      [writeDocument('essay.md', '---\ntitle: Essay\n---\n')],
      { compile, output, templatePath: null },
      () => {},
    )
    expect(outcome?.ok && outcome.result.outputPath).toBe(output)
  })

  test('rejects an output path for several documents', async () => {
    await expect(
      buildDocuments(
        [
          writeDocument('a.md', '---\ntitle: A\n---\n'),
          writeDocument('b.md', '---\ntitle: B\n---\n'),
        ],
        { compile, output: path.join(directory, 'x.pdf'), templatePath: null },
        () => {},
      ),
    ).rejects.toThrow('one document')
  })

  test('names each PDF after its source', async () => {
    const source = writeDocument(
      'essay.md',
      '---\ntitle: Essay\n---\nOne two three\n',
    )
    const [outcome] = await build([source])
    expect(outcome).toEqual({
      ok: true,
      result: {
        outputPath: path.join(directory, 'essay.pdf'),
        sourcePath: source,
        wordCount: 3,
      },
    })
  })

  test('writes each PDF beside its source by default', async () => {
    const source = writeDocument('essay.md', '---\ntitle: Essay\n---\n')
    const [outcome] = await buildDocuments(
      [source],
      { compile, output: null, templatePath: null },
      () => {},
    )
    expect(outcome?.ok && outcome.result.outputPath).toBe(
      path.join(directory, 'essay.pdf'),
    )
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
      { compile, output: null, templatePath: null },
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

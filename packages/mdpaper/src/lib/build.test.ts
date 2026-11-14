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
        sections: [{ counted: true, level: 1, title: null, wordCount: 3 }],
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

  test('turns bare URLs into breakable links', async () => {
    await build([
      writeDocument(
        'essay.md',
        '---\ntitle: Essay\n---\nSee https://example.com/a_b.\n',
      ),
    ])
    expect(Object.values(compiled)[0]).toContain(
      'See \\url{https://example.com/a_b}.',
    )
  })

  test('curls straight quotes', async () => {
    await build([
      writeDocument(
        'essay.md',
        '---\ntitle: Essay\n---\nShe said "What we *may* be" and \'maybe\' (\"so\") it\'s **"bold"**.\n',
      ),
    ])
    expect(Object.values(compiled)[0]).toContain(
      'She said \u201CWhat we \\textit{may} be\u201D and \u2018maybe\u2019 (\u201Cso\u201D) it\u2019s \\textbf{\u201Cbold\u201D}.',
    )
  })

  test('counts words in each section', async () => {
    const [outcome] = await build([
      writeDocument(
        'essay.md',
        '---\ntitle: Essay\n---\nOpening words\n\n## Intro\n\nOne **two** three\n\n### Detail\n\n- Four\n- Five\n',
      ),
    ])
    expect(outcome?.ok && outcome.result).toMatchObject({
      sections: [
        { level: 1, title: null, wordCount: 2 },
        { level: 2, title: 'Intro', wordCount: 7 },
        { level: 3, title: 'Detail', wordCount: 3 },
      ],
      wordCount: 9,
    })
  })

  test('counts each section with its subsections', async () => {
    const [outcome] = await build([
      writeDocument(
        'essay.md',
        '---\ntitle: Essay\n---\n## A\n\none\n\n### B\n\ntwo\n\n#### C\n\nthree\n\n### D\n\nfour\n\n## E\n\nfive\n',
      ),
    ])
    expect(
      outcome?.ok &&
        outcome.result.sections.map(({ title, wordCount }) => [
          title,
          wordCount,
        ]),
    ).toEqual([
      ['A', 8],
      ['B', 4],
      ['C', 2],
      ['D', 2],
      ['E', 2],
    ])
    expect(outcome?.ok && outcome.result.wordCount).toBe(10)
  })

  test('stops counting at the end marker', async () => {
    const [outcome] = await build([
      writeDocument(
        'essay.md',
        '---\ntitle: Essay\n---\n## Body\n\none two\n\n<!-- end word count -->\n\n## References\n\nthree four five\n',
      ),
    ])
    expect(outcome?.ok && outcome.result).toMatchObject({
      sections: [
        { counted: true, title: 'Body', wordCount: 3 },
        { counted: false, title: 'References', wordCount: 4 },
      ],
      wordCount: 3,
    })
    const latex = Object.values(compiled)[0]
    expect(latex).toContain('References')
    expect(latex).not.toContain('end word count')
  })

  test('starts counting at the start marker', async () => {
    const [outcome] = await build([
      writeDocument(
        'essay.md',
        '---\ntitle: Essay\n---\nWhat is the question?\n\n<!-- start word count -->\n\n## Body\n\none two\n\n<!-- end word count -->\n\n## References\n\nthree\n',
      ),
    ])
    expect(outcome?.ok && outcome.result).toMatchObject({
      sections: [
        { counted: false, title: null, wordCount: 4 },
        { counted: true, title: 'Body', wordCount: 3 },
        { counted: false, title: 'References', wordCount: 2 },
      ],
      wordCount: 3,
    })
    const latex = Object.values(compiled)[0]
    expect(latex).toContain('What is the question?')
    expect(latex).not.toContain('word count -->')
  })

  test('ignores an end marker before the start marker', async () => {
    const [outcome] = await build([
      writeDocument(
        'essay.md',
        '---\ntitle: Essay\n---\nskipped\n\n<!-- end word count -->\n\nalso skipped\n\n<!-- start word count -->\n\none two\n',
      ),
    ])
    expect(outcome?.ok && outcome.result.wordCount).toBe(2)
  })

  test('adds a word count page when asked', async () => {
    const source = writeDocument(
      'essay.md',
      '---\ntitle: Essay\n---\nOpening words\n\n## R&D\n\nOne two\n',
    )
    await buildDocuments(
      [source],
      { compile, output: null, templatePath: null, wordCountPage: true },
      () => {},
    )
    const latex = Object.values(compiled)[0]
    expect(latex).toContain('\\section*{Word count}')
    expect(latex).toContain('\\textit{Before the first heading} & 2 \\\\')
    expect(latex).toContain('R\\&D & 3 \\\\')
    expect(latex).toContain('Total & 5 \\\\')
  })

  test('leaves out the word count page by default', async () => {
    await build([writeDocument('essay.md', '---\ntitle: Essay\n---\nBody\n')])
    expect(Object.values(compiled)[0]).not.toContain('Word count')
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

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  setDefaultTimeout,
  test,
} from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { formatDocument } from './format'
import os from 'node:os'
import path from 'node:path'

setDefaultTimeout(30_000)

let directory = ''

const writeDocument = (source: string): string => {
  const filename = path.join(directory, 'essay.md')
  writeFileSync(filename, source)
  return filename
}

beforeEach(() => {
  directory = mkdtempSync(path.join(os.tmpdir(), 'mdpaper-format-'))
})

afterEach(() => {
  rmSync(directory, { force: true, recursive: true })
})

describe('formatDocument', () => {
  test('formats a document in place', () => {
    const file = writeDocument('---\ntitle:   Essay\n---\n## Intro\n* one\n')
    expect(formatDocument(file, false)).toBe('formatted')
    expect(readFileSync(file, 'utf8')).toBe(
      '---\ntitle: Essay\n---\n\n## Intro\n\n- one\n',
    )
  })

  test('leaves a formatted document alone', () => {
    const file = writeDocument('---\ntitle: Essay\n---\n\nBody\n')
    expect(formatDocument(file, false)).toBe('unchanged')
  })

  test('only reports in check mode', () => {
    const source = '---\ntitle:   Essay\n---\nBody\n'
    const file = writeDocument(source)
    expect(formatDocument(file, true)).toBe('needs formatting')
    expect(readFileSync(file, 'utf8')).toBe(source)
  })
})

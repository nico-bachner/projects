import { describe, expect, test } from 'bun:test'

import { parseDocument } from './metadata'

describe('parseDocument', () => {
  test('splits frontmatter from markdown', () => {
    const { markdown, metadata } = parseDocument(
      '---\ntitle: Essay\nauthor: Ada\n---\n# Heading\n',
    )
    expect(metadata).toEqual({ author: 'Ada', title: 'Essay' })
    expect(markdown).toBe('# Heading\n')
  })

  test('fills defaults and stringifies numbers', () => {
    const { metadata } = parseDocument('---\nstudent_id: 42\n---\n')
    expect(metadata).toEqual({
      author: '',
      student_id: '42',
      title: 'Untitled essay',
    })
  })

  test('ignores a byte order mark', () => {
    expect(parseDocument('﻿---\ntitle: Essay\n---\n').metadata.title).toBe(
      'Essay',
    )
  })

  test('rejects missing frontmatter', () => {
    expect(() => parseDocument('# Heading\n')).toThrow('YAML frontmatter')
  })

  test('rejects the reserved body field', () => {
    expect(() => parseDocument('---\nbody: text\n---\n')).toThrow(
      'body is reserved for the rendered essay',
    )
  })

  test('rejects invalid field names', () => {
    expect(() => parseDocument('---\n2nd-author: Ada\n---\n')).toThrow(
      'Use a field name such as title or student_id',
    )
  })

  test('rejects blank custom fields', () => {
    expect(() => parseDocument("---\ncourse: ' '\n---\n")).toThrow(
      'Must not be blank',
    )
  })
})

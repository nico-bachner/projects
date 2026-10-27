import { expect, test } from 'bun:test'

import { parseCsv } from './csv'

test('parses quoted fields, escaped quotes and CRLF', () => {
  expect(parseCsv('a,"$1,660.00","say ""hi"""\r\nb,,c\n')).toEqual([
    ['a', '$1,660.00', 'say "hi"'],
    ['b', '', 'c'],
  ])
})

test('rejects an unterminated quote', () => {
  expect(() => parseCsv('a,"b\n')).toThrow('Unterminated')
})

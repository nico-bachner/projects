import { describe, expect, test } from 'bun:test'

import { ledgerCsv } from './fixtures'
import { parseLedger } from './ledger'
import { matchReceipts, parseReceiptName } from './receipts'

const { expenses } = parseLedger(ledgerCsv)

describe('parseReceiptName', () => {
  test('reads the date, item and extension', () => {
    expect(parseReceiptName('2026-01-01 Boat Lights.PDF')).toEqual({
      file: '2026-01-01 Boat Lights.PDF',
      date: '2026-01-01',
      item: 'Boat Lights',
      extension: 'pdf',
    })
    expect(parseReceiptName('scan.pdf')).toBeUndefined()
  })
})

describe('matchReceipts', () => {
  test('matches on date, using vendor and description to break ties', () => {
    const { matches } = matchReceipts(expenses, [
      '2026-02-06 Paddle Victoria Team Entry.pdf',
      '2026-04-01 Fuel.jpg',
    ])
    expect(matches.get(5)).toBe('2026-02-06 Paddle Victoria Team Entry.pdf')
    expect(matches.get(9)).toBe('2026-04-01 Fuel.jpg')
  })

  test('falls back to nearby dates', () => {
    const { matches } = matchReceipts(expenses, ['2026-01-22 Epoxy Resin.pdf'])
    expect(matches.get(6)).toBe('2026-01-22 Epoxy Resin.pdf')
  })

  test('reports ties, unknown names and missing receipts', () => {
    const { matches, anomalies } = matchReceipts(expenses, [
      '2026-10-05 Hosting.pdf',
      'IMG_0001.jpg',
    ])
    expect(matches.size).toBe(0)
    expect(
      anomalies
        .filter(({ kind }) => kind !== 'no-receipt')
        .map(({ file, kind }) => [file, kind]),
    ).toEqual([
      ['IMG_0001.jpg', 'unmatched-receipt'],
      ['2026-10-05 Hosting.pdf', 'ambiguous-receipt'],
    ])
    expect(anomalies.filter(({ kind }) => kind === 'no-receipt')).toHaveLength(
      8,
    )
  })

  test('reports a second receipt for a line that already has one', () => {
    const { matches, anomalies } = matchReceipts(expenses, [
      '2026-04-01 Fuel.jpg',
      '2026-04-01 Fuel receipt.pdf',
    ])
    expect(matches.size).toBe(1)
    expect(anomalies.some(({ kind }) => kind === 'ambiguous-receipt')).toBe(
      true,
    )
  })

  test('follows receipt overrides', () => {
    const { matches, anomalies } = matchReceipts(
      expenses,
      ['2026-02-06 Entry.pdf', 'menu.pdf'],
      { receipts: { '2026-02-06 Entry.pdf': 4, 'menu.pdf': null } },
    )
    expect([...matches]).toEqual([[4, '2026-02-06 Entry.pdf']])
    expect(anomalies.some(({ file }) => file === 'menu.pdf')).toBe(false)
  })
})

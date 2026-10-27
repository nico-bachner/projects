import { describe, expect, test } from 'bun:test'

import { ledgerCsv } from './fixtures'
import { parseLedger } from './ledger'

describe('parseLedger', () => {
  test('normalises amounts, dates, disciplines and statuses', () => {
    const { expenses } = parseLedger(ledgerCsv)
    expect(expenses[0]).toEqual({
      line: 2,
      date: '2026-10-05',
      payer: 'Alex Smith',
      amountCents: 16627,
      category: 'Website',
      discipline: null,
      vendor: 'Namecheap',
      description: 'Hosting',
      status: 'submitted',
    })
    expect(expenses.find(({ line }) => line === 7)?.amountCents).toBe(147191)
    expect(expenses.find(({ line }) => line === 4)?.status).toBe('reimbursed')
  })

  test('applies spelling corrections', () => {
    const { expenses, anomalies } = parseLedger(ledgerCsv)
    expect(expenses.find(({ line }) => line === 9)?.vendor).toBe(
      'Metro Petroleum',
    )
    expect(expenses.find(({ line }) => line === 4)?.description).toBe(
      'Essendon Team Entry Fee',
    )
    expect(anomalies.filter(({ kind }) => kind === 'corrected')).toHaveLength(3)
  })

  test('reports invalid rows, duplicates and possible duplicates', () => {
    const { expenses, anomalies } = parseLedger(ledgerCsv)
    expect(expenses).toHaveLength(8)
    expect(
      anomalies
        .filter(({ kind }) => kind !== 'corrected')
        .map(({ line, kind }) => [line, kind]),
    ).toEqual([
      [10, 'invalid'],
      [3, 'duplicate'],
      [8, 'possible-duplicate'],
    ])
  })

  test('applies row overrides', () => {
    const { expenses, anomalies } = parseLedger(ledgerCsv, {
      rows: {
        '3': { skip: true },
        '2': { status: 'approved' },
        '10': {
          payer: 'Sam Lee',
          category: 'Gear',
          discipline: 'N/A',
          vendor: 'Bunnings',
          description: 'Rope',
          status: 'reimbursed',
        },
      },
    })
    expect(expenses.find(({ line }) => line === 2)?.status).toBe('approved')
    expect(expenses.some(({ line }) => line === 3)).toBe(false)
    expect(expenses.find(({ line }) => line === 10)?.vendor).toBe('Bunnings')
    expect(anomalies.some(({ kind }) => kind === 'invalid')).toBe(false)
  })

  test('rejects an unexpected header', () => {
    expect(() => parseLedger('Date,Amount\n')).toThrow('ledger header')
  })
})

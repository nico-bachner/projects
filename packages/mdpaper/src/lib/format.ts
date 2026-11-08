import { readFileSync } from 'node:fs'
import { spawnSync } from 'bun'
import process from 'node:process'

export type FormatStatus = 'unchanged' | 'formatted' | 'needs formatting'

const runFormatter = (file: string, check: boolean): number => {
  const result = spawnSync(
    [
      process.execPath,
      'fmt',
      '--no-script',
      ...(check ? ['--check'] : []),
      file,
    ],
    {
      env: { ...process.env, BUN_BE_BUN: '1' },
      stderr: 'pipe',
      stdout: 'pipe',
    },
  )
  return result.exitCode
}

export const formatDocument = (file: string, check: boolean): FormatStatus => {
  if (check) {
    return runFormatter(file, true) === 0 ? 'unchanged' : 'needs formatting'
  }
  const before = readFileSync(file, 'utf8')
  if (runFormatter(file, false) !== 0) {
    throw new Error(`Could not format ${file}.`)
  }
  return readFileSync(file, 'utf8') === before ? 'unchanged' : 'formatted'
}

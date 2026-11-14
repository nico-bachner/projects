import { expect, test } from 'bun:test'

test('every schema change has a migration', () => {
  const { stdout } = Bun.spawnSync(
    ['bunx', 'drizzle-kit', 'generate', '--explain', '--output', 'json'],
    { cwd: `${import.meta.dir}/..` },
  )
  expect(JSON.parse(stdout.toString())).toMatchObject({ status: 'no_changes' })
})

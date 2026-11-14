import path from 'node:path'

const directory = path.join(import.meta.dir, '../migrations')

export const migrationFiles = (): string[] =>
  [...new Bun.Glob('*/migration.sql').scanSync(directory)]
    .toSorted()
    .map((file) => path.join(directory, file))

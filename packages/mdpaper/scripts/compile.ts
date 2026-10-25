import * as Bun from 'bun'
import { binaryPath } from 'node-tectonic'
import path from 'node:path'

const root = path.resolve(import.meta.dir, '..')

const result = await Bun.build({
  entrypoints: [path.join(root, 'src/cli.ts')],
  compile: {
    outfile: path.join(root, 'dist/mdpaper'),
    assets: [binaryPath()],
  },
})

if (!result.success)
  throw new AggregateError(result.logs, 'Executable compilation failed.')

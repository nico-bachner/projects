import * as Bun from 'bun'
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { binaryPath } from 'node-tectonic'

export const compilePdf = (
  source: string,
  outputPath: string,
  verbose = false,
): Promise<void> => {
  const embeddedEngine = (Bun.embeddedFiles as readonly File[]).find(
    (file) => file.name.endsWith('/tectonic') || file.name === 'tectonic',
  )
  if (Bun.isStandaloneExecutable && !embeddedEngine) {
    throw new Error('Missing bundled LaTeX engine. Build with bun run build.')
  }
  const outputDirectory = path.dirname(outputPath)
  mkdirSync(outputDirectory, { recursive: true })
  const temporaryDirectory = mkdtempSync(path.join(outputDirectory, '.build-'))
  return Promise.resolve(
    embeddedEngine ? embeddedEngine.arrayBuffer() : null,
  ).then((engineBytes) => {
    try {
      const sourcePath = path.join(temporaryDirectory, 'essay.tex')
      writeFileSync(sourcePath, source)
      let engine = engineBytes ? '' : binaryPath()
      if (engineBytes) {
        engine = path.join(temporaryDirectory, 'tectonic')
        writeFileSync(engine, new Uint8Array(engineBytes))
        chmodSync(engine, 0o700)
      }
      const compilation = Bun.spawnSync(
        [engine, sourcePath, '--outdir', temporaryDirectory],
        {
          cwd: temporaryDirectory,
          stderr: verbose ? 'inherit' : 'pipe',
          stdout: verbose ? 'inherit' : 'pipe',
        },
      )
      if (compilation.exitCode !== 0) {
        const errors = [compilation.stdout, compilation.stderr]
          .flatMap((output) => output?.toString().split('\n') ?? [])
          .map(
            (line) => /^error: (?:[^:\s]+\.tex:\d+: )?(.*)$/u.exec(line)?.[1],
          )
          .filter((message) => message && !message.startsWith('halted on'))
        throw new Error(
          ['LaTeX could not typeset the document.', ...errors].join('\n'),
        )
      }
      renameSync(path.join(temporaryDirectory, 'essay.pdf'), outputPath)
    } finally {
      rmSync(temporaryDirectory, { force: true, recursive: true })
    }
  })
}

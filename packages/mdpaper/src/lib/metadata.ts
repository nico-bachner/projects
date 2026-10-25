import * as Bun from 'bun'
import { z } from 'zod'

const metadataValue = z
  .string()
  .refine((value) => value.trim().length > 0, 'Must not be blank')

const metadataKeyPattern = /^[A-Za-z_][A-Za-z0-9_]*$/u

const metadataSchema = z
  .record(
    z.string(),
    z.union([z.string(), z.number(), z.literal(false)]).transform((value) => {
      if (value === false) return value
      return String(value)
    }),
  )
  .superRefine((record, context) => {
    for (const key of Object.keys(record)) {
      if (!metadataKeyPattern.test(key)) {
        context.addIssue({
          code: 'custom',
          message: 'Use a field name such as title or student_id',
          path: [key],
        })
      } else if (key === 'body') {
        context.addIssue({
          code: 'custom',
          message: 'body is reserved for the rendered essay',
          path: [key],
        })
      }
    }
  })
  .pipe(
    z
      .object({
        author: z.string().default(''),
        date: z.union([z.string(), z.literal(false)]).optional(),
        title: metadataValue.default('Untitled essay'),
      })
      .catchall(metadataValue),
  )

export type Metadata = Readonly<z.infer<typeof metadataSchema>>
export type DocumentSource = Readonly<{ metadata: Metadata; markdown: string }>

export const parseDocument = (source: string): DocumentSource => {
  const frontmatterPattern =
    /^---\r?\n(?<yaml>[\s\S]*?)\r?\n---(?:\r?\n|$)(?<markdown>[\s\S]*)$/u
  const withoutByteOrderMark = source.replace(/^\uFEFF/u, '')
  const match = withoutByteOrderMark.match(frontmatterPattern)

  if (!match) {
    throw new Error(
      'Markdown must begin with YAML frontmatter between --- lines.',
    )
  }

  const [, yaml, markdown] = match
  const result = metadataSchema.safeParse(Bun.YAML.parse(yaml))

  if (!result.success) {
    throw new Error(`Invalid essay metadata:\n${z.prettifyError(result.error)}`)
  }

  return { markdown, metadata: result.data }
}

import type { Metadata } from './metadata'
import { escapeTex } from './tex'

const renderMetadataValue = (
  field: string,
  value: string | false | undefined,
): string => {
  if (value === false) {
    return ''
  }
  const text = value ?? ''
  if (field === 'date' && text === 'auto') {
    return String.raw`\today`
  }
  if (field === 'author') {
    return text
      .split(/\r?\n/u)
      .map((line) => escapeTex(line))
      .join(String.raw`\\`)
  }
  return escapeTex(text)
}

export const fillTemplate = (
  template: string,
  metadata: Metadata,
  body: string,
): string => {
  const replacements: Record<string, string> = Object.fromEntries([
    ['date', ''],
    ...Object.entries(metadata).map(([field, value]) => [
      field,
      renderMetadataValue(field, value),
    ]),
    ['body', body],
  ])

  if (template.split('{{body}}').length - 1 !== 1) {
    throw new Error('template.tex needs exactly one {{body}} placeholder.')
  }

  return template.replaceAll(/\{\{(?<key>\w+)\}\}/gu, (_placeholder, key) => {
    if (!Object.hasOwn(replacements, key)) {
      throw new Error(`Missing metadata for template placeholder: ${key}`)
    }
    return replacements[key]
  })
}

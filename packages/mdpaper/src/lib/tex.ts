const texEscapes: Record<string, string> = {
  '#': String.raw`\#`,
  $: '\\$',
  '%': String.raw`\%`,
  '&': String.raw`\&`,
  '\\': String.raw`\textbackslash{}`,
  '^': String.raw`\textasciicircum{}`,
  _: '\\_',
  '{': String.raw`\{`,
  '}': String.raw`\}`,
  '~': String.raw`\textasciitilde{}`,
}

export const escapeTex = (text: string): string =>
  text.replaceAll(/[\\&%$#_{}~^]/gu, (character) => texEscapes[character])

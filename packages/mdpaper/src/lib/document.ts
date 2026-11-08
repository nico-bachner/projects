import * as Bun from 'bun'
import { escapeTex } from './tex'
import { fillTemplate } from './template'
import { parseDocument } from './metadata'

const renderLink = (label: string, url: string): string => {
  const isWebUrl = /^https?:\/\//u.test(url)
  const hasUnsafeTexCharacters = /[\\{}%#\r\n]/u.test(url)

  if (!isWebUrl || hasUnsafeTexCharacters) {
    throw new Error(`Unsupported URL: ${url}`)
  }

  if (label === escapeTex(url)) {
    return `\\url{${url}}`
  }
  return `\\href{${url}}{${label}}`
}

const linkBareUrls = (markdown: string): string =>
  markdown.replaceAll(
    /(?<![(<`\w])https?:\/\/[^\s<>`]*[^\s<>`.,;:!?'")\]]/gu,
    (url) => `<${url}>`,
  )

const wrapEnvironment = (name: string, content: string): string =>
  `\\begin{${name}}\n${content}\\end{${name}}\n\n`

const rejectMarkdown = (feature: string): never => {
  throw new Error(`Unsupported Markdown: ${feature}`)
}

const renderHeading = (content: string, level: number): string => {
  const headingCommands: Readonly<Record<number, string>> = {
    2: 'section',
    3: 'subsection',
    4: 'subsubsection',
  }
  const command = headingCommands[level]

  if (!command) {
    throw new Error(
      'Use ## through #### headings; put the title in frontmatter.',
    )
  }

  return `\\${command}*{${content}}\n\n`
}

const renderMarkdown = (markdown: string): string => {
  return Bun.markdown.render(markdown, {
    blockquote: (content) => wrapEnvironment('quote', content),
    code: () => rejectMarkdown('code blocks'),
    codespan: (content) => `\\texttt{${escapeTex(content)}}`,
    emphasis: (content) => `\\textit{${content}}`,
    heading: (content, { level }) => renderHeading(content, level),
    hr: () => '\\par\\noindent\\rule{\\linewidth}{0.4pt}\\par\n\n',
    html: () => rejectMarkdown('raw HTML'),
    image: () => rejectMarkdown('images'),
    link: (label, { href }) => renderLink(label, href),
    list: (content, { ordered }) => {
      if (ordered) {
        return wrapEnvironment('enumerate', content)
      }
      return wrapEnvironment('itemize', content)
    },
    listItem: (content, { checked = 'not-task', ordered, start = 1 }) => {
      const isTask = checked !== 'not-task'
      const startsAfterOne = ordered && start !== 1

      if (isTask || startsAfterOne) {
        throw new Error(
          'Task lists and ordered lists starting after 1 are unsupported.',
        )
      }
      return `\\item ${content}\n`
    },
    paragraph: (content) => `${content}\\par\n\n`,
    strikethrough: () => rejectMarkdown('strikethrough'),
    strong: (content) => `\\textbf{${content}}`,
    table: () => rejectMarkdown('tables'),
    text: escapeTex,
  })
}

export type Section = Readonly<{
  title: string | null
  level: number
  wordCount: number
  counted: boolean
}>

const countMarker = (position: 'start' | 'end'): RegExp =>
  new RegExp(String.raw`^<!--\s*${position} word count\s*-->[ \t]*$`, 'imu')

const anyCountMarker = /^<!--\s*(?:start|end) word count\s*-->[ \t]*$/gimu

const stripMarkers = (markdown: string): string =>
  markdown.replaceAll(anyCountMarker, '')

const splitAtMarkers = (
  markdown: string,
): Readonly<{ before: string; counted: string; after: string }> => {
  const start = countMarker('start').exec(markdown)
  const startEnd = start ? start.index + start[0].length : 0
  const end = countMarker('end').exec(markdown.slice(startEnd))
  const endStart = end ? startEnd + end.index : markdown.length
  return {
    after: stripMarkers(end ? markdown.slice(endStart + end[0].length) : ''),
    before: stripMarkers(start ? markdown.slice(0, start.index) : ''),
    counted: stripMarkers(markdown.slice(startEnd, endStart)),
  }
}

const headingMarker = '\u0000'

const countWords = (text: string): number =>
  text.split(/\s+/u).filter((word) => /[\p{L}\p{N}]/u.test(word)).length

const countSections = (markdown: string): Omit<Section, 'counted'>[] => {
  const renderedText = Bun.markdown.render(markdown, {
    code: () => '',
    heading: (content, { level }) =>
      `${headingMarker}${level} ${content.trim()}\n`,
    image: () => '',
    listItem: (content) => `${content}\n`,
    paragraph: (content) => `${content}\n`,
  })
  return renderedText
    .split(headingMarker)
    .map((chunk, index): Omit<Section, 'counted'> => {
      if (index === 0) {
        return { level: 1, title: null, wordCount: countWords(chunk) }
      }
      const [heading = '', ...body] = chunk.split('\n')
      const [, level = '2', title = ''] = /^(\d) (.*)$/u.exec(heading) ?? []
      return {
        level: Number(level),
        title,
        wordCount: countWords(`${title}\n${body.join('\n')}`),
      }
    })
    .filter((section) => section.title !== null || section.wordCount > 0)
}

const includeSubsections = (
  sections: readonly Omit<Section, 'counted'>[],
  counted: boolean,
): Section[] =>
  sections.map((section, index) => {
    if (section.title === null) {
      return { ...section, counted }
    }
    const end = sections.findIndex(
      (next, nextIndex) => nextIndex > index && next.level <= section.level,
    )
    return {
      ...section,
      counted,
      wordCount: sections
        .slice(index, end === -1 ? sections.length : end)
        .reduce((total, next) => total + next.wordCount, 0),
    }
  })

const renderWordCountPage = (
  sections: readonly Section[],
  wordCount: number,
): string => {
  const row = (section: Section): string => {
    const indent = '\\quad '.repeat(Math.max(section.level - 2, 0))
    const untitled = section.counted
      ? 'Before the first heading'
      : 'Before the start marker'
    const title =
      section.title === null
        ? `\\textit{${untitled}}`
        : escapeTex(section.title)
    return `${indent}${title} & ${section.wordCount} \\\\\n`
  }
  const uncounted = sections.filter((section) => !section.counted)
  return [
    '\\clearpage\n\\section*{Word count}\n\n',
    '\\begin{tabular}{lr}\n',
    ...sections.filter((section) => section.counted).map(row),
    `\\hline\nTotal & ${wordCount} \\\\\n`,
    ...(uncounted.length > 0
      ? [
          '\\multicolumn{2}{l}{} \\\\\n\\multicolumn{2}{l}{\\textit{Not counted}} \\\\\n',
          ...uncounted.map(row),
        ]
      : []),
    '\\end{tabular}\n',
  ].join('')
}

export type Document = Readonly<{
  latex: string
  wordCount: number
  sections: readonly Section[]
}>

export const prepareDocument = (
  source: string,
  template: string,
  wordCountPage = false,
): Document => {
  const { metadata, markdown } = parseDocument(source)
  const { before, counted, after } = splitAtMarkers(markdown)
  const ownCounts = countSections(counted)
  const wordCount = ownCounts.reduce(
    (total, section) => total + section.wordCount,
    0,
  )
  const sections = [
    ...includeSubsections(countSections(before), false),
    ...includeSubsections(ownCounts, true),
    ...includeSubsections(
      countSections(after).filter((section) => section.title !== null),
      false,
    ),
  ]
  const body = renderMarkdown(linkBareUrls([before, counted, after].join('\n')))
  return {
    latex: fillTemplate(
      template,
      metadata,
      wordCountPage
        ? `${body}${renderWordCountPage(sections, wordCount)}`
        : body,
    ),
    sections,
    wordCount,
  }
}

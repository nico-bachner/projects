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

const countWords = (markdown: string): number => {
  const renderedText = Bun.markdown.render(markdown, {
    code: () => '',
    heading: (content) => `${content}\n`,
    image: () => '',
    listItem: (content) => `${content}\n`,
    paragraph: (content) => `${content}\n`,
  })
  return renderedText.split(/\s+/u).filter((word) => /[\p{L}\p{N}]/u.test(word))
    .length
}

export type Document = Readonly<{
  latex: string
  wordCount: number
}>

export const prepareDocument = (source: string, template: string): Document => {
  const { metadata, markdown } = parseDocument(source)
  return {
    latex: fillTemplate(template, metadata, renderMarkdown(markdown)),
    wordCount: countWords(markdown),
  }
}

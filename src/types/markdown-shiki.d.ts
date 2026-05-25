declare module 'markdown-it' {
  class MarkdownIt {
    inline: any
    block: any
    renderer: any
    core: any
    constructor(options?: any)
    render(src: string): string
    enable(rules: string[] | string): void
  }

  namespace MarkdownIt {
    type StateInline = any
    type StateBlock = any
    type Token = any
    type Core = any
  }

  export default MarkdownIt
}

declare module '@/utils/shiki.js' {
  export function escapeHtml(input: string): string
  export function getShikiHighlighter(): Promise<any>
  export function renderShikiCode(
    highlighter: any,
    code: string,
    language: string,
    theme?: string
  ): string
}

<script setup lang="ts">
import DOMPurify from 'dompurify'
import katex from 'katex'
import MarkdownIt from 'markdown-it'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

import { cn } from '@/lib/utils'
import { copyToClipboard } from '@/utils/clipboard'
import { escapeHtml, getShikiHighlighter, renderShikiCode } from '@/utils/shiki.js'
import 'katex/dist/katex.min.css'

const props = withDefaults(
  defineProps<{
    content: string
    user?: boolean
    compact?: boolean
    muted?: boolean
  }>(),
  {
    user: false,
    compact: false,
    muted: false,
  }
)

const emit = defineEmits<{
  copyCode: [code: string]
  openWorkspaceFile: [payload: { path: string; lineStart?: number; lineEnd?: number }]
}>()

interface CodeBlock {
  id: string
  code: string
  language: string
}

interface MathBlock {
  id: string
  content: string
  display: boolean
}

const renderVersion = ref(0)
const renderedHtml = ref('')
const codeBlocks = ref<CodeBlock[]>([])
const mathBlocks = ref<MathBlock[]>([])
const rootEl = ref<HTMLElement | null>(null)

const markdown = createMarkdownRenderer()

const rootClasses = computed(() =>
  cn(
    'chat-markdown min-w-0 max-w-none break-words',
    props.compact ? 'chat-markdown--compact text-xs leading-5' : 'text-sm leading-6',
    props.user && 'chat-markdown--user text-foreground',
    props.muted && 'chat-markdown--muted text-muted-foreground'
  )
)

watch(
  () => props.content,
  async () => {
    const version = renderVersion.value + 1
    renderVersion.value = version
    codeBlocks.value = []
    mathBlocks.value = []

    const html = markdown.render(normalizeMarkdownSource(props.content || ''))
    renderedHtml.value = finalizeRenderedHtml(html)

    await nextTick()
    void highlightCodeBlocks(version)
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  codeBlocks.value = []
  mathBlocks.value = []
})

function createMarkdownRenderer() {
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
    breaks: true,
  })

  md.enable(['table', 'strikethrough'])
  installMathRules(md)
  installTaskListRule(md)
  installWorkspaceFileRefRule(md)

  md.renderer.rules.table_open = () => '<div class="chat-markdown__table"><table>'
  md.renderer.rules.table_close = () => '</table></div>'
  md.renderer.rules.fence = (tokens: MarkdownIt.Token[], index: number) =>
    renderCodeBlock(tokens[index]?.content || '', tokens[index]?.info || '')
  md.renderer.rules.code_block = (tokens: MarkdownIt.Token[], index: number) =>
    renderCodeBlock(tokens[index]?.content || '', '')

  return md
}

function renderCodeBlock(code: string, info: string) {
  const id = `code-${renderVersion.value}-${codeBlocks.value.length}`
  const language = normalizeCodeLanguage(info)
  codeBlocks.value.push({ id, code, language })

  return `<div class="chat-code-block" data-code-id="${id}">
    <div class="chat-code-block__header">
      <span class="chat-code-block__language">${escapeHtml(language || 'text')}</span>
      <button class="chat-code-block__copy" type="button" data-code-copy="${id}" aria-label="复制代码">复制</button>
    </div>
    <pre class="chat-code-block__pre"><code>${escapeHtml(code)}</code></pre>
  </div>`
}

function installMathRules(md: MarkdownIt) {
  md.inline.ruler.before('escape', 'chat_math_inline_dollar', mathInlineDollarRule)
  md.inline.ruler.before('escape', 'chat_math_inline_paren', mathInlineParenRule)
  md.block.ruler.before('paragraph', 'chat_math_block', mathBlockRule, {
    alt: ['paragraph', 'reference', 'blockquote', 'list'],
  })

  md.renderer.rules.math_inline = (tokens: MarkdownIt.Token[], index: number) =>
    renderMathPlaceholder(tokens[index]?.content || '', false)
  md.renderer.rules.math_block = (tokens: MarkdownIt.Token[], index: number) =>
    `${renderMathPlaceholder(tokens[index]?.content || '', true)}\n`
}

function mathInlineDollarRule(state: MarkdownIt.StateInline, silent: boolean) {
  const start = state.pos
  const source = state.src
  if (source[start] !== '$' || source[start + 1] === '$' || isEscaped(source, start)) return false
  if (!source[start + 1] || /\s/.test(source[start + 1])) return false

  const close = findClosingDollar(source, start + 1, state.posMax)
  if (close < 0) return false

  const content = source.slice(start + 1, close)
  if (!content.trim()) return false
  if (silent) return true

  const token = state.push('math_inline', 'math', 0)
  token.content = content
  token.markup = '$'
  state.pos = close + 1
  return true
}

function mathInlineParenRule(state: MarkdownIt.StateInline, silent: boolean) {
  const start = state.pos
  const source = state.src
  if (source.slice(start, start + 2) !== '\\(' || isEscaped(source, start)) return false

  const close = findUnescapedSequence(source, '\\)', start + 2, state.posMax)
  if (close < 0) return false

  const content = source.slice(start + 2, close)
  if (!content.trim()) return false
  if (silent) return true

  const token = state.push('math_inline', 'math', 0)
  token.content = content
  token.markup = '\\('
  state.pos = close + 2
  return true
}

function mathBlockRule(
  state: MarkdownIt.StateBlock,
  startLine: number,
  endLine: number,
  silent: boolean
) {
  const start = state.bMarks[startLine] + state.tShift[startLine]
  const max = state.eMarks[startLine]
  const line = state.src.slice(start, max)
  const openMatch = line.match(/^(\$\$|\\\[)\s*(.*)$/)
  if (!openMatch) return false

  const openMarker = openMatch[1]
  const closeMarker = openMarker === '$$' ? '$$' : '\\]'
  const firstLine = openMatch[2] || ''
  const contentLines: string[] = []
  let nextLine = startLine
  let closeIndex = findUnescapedSequence(firstLine, closeMarker, 0)

  if (closeIndex >= 0) {
    contentLines.push(firstLine.slice(0, closeIndex))
  } else {
    contentLines.push(firstLine)

    for (nextLine = startLine + 1; nextLine < endLine; nextLine += 1) {
      const lineStart = state.bMarks[nextLine] + state.tShift[nextLine]
      const lineEnd = state.eMarks[nextLine]
      const nextLineText = state.src.slice(lineStart, lineEnd)
      const close = findUnescapedSequence(nextLineText, closeMarker, 0)

      if (close >= 0) {
        contentLines.push(nextLineText.slice(0, close))
        closeIndex = close
        break
      }

      contentLines.push(nextLineText)
    }

    if (closeIndex < 0) return false
  }

  if (silent) return true

  const token = state.push('math_block', 'math', 0)
  token.block = true
  token.content = contentLines.join('\n').trim()
  token.markup = openMarker
  state.line = nextLine + 1
  return true
}

function renderMathPlaceholder(content: string, display: boolean) {
  const id = `math-${renderVersion.value}-${mathBlocks.value.length}`
  mathBlocks.value.push({ id, content, display })
  const tag = display ? 'div' : 'span'
  const className = display
    ? 'chat-math-placeholder chat-math-placeholder--display'
    : 'chat-math-placeholder chat-math-placeholder--inline'
  return `<${tag} class="${className}" data-math-id="${id}"></${tag}>`
}

async function highlightCodeBlocks(version: number) {
  if (!rootEl.value || !codeBlocks.value.length) return

  let highlighter: Awaited<ReturnType<typeof getShikiHighlighter>>
  try {
    highlighter = await getShikiHighlighter()
  } catch {
    return
  }

  if (version !== renderVersion.value || !rootEl.value) return

  for (const block of codeBlocks.value) {
    const shell = rootEl.value.querySelector<HTMLElement>(`[data-code-id="${block.id}"]`)
    const fallback = shell?.querySelector<HTMLElement>('.chat-code-block__pre')
    if (!shell || !fallback) continue
    fallback.outerHTML = renderShikiCode(highlighter, block.code, block.language || 'text', 'auto')
  }
}

async function handleRenderedClick(event: MouseEvent) {
  const target = event.target
  if (!(target instanceof Element)) return

  const fileRef = target.closest<HTMLElement>('.chat-ws-file-ref')
  if (fileRef) {
    event.preventDefault()
    const path = fileRef.dataset.wsPath || ''
    if (!path) return
    const lineStartRaw = fileRef.dataset.wsLineStart
    const lineEndRaw = fileRef.dataset.wsLineEnd
    const lineStart = lineStartRaw ? Number(lineStartRaw) : undefined
    const lineEnd = lineEndRaw ? Number(lineEndRaw) : undefined
    emit('openWorkspaceFile', {
      path,
      lineStart: Number.isFinite(lineStart) ? lineStart : undefined,
      lineEnd: Number.isFinite(lineEnd) ? lineEnd : undefined,
    })
    return
  }

  const copyButton = target.closest<HTMLButtonElement>('[data-code-copy]')
  if (!copyButton) return

  const block = codeBlocks.value.find((item) => item.id === copyButton.dataset.codeCopy)
  if (!block) return

  const ok = await copyToClipboard(block.code, { container: rootEl.value })
  emit('copyCode', block.code)
  setCopyButtonState(copyButton, ok)
}

function setCopyButtonState(button: HTMLButtonElement, copied: boolean) {
  button.dataset.copied = copied ? 'true' : 'false'
  button.textContent = copied ? '已复制' : '复制失败'
  window.setTimeout(() => {
    if (!document.body.contains(button)) return
    button.dataset.copied = ''
    button.textContent = '复制'
  }, 1200)
}

function finalizeRenderedHtml(html: string) {
  const cleanHtml = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed'],
    FORBID_ATTR: ['style', 'onerror', 'onload', 'onclick'],
    ADD_ATTR: [
      'aria-label',
      'checked',
      'class',
      'data-code-copy',
      'data-code-id',
      'data-math-id',
      'data-ws-path',
      'data-ws-line-start',
      'data-ws-line-end',
      'disabled',
      'open',
      'rel',
      'role',
      'tabindex',
      'target',
      'type',
    ],
  })

  const container = document.createElement('div')
  container.innerHTML = cleanHtml
  addHeadingIds(container)
  hardenLinks(container)
  injectMathHtml(container)
  return container.innerHTML
}

function injectMathHtml(container: HTMLElement) {
  if (!mathBlocks.value.length) return
  container.querySelectorAll<HTMLElement>('[data-math-id]').forEach((placeholder) => {
    const block = mathBlocks.value.find((item) => item.id === placeholder.dataset.mathId)
    if (!block) return
    placeholder.outerHTML = renderKatexHtml(block)
  })
}

function renderKatexHtml(block: MathBlock) {
  try {
    const html = katex.renderToString(block.content, {
      displayMode: block.display,
      throwOnError: false,
      strict: 'ignore',
      trust: false,
      maxSize: 12,
      maxExpand: 1000,
      output: 'htmlAndMathml',
    })
    const cleanHtml = DOMPurify.sanitize(html, {
      USE_PROFILES: { html: true, mathMl: true },
      FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed'],
      ADD_ATTR: [
        'accent',
        'aria-hidden',
        'class',
        'display',
        'encoding',
        'href',
        'mathvariant',
        'rowspan',
        'style',
        'xmlns',
      ],
    })
    const tag = block.display ? 'div' : 'span'
    const className = block.display ? 'chat-math chat-math--display' : 'chat-math chat-math--inline'
    return `<${tag} class="${className}">${cleanHtml}</${tag}>`
  } catch {
    const fallback = `<code class="chat-math__fallback">${escapeHtml(block.content)}</code>`
    return block.display
      ? `<div class="chat-math chat-math--display">${fallback}</div>`
      : `<span class="chat-math chat-math--inline">${fallback}</span>`
  }
}

function addHeadingIds(container: HTMLElement) {
  const slugCounts = new Map<string, number>()
  container.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((heading) => {
    if (heading.id) return
    const slug = slugifyHeading(heading.textContent || '', slugCounts)
    if (slug) heading.id = slug
  })
}

function hardenLinks(container: HTMLElement) {
  container.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((link) => {
    const href = link.getAttribute('href') || ''
    if (!/^(https?:)?\/\//i.test(href)) return
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
  })
}

function slugifyHeading(text: string, slugCounts: Map<string, number>) {
  const base = text
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')

  if (!base) return ''

  const count = slugCounts.get(base) || 0
  slugCounts.set(base, count + 1)
  return count === 0 ? base : `${base}-${count}`
}

function normalizeCodeLanguage(info: string) {
  return String(info || '')
    .trim()
    .split(/\s+/, 1)[0]
    .toLowerCase()
}

function normalizeMarkdownSource(source: string) {
  const lines = source.split(/\r?\n/)
  let fenceMarker = ''
  let fenceLength = 0
  let mathCloseMarker = ''

  return lines
    .map((line) => {
      const fence = line.match(/^(\s{0,3})(`{3,}|~{3,})/)
      if (fence) {
        const marker = fence[2][0]
        const length = fence[2].length
        if (!fenceMarker) {
          fenceMarker = marker
          fenceLength = length
        } else if (marker === fenceMarker && length >= fenceLength) {
          fenceMarker = ''
          fenceLength = 0
        }
        return line
      }

      if (fenceMarker) return line

      if (mathCloseMarker) {
        if (findUnescapedSequence(line, mathCloseMarker, 0) >= 0) {
          mathCloseMarker = ''
        }
        return line
      }

      const trimmed = line.trimStart()
      if (trimmed.startsWith('$$')) {
        if (findUnescapedSequence(trimmed.slice(2), '$$', 0) < 0) {
          mathCloseMarker = '$$'
        }
        return line
      }
      if (trimmed.startsWith('\\[')) {
        if (findUnescapedSequence(trimmed.slice(2), '\\]', 0) < 0) {
          mathCloseMarker = '\\]'
        }
        return line
      }

      return line.replace(/^(\s{0,3})(#{1,6})([^\s#].*)$/, '$1$2 $3')
    })
    .join('\n')
}

function findClosingDollar(source: string, start: number, end = source.length) {
  for (let index = start; index < end; index += 1) {
    if (source[index] !== '$' || isEscaped(source, index)) continue
    if (source[index - 1] && /\s/.test(source[index - 1])) continue
    if (source[index + 1] && /\d/.test(source[index + 1])) continue
    return index
  }
  return -1
}

function findUnescapedSequence(
  source: string,
  sequence: string,
  start: number,
  end = source.length
) {
  let index = source.indexOf(sequence, start)
  while (index >= 0 && index < end) {
    if (!isEscaped(source, index)) return index
    index = source.indexOf(sequence, index + sequence.length)
  }
  return -1
}

function isEscaped(source: string, index: number) {
  let slashCount = 0
  for (let cursor = index - 1; cursor >= 0 && source[cursor] === '\\'; cursor -= 1) {
    slashCount += 1
  }
  return slashCount % 2 === 1
}

function installTaskListRule(md: MarkdownIt) {
  md.core.ruler.after('inline', 'chat_task_lists', (state: MarkdownIt.Core) => {
    const tokens = state.tokens

    for (let index = 0; index < tokens.length; index += 1) {
      const inlineToken = tokens[index]
      if (inlineToken.type !== 'inline' || !inlineToken.children?.length) continue
      if (tokens[index - 1]?.type !== 'paragraph_open') continue

      const listItem = findListItemOpen(tokens, index)
      if (!listItem) continue

      const firstChild = inlineToken.children[0]
      if (firstChild.type !== 'text') continue

      const match = firstChild.content.match(/^\[([ xX])\]\s+/)
      if (!match) continue

      listItem.attrJoin('class', 'task-list-item')
      firstChild.content = firstChild.content.slice(match[0].length)

      const checkbox = new state.Token('html_inline', '', 0)
      checkbox.content = `<input class="task-list-item-checkbox" type="checkbox" disabled${
        match[1].toLowerCase() === 'x' ? ' checked' : ''
      }> `
      inlineToken.children.unshift(checkbox)
    }
  })
}

function findListItemOpen(tokens: Array<{ type: string }>, startIndex: number) {
  for (let index = startIndex - 1; index >= 0; index -= 1) {
    const token = tokens[index]
    if (token.type === 'list_item_open') return token as MarkdownIt.Token
    if (token.type === 'bullet_list_open' || token.type === 'ordered_list_open') return null
  }
  return null
}

function installWorkspaceFileRefRule(md: MarkdownIt) {
  md.inline.ruler.before('escape', 'chat_workspace_file_ref', workspaceFileRefRule)
  md.renderer.rules.chat_workspace_file_ref = (tokens: MarkdownIt.Token[], index: number) => {
    const meta = tokens[index]?.meta as
      | { path: string; lineStart?: number; lineEnd?: number }
      | undefined
    if (!meta?.path) return ''
    return renderWorkspaceFileRef(meta.path, meta.lineStart, meta.lineEnd)
  }
}

function workspaceFileRefRule(state: MarkdownIt.StateInline, silent: boolean) {
  const start = state.pos
  const src = state.src
  if (src.charCodeAt(start) !== 0x5b /* [ */ || src.charCodeAt(start + 1) !== 0x5b /* [ */) {
    return false
  }
  if (src.slice(start + 2, start + 5).toLowerCase() !== 'ws:') return false

  const closeIdx = src.indexOf(']]', start + 5)
  if (closeIdx < 0) return false

  const body = src.slice(start + 5, closeIdx).trim()
  if (!body) return false

  let path = body
  let lineStart: number | undefined
  let lineEnd: number | undefined
  const hashIdx = body.indexOf('#')
  if (hashIdx >= 0) {
    path = body.slice(0, hashIdx).trim()
    const anchor = body.slice(hashIdx + 1).trim()
    const match = anchor.match(/^L(\d+)(?:-L?(\d+))?$/i)
    if (match) {
      lineStart = Number(match[1])
      if (match[2]) lineEnd = Number(match[2])
    }
  }
  if (!path) return false

  if (!silent) {
    const token = state.push('chat_workspace_file_ref', '', 0)
    token.meta = { path, lineStart, lineEnd }
  }

  state.pos = closeIdx + 2
  return true
}

function renderWorkspaceFileRef(path: string, lineStart?: number, lineEnd?: number) {
  const safePath = escapeHtml(path)
  const lineLabel =
    lineStart != null && Number.isFinite(lineStart)
      ? lineEnd != null && Number.isFinite(lineEnd) && lineEnd !== lineStart
        ? `:L${lineStart}-L${lineEnd}`
        : `:L${lineStart}`
      : ''
  const dataLineStart = lineStart != null ? ` data-ws-line-start="${lineStart}"` : ''
  const dataLineEnd = lineEnd != null ? ` data-ws-line-end="${lineEnd}"` : ''
  return (
    `<span class="chat-ws-file-ref" role="button" tabindex="0"` +
    ` data-ws-path="${safePath}"${dataLineStart}${dataLineEnd}` +
    ` aria-label="打开工作区文件 ${safePath}">` +
    `<span class="chat-ws-file-ref__icon" aria-hidden="true"></span>` +
    `<code class="chat-ws-file-ref__path">${safePath}</code>` +
    (lineLabel ? `<span class="chat-ws-file-ref__line">${escapeHtml(lineLabel)}</span>` : '') +
    `</span>`
  )
}
</script>

<template>
  <div
    ref="rootEl"
    :class="rootClasses"
  >
    <div
      class="chat-markdown__content"
      v-html="renderedHtml"
      @click="handleRenderedClick"
    />
  </div>
</template>

<style scoped>
.chat-markdown {
  overflow-wrap: anywhere;
}

.chat-markdown :deep(.chat-markdown__content > :first-child) {
  margin-top: 0;
}

.chat-markdown :deep(.chat-markdown__content > :last-child) {
  margin-bottom: 0;
}

.chat-markdown :deep(.chat-ws-file-ref) {
  display: inline-flex;
  align-items: center;
  gap: 0.3em;
  padding: 0.05em 0.5em;
  margin: 0 0.1em;
  border-radius: 0.4rem;
  border: 1px solid var(--border);
  background: var(--muted);
  color: var(--foreground);
  cursor: pointer;
  font-size: 0.92em;
  line-height: 1.4;
  vertical-align: baseline;
  transition: background-color 0.15s ease, border-color 0.15s ease;
  user-select: none;
}

.chat-markdown :deep(.chat-ws-file-ref:hover),
.chat-markdown :deep(.chat-ws-file-ref:focus-visible) {
  background: var(--accent);
  border-color: var(--ring);
  outline: none;
}

.chat-markdown :deep(.chat-ws-file-ref__icon) {
  display: inline-block;
  width: 0.95em;
  height: 0.95em;
  background-color: currentColor;
  -webkit-mask-image: url("data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'/%3E%3Cpath d='M14 2v6h6'/%3E%3C/svg%3E");
  mask-image: url("data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'/%3E%3Cpath d='M14 2v6h6'/%3E%3C/svg%3E");
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  -webkit-mask-position: center;
  mask-position: center;
  -webkit-mask-size: contain;
  mask-size: contain;
  opacity: 0.75;
}

.chat-markdown :deep(.chat-ws-file-ref__path) {
  background: transparent;
  padding: 0;
  font-family: inherit;
  font-size: inherit;
  color: inherit;
}

.chat-markdown :deep(.chat-ws-file-ref__line) {
  font-variant-numeric: tabular-nums;
  font-size: 0.85em;
  color: var(--muted-foreground);
}

.chat-markdown :deep(h1),
.chat-markdown :deep(h2),
.chat-markdown :deep(h3),
.chat-markdown :deep(h4),
.chat-markdown :deep(h5),
.chat-markdown :deep(h6) {
  margin: 1.1em 0 0.55em;
  color: var(--foreground);
  font-weight: 650;
  line-height: 1.28;
  scroll-margin-top: 1rem;
}

.chat-markdown :deep(h1) {
  font-size: 1.45em;
}

.chat-markdown :deep(h2) {
  font-size: 1.25em;
}

.chat-markdown :deep(h3) {
  font-size: 1.12em;
}

.chat-markdown :deep(h4),
.chat-markdown :deep(h5),
.chat-markdown :deep(h6) {
  font-size: 1em;
}

.chat-markdown--muted :deep(h1),
.chat-markdown--muted :deep(h2),
.chat-markdown--muted :deep(h3),
.chat-markdown--muted :deep(h4),
.chat-markdown--muted :deep(h5),
.chat-markdown--muted :deep(h6) {
  color: inherit;
}

.chat-markdown--compact :deep(h1) {
  font-size: 1.2em;
}

.chat-markdown--compact :deep(h2) {
  font-size: 1.12em;
}

.chat-markdown :deep(p) {
  margin: 0.55em 0;
}

.chat-markdown--user :deep(p) {
  margin: 0;
}

.chat-markdown--user :deep(p + p) {
  margin-top: 0.5em;
}

.chat-markdown :deep(a) {
  color: var(--primary);
  text-decoration: underline;
  text-underline-offset: 0.18em;
}

.chat-markdown :deep(strong) {
  font-weight: 650;
}

.chat-markdown :deep(blockquote) {
  margin: 0.8em 0;
  border-left: 3px solid var(--border);
  padding: 0.1em 0 0.1em 0.9em;
  color: var(--muted-foreground);
}

.chat-markdown :deep(ul),
.chat-markdown :deep(ol) {
  margin: 0.65em 0;
  padding-left: 1.55em;
}

.chat-markdown :deep(ul) {
  list-style: disc;
}

.chat-markdown :deep(ol) {
  list-style: decimal;
}

.chat-markdown :deep(li) {
  margin: 0.25em 0;
}

.chat-markdown :deep(li > ul),
.chat-markdown :deep(li > ol) {
  margin: 0.25em 0;
}

.chat-markdown :deep(.task-list-item) {
  list-style: none;
}

.chat-markdown :deep(.task-list-item-checkbox) {
  margin: 0 0.5em 0 -1.35em;
  vertical-align: -0.15em;
}

.chat-markdown :deep(hr) {
  height: 1px;
  margin: 1em 0;
  border: 0;
  background: var(--border);
}

.chat-markdown :deep(.chat-math) {
  color: inherit;
}

.chat-markdown :deep(.chat-math--inline) {
  display: inline;
}

.chat-markdown :deep(.chat-math--display) {
  display: block;
  max-width: 100%;
  margin: 0.85em 0;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 0.25rem 0;
}

.chat-markdown :deep(.katex) {
  color: inherit;
  font-size: 1.02em;
}

.chat-markdown :deep(.katex-display) {
  margin: 0;
  overflow-x: auto;
  overflow-y: hidden;
}

.chat-markdown :deep(.chat-math__fallback) {
  color: var(--destructive);
}

.chat-markdown :deep(code) {
  border: 1px solid var(--border);
  border-radius: 0.35rem;
  background: var(--muted);
  padding: 0.12em 0.35em;
  font-family:
    ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New",
    monospace;
  font-size: 0.9em;
}

.chat-markdown :deep(pre code) {
  border: 0;
  border-radius: 0;
  background: transparent;
  padding: 0;
  color: inherit;
  font-size: inherit;
}

.chat-markdown :deep(.chat-code-block) {
  max-width: 100%;
  margin: 0.85em 0;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  background: var(--muted);
}

.chat-markdown :deep(.chat-code-block__header) {
  display: flex;
  min-height: 2.25rem;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  border-bottom: 1px solid var(--border);
  background: color-mix(in oklab, var(--muted) 80%, var(--background));
  padding: 0.35rem 0.55rem 0.35rem 0.75rem;
}

.chat-markdown :deep(.chat-code-block__language) {
  min-width: 0;
  overflow: hidden;
  color: var(--muted-foreground);
  font-size: 0.72rem;
  font-weight: 600;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}

.chat-markdown :deep(.chat-code-block__copy) {
  flex: none;
  border: 0;
  border-radius: 0.35rem;
  background: transparent;
  color: var(--muted-foreground);
  padding: 0.2rem 0.45rem;
  font-size: 0.75rem;
  line-height: 1.2;
}

.chat-markdown :deep(.chat-code-block__copy:hover) {
  background: var(--accent);
  color: var(--accent-foreground);
}

.chat-markdown :deep(.chat-code-block__copy[data-copied="true"]) {
  color: var(--foreground);
}

.chat-markdown :deep(.chat-code-block pre),
.chat-markdown :deep(pre.shiki) {
  max-width: 100%;
  margin: 0;
  overflow: auto;
  border-radius: 0;
  padding: 0.95rem 1rem;
  font-size: 0.82rem;
  line-height: 1.55;
  tab-size: 2;
}

.chat-markdown :deep(pre.shiki code) {
  display: block;
  min-width: max-content;
}

.chat-markdown :deep(pre.shiki .line) {
  display: block;
  min-height: 1.55em;
}

.chat-markdown :deep(.chat-markdown__table) {
  max-width: 100%;
  margin: 0.85em 0;
  overflow-x: auto;
  border: 1px solid var(--border);
  border-radius: 0.5rem;
}

.chat-markdown :deep(table) {
  width: 100%;
  min-width: max-content;
  border-collapse: collapse;
  border-spacing: 0;
}

.chat-markdown :deep(th),
.chat-markdown :deep(td) {
  border-bottom: 1px solid var(--border);
  border-left: 1px solid var(--border);
  padding: 0.45rem 0.65rem;
  text-align: left;
  vertical-align: top;
}

.chat-markdown :deep(th:first-child),
.chat-markdown :deep(td:first-child) {
  border-left: 0;
}

.chat-markdown :deep(tr:last-child td) {
  border-bottom: 0;
}

.chat-markdown :deep(th) {
  background: var(--muted);
  color: var(--foreground);
  font-weight: 650;
}

.chat-markdown :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: 0.45rem;
}

.chat-markdown :deep(details) {
  margin: 0.85em 0;
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  background: color-mix(in oklab, var(--muted) 55%, transparent);
  padding: 0.7rem 0.85rem;
}

.chat-markdown :deep(summary) {
  cursor: pointer;
  font-weight: 650;
}
</style>

<style>
.dark .chat-markdown pre.shiki {
  background-color: var(--shiki-dark-bg, var(--muted)) !important;
  color: var(--shiki-dark, var(--foreground)) !important;
}

.dark .chat-markdown pre.shiki span {
  color: var(--shiki-dark, inherit) !important;
}
</style>

<script setup lang="ts">
import DOMPurify from 'dompurify'
import MarkdownIt from 'markdown-it'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

import { cn } from '@/lib/utils'
import { copyToClipboard } from '@/utils/clipboard'
import { escapeHtml, getShikiHighlighter, renderShikiCode } from '@/utils/shiki.js'

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
}>()

interface CodeBlock {
  id: string
  code: string
  language: string
}

const renderVersion = ref(0)
const renderedHtml = ref('')
const codeBlocks = ref<CodeBlock[]>([])
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

    const html = markdown.render(normalizeMarkdownSource(props.content || ''))
    renderedHtml.value = finalizeRenderedHtml(html)

    await nextTick()
    void highlightCodeBlocks(version)
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  codeBlocks.value = []
})

function createMarkdownRenderer() {
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
    breaks: true,
  })

  md.enable(['table', 'strikethrough'])
  installTaskListRule(md)

  md.renderer.rules.table_open = () => '<div class="chat-markdown__table"><table>'
  md.renderer.rules.table_close = () => '</table></div>'
  md.renderer.rules.fence = (tokens, index) =>
    renderCodeBlock(tokens[index]?.content || '', tokens[index]?.info || '')
  md.renderer.rules.code_block = (tokens, index) =>
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
      'disabled',
      'open',
      'rel',
      'target',
      'type',
    ],
  })

  const container = document.createElement('div')
  container.innerHTML = cleanHtml
  addHeadingIds(container)
  hardenLinks(container)
  return container.innerHTML
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
      return line.replace(/^(\s{0,3})(#{1,6})([^\s#].*)$/, '$1$2 $3')
    })
    .join('\n')
}

function installTaskListRule(md: MarkdownIt) {
  md.core.ruler.after('inline', 'chat_task_lists', (state) => {
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
  padding-bottom: 0.35em;
  border-bottom: 1px solid var(--border);
  font-size: 1.45em;
}

.chat-markdown :deep(h2) {
  padding-bottom: 0.3em;
  border-bottom: 1px solid var(--border);
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

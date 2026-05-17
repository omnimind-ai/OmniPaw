<script setup lang="ts">
import DOMPurify from 'dompurify'
import MarkdownIt from 'markdown-it'
import { CheckIcon, CopyIcon } from 'lucide-vue-next'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { copyToClipboard } from '@/utils/clipboard'
import { getShikiHighlighter, renderShikiCode } from '@/utils/shiki.js'

const props = withDefaults(defineProps<{
  content: string
  user?: boolean
}>(), {
  user: false,
})

const emit = defineEmits<{
  copyCode: [code: string]
}>()

interface CodeBlock {
  id: string
  code: string
  language: string
  copied: boolean
}

const renderVersion = ref(0)
const renderedHtml = ref('')
const codeBlocks = ref<CodeBlock[]>([])
const rootEl = ref<HTMLElement | null>(null)

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  highlight(code, info) {
    const id = `code-${renderVersion.value}-${codeBlocks.value.length}`
    codeBlocks.value.push({
      id,
      code,
      language: String(info || '').trim(),
      copied: false,
    })
    return `<pre class="chat-code-shell" data-code-id="${id}"><code>${escapeHtml(code)}</code></pre>`
  },
})

const rootClasses = computed(() => cn(
  'chat-markdown max-w-none overflow-hidden text-sm',
  props.user ? 'leading-[1.25] text-foreground' : 'leading-6',
))

const contentClasses = computed(() => cn(
  '[&_a]:break-words [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_li]:my-1 [&_ol]:ml-5 [&_ol]:list-decimal [&_pre]:my-3 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:bg-muted [&_pre]:p-3 [&_table]:my-3 [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:px-2 [&_th]:py-1 [&_ul]:ml-5 [&_ul]:list-disc',
  props.user
    ? '[&_p]:my-0 [&_p+p]:mt-2'
    : '[&_p]:my-2',
))

watch(
  () => props.content,
  async () => {
    renderVersion.value += 1
    codeBlocks.value = []
    const html = markdown.render(props.content || '')
    renderedHtml.value = DOMPurify.sanitize(html, {
      USE_PROFILES: { html: true },
      FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed'],
      FORBID_ATTR: ['style', 'onerror', 'onload', 'onclick'],
      ADD_ATTR: ['data-code-id'],
    })
    await nextTick()
    void highlightCodeBlocks()
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  codeBlocks.value = []
})

async function highlightCodeBlocks() {
  if (!rootEl.value || !codeBlocks.value.length) return
  const highlighter = await getShikiHighlighter()
  for (const block of codeBlocks.value) {
    const target = rootEl.value.querySelector<HTMLElement>(`[data-code-id="${block.id}"]`)
    if (!target) continue
    target.outerHTML = renderShikiCode(highlighter, block.code, block.language || 'text', 'auto')
  }
}

async function copyBlock(block: CodeBlock) {
  const ok = await copyToClipboard(block.code, { container: rootEl.value })
  emit('copyCode', block.code)
  if (!ok) return
  block.copied = true
  window.setTimeout(() => {
    block.copied = false
  }, 1200)
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}
</script>

<template>
  <div
    ref="rootEl"
    :class="rootClasses"
  >
    <div
      :class="contentClasses"
      v-html="renderedHtml"
    />

    <div
      v-if="codeBlocks.length"
      class="pointer-events-none absolute size-0 overflow-hidden"
      aria-hidden="true"
    />

    <div class="mt-2 flex flex-wrap gap-2">
      <Button
        v-for="block in codeBlocks"
        :key="block.id"
        type="button"
        variant="outline"
        size="sm"
        @click="copyBlock(block)"
      >
        <CheckIcon
          v-if="block.copied"
          data-icon="inline-start"
        />
        <CopyIcon
          v-else
          data-icon="inline-start"
        />
        {{ block.language || '代码' }}
      </Button>
    </div>
  </div>
</template>

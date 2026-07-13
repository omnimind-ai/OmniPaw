<script setup lang="ts">
import { BrainIcon, ChevronDownIcon } from '@lucide/vue'
import { computed, ref, watch } from 'vue'

import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import type { MessagePart } from '@/composables/useMessages'
import { cn } from '@/lib/utils'
import MarkdownMessagePart from './MarkdownMessagePart.vue'

const props = withDefaults(
  defineProps<{
    parts: MessagePart[]
    streaming?: boolean
    initialOpen?: boolean
  }>(),
  {
    streaming: false,
    initialOpen: false,
  }
)

const emit = defineEmits<{
  copyCode: [code: string]
}>()

const open = ref(props.initialOpen)
const text = computed(() =>
  props.parts
    .map((part) => String(part.think || part.text || ''))
    .filter(Boolean)
    .join('')
)

watch(
  () => props.streaming,
  (streaming) => {
    if (streaming) open.value = true
  },
  { immediate: true }
)
</script>

<template>
  <Collapsible
    v-if="text"
    v-model:open="open"
    class="w-full border-l pl-2.5"
  >
    <div class="flex min-w-0 flex-col gap-1.5">
      <CollapsibleTrigger as-child>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          class="h-6 w-full justify-between px-0 text-xs font-normal text-muted-foreground hover:bg-transparent hover:text-foreground"
        >
          <span class="flex min-w-0 items-center gap-2">
            <BrainIcon data-icon="inline-start" />
            <span class="truncate">{{ streaming ? '正在推理' : '推理过程' }}</span>
          </span>
          <span class="flex shrink-0 items-center">
            <ChevronDownIcon
              data-icon="inline-end"
              :class="cn('transition-transform', open && 'rotate-180')"
            />
          </span>
        </Button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div class="pt-1">
          <MarkdownMessagePart
            :content="text"
            class="text-[0.72rem] leading-4"
            compact
            muted
            @copy-code="emit('copyCode', $event)"
          />
        </div>
      </CollapsibleContent>
    </div>
  </Collapsible>
</template>

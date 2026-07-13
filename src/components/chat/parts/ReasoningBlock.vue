<script setup lang="ts">
import { BrainIcon, ChevronDownIcon } from '@lucide/vue'
import { computed, ref, watch } from 'vue'

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Marker, MarkerContent, MarkerIcon } from '@/components/ui/marker'
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
    class="w-full"
  >
    <div class="flex min-w-0 flex-col gap-1.5">
      <CollapsibleTrigger as-child>
        <Marker
          as="button"
          type="button"
          class="min-h-6 cursor-pointer rounded-md px-1 py-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <MarkerIcon>
            <BrainIcon />
          </MarkerIcon>
          <MarkerContent :class="cn('min-w-0 flex-1 truncate', streaming && 'shimmer')">
            {{ streaming ? '正在推理' : '推理过程' }}
          </MarkerContent>
          <MarkerIcon class="ml-auto">
            <ChevronDownIcon
              :class="cn('transition-transform', open && 'rotate-180')"
            />
          </MarkerIcon>
        </Marker>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div class="pt-1 pl-6">
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

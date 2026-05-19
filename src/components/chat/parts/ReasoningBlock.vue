<script setup lang="ts">
import { BrainIcon, ChevronDownIcon } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'

import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import type { MessagePart } from '@/composables/useMessages'
import { cn } from '@/lib/utils'

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
    class="border-l pl-3"
  >
    <CollapsibleTrigger as-child>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        class="w-full justify-between px-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
      >
        <span class="flex min-w-0 items-center gap-2">
          <BrainIcon data-icon="inline-start" />
          <span class="truncate">{{ streaming ? '正在推理' : '推理过程' }}</span>
        </span>
        <ChevronDownIcon
          data-icon="inline-end"
          :class="cn('transition-transform', open && 'rotate-180')"
        />
      </Button>
    </CollapsibleTrigger>

    <CollapsibleContent>
      <div class="py-2 text-xs leading-5 text-muted-foreground">
        <p class="whitespace-pre-wrap break-words">
          {{ text }}
        </p>
      </div>
    </CollapsibleContent>
  </Collapsible>
</template>

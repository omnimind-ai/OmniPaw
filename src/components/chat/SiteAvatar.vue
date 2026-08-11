<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { type RefItem, refFallbackLabel, refFaviconSources } from './chat-display'

const props = withDefaults(
  defineProps<{
    refItem: RefItem
    size?: 'sm' | 'default' | 'lg'
  }>(),
  {
    size: 'default',
  }
)

const sources = computed(() => refFaviconSources(props.refItem))
const sourceIndex = ref(0)
const currentSource = computed(() => sources.value[sourceIndex.value])
const fallbackLabel = computed(() => refFallbackLabel(props.refItem))

watch(sources, () => {
  sourceIndex.value = 0
})

function handleLoadingStatus(status: 'idle' | 'loading' | 'loaded' | 'error') {
  if (status !== 'error' || sourceIndex.value >= sources.value.length - 1) return
  sourceIndex.value += 1
}
</script>

<template>
  <Avatar :size="size">
    <AvatarImage
      v-if="currentSource"
      :src="currentSource"
      :alt="refItem.title || refItem.url || refItem.id"
      referrer-policy="no-referrer"
      @loading-status-change="handleLoadingStatus"
    />
    <AvatarFallback>{{ fallbackLabel }}</AvatarFallback>
  </Avatar>
</template>

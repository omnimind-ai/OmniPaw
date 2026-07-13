<script setup lang="ts">
import { reactiveOmit } from '@vueuse/core'
import type { AvatarImageProps } from 'reka-ui'
import { AvatarImage } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<AvatarImageProps & { class?: HTMLAttributes['class'] }>()
const delegatedProps = reactiveOmit(props, 'class')
</script>

<template>
  <AvatarImage
    data-slot="avatar-image"
    v-bind="delegatedProps"
    :class="cn('aspect-square size-full rounded-full object-cover', props.class)"
  >
    <slot />
  </AvatarImage>
</template>

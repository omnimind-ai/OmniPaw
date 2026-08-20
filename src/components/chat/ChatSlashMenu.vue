<script setup lang="ts">
import { ArrowDownIcon, ArrowUpIcon, CornerDownLeftIcon } from '@lucide/vue'
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  type ChatSlashMenuItem,
  type ChatSlashMenuItemKind,
  chatSlashItemDomId,
} from './chat-slash-menu'

const props = defineProps<{
  items: ChatSlashMenuItem[]
  activeItemId?: string
  skillsLoading?: boolean
  skillsUnavailable?: boolean
  maxHeight?: number
}>()

const emit = defineEmits<{
  select: [item: ChatSlashMenuItem]
}>()

const { t } = useI18n()
const menuRef = ref<HTMLElement | null>(null)
const groupOrder: ChatSlashMenuItemKind[] = ['command', 'skill']
const sections = computed(() =>
  groupOrder
    .map((kind) => ({
      kind,
      label: t(`chat.composer.slashMenu.groups.${kind}`),
      items: props.items.filter((item) => item.kind === kind),
    }))
    .filter((section) => section.items.length > 0)
)
const menuViewportHeight = computed(() => {
  const itemRows = Math.max(props.items.length, 1)
  const statusRows = props.skillsLoading || props.skillsUnavailable ? 1 : 0
  const contentHeight = itemRows * 56 + sections.value.length * 34 + statusRows * 44 + 12
  const availableHeight = Math.max(96, (props.maxHeight ?? 440) - 41)
  return Math.min(400, contentHeight, availableHeight)
})

watch(
  () => props.activeItemId,
  async (itemId) => {
    if (!itemId) return
    await nextTick()
    menuRef.value
      ?.querySelector<HTMLElement>(`[data-slash-item-id="${CSS.escape(itemId)}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  },
  { flush: 'post' }
)
</script>

<template>
  <section
    ref="menuRef"
    id="chat-slash-menu"
    class="absolute inset-x-0 bottom-[calc(100%+0.5rem)] z-20 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-xl"
    role="listbox"
    :aria-label="t('chat.composer.slashMenu.ariaLabel')"
  >
    <ScrollArea :style="{ height: `${menuViewportHeight}px` }">
      <div class="flex flex-col gap-1 p-1.5">
        <template
          v-for="section in sections"
          :key="section.kind"
        >
          <div class="px-2 pb-1 pt-2 text-xs font-medium text-muted-foreground">
            {{ section.label }}
          </div>

          <Button
            v-for="item in section.items"
            :id="chatSlashItemDomId(item.id)"
            :key="item.id"
            type="button"
            variant="ghost"
            class="h-auto w-full justify-start gap-3 rounded-lg px-2.5 py-2 text-left [&[aria-selected=true]]:bg-muted"
            role="option"
            :aria-selected="item.id === activeItemId"
            :data-slash-item-id="item.id"
            @mousedown.prevent
            @click="emit('select', item)"
          >
            <component
              :is="item.icon"
              data-icon="inline-start"
            />
            <span class="flex min-w-0 flex-1 items-center gap-3">
              <span class="min-w-24 shrink-0 font-medium">{{ item.label }}</span>
              <span class="min-w-0 flex-1 truncate text-muted-foreground">
                {{ item.description }}
              </span>
              <span class="shrink-0 font-mono text-xs text-muted-foreground">
                {{ item.token }}
              </span>
            </span>
          </Button>
        </template>

        <div
          v-if="skillsLoading"
          class="px-3 py-2 text-sm text-muted-foreground"
        >
          {{ t('chat.composer.slashMenu.skillsLoading') }}
        </div>
        <div
          v-else-if="skillsUnavailable"
          class="px-3 py-2 text-sm text-muted-foreground"
        >
          {{ t('chat.composer.slashMenu.skillsUnavailable') }}
        </div>
        <div
          v-else-if="!items.length"
          class="px-3 py-6 text-center text-sm text-muted-foreground"
        >
          {{ t('chat.composer.slashMenu.empty') }}
        </div>
      </div>
    </ScrollArea>

    <Separator />
    <footer class="flex items-center justify-end gap-3 px-3 py-2 text-xs text-muted-foreground">
      <span class="flex items-center gap-1.5">
        <KbdGroup>
          <Kbd><ArrowUpIcon /></Kbd>
          <Kbd><ArrowDownIcon /></Kbd>
        </KbdGroup>
        {{ t('chat.composer.slashMenu.navigate') }}
      </span>
      <span class="flex items-center gap-1.5">
        <Kbd><CornerDownLeftIcon /></Kbd>
        {{ t('chat.composer.slashMenu.choose') }}
      </span>
      <span class="flex items-center gap-1.5">
        <Kbd>Esc</Kbd>
        {{ t('chat.composer.slashMenu.close') }}
      </span>
    </footer>
  </section>
</template>

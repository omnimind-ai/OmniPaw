<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'

interface CompanionRolePreviewSection {
  id: string
  title: string
  kind: 'base' | 'knowledge' | 'advanced'
  text: string
  estimatedTokens: number
}

const props = defineProps<{
  open: boolean
  input: string
  sections: CompanionRolePreviewSection[]
  tokenTotal: number
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'update:input': [value: string]
}>()

const { t } = useI18n()

const inputModel = computed({
  get: () => props.input,
  set: (value: string) => emit('update:input', value),
})
</script>

<template>
  <Dialog
    :open="open"
    @update:open="emit('update:open', $event)"
  >
    <DialogContent class="sm:max-w-4xl">
      <DialogHeader>
        <DialogTitle>{{ t('settings.catAppearance.role.preview.title') }}</DialogTitle>
        <DialogDescription>
          {{ t('settings.catAppearance.role.preview.description') }}
        </DialogDescription>
      </DialogHeader>

      <div class="grid min-h-0 gap-4 md:grid-cols-[18rem_minmax(0,1fr)]">
        <div class="flex min-w-0 flex-col gap-2">
          <label
            for="settings-companion-role-preview-input"
            class="text-sm font-medium"
          >
            {{ t('settings.catAppearance.role.preview.inputLabel') }}
          </label>
          <Textarea
            id="settings-companion-role-preview-input"
            v-model="inputModel"
            class="min-h-40"
            :placeholder="t('settings.catAppearance.role.preview.inputPlaceholder')"
          />
          <p class="text-xs text-muted-foreground">
            {{ t('settings.catAppearance.role.preview.tokenSummary', { count: tokenTotal }) }}
          </p>
        </div>

        <ScrollArea class="max-h-[68vh] min-h-0 pr-4">
          <div class="flex flex-col gap-3">
            <section
              v-for="section in sections"
              :key="section.id"
              class="rounded-md border bg-background/60 p-3"
            >
              <div class="mb-2 flex flex-wrap items-center gap-2">
                <Badge variant="outline">
                  {{ t(`settings.catAppearance.role.preview.kinds.${section.kind}`) }}
                </Badge>
                <span class="text-sm font-medium">{{ section.title }}</span>
                <span class="text-xs text-muted-foreground">
                  {{ t('settings.catAppearance.role.preview.tokens', { count: section.estimatedTokens }) }}
                </span>
              </div>
              <pre class="whitespace-pre-wrap break-words text-sm leading-relaxed">{{ section.text }}</pre>
            </section>

            <p
              v-if="!sections.length"
              class="rounded-md border border-dashed px-3 py-8 text-center text-sm text-muted-foreground"
            >
              {{ t('settings.catAppearance.role.preview.empty') }}
            </p>
          </div>
        </ScrollArea>
      </div>
    </DialogContent>
  </Dialog>
</template>

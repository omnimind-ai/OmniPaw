<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type {
  CompanionRolePromptSegment,
  CompanionRolePromptTone,
} from '@/components/settings/companion-role-settings/types'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

const props = defineProps<{
  open: boolean
  segments: CompanionRolePromptSegment[]
  tokenTotal: number
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const { t } = useI18n()

const segmentToneClass: Record<CompanionRolePromptTone, string> = {
  blue: 'bg-prompt-blue/35 hover:bg-prompt-blue/45',
  violet: 'bg-prompt-violet/35 hover:bg-prompt-violet/45',
  slate: 'bg-prompt-slate/35 hover:bg-prompt-slate/45',
  teal: 'bg-prompt-teal/35 hover:bg-prompt-teal/45',
  amber: 'bg-prompt-amber/35 hover:bg-prompt-amber/45',
}
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

      <div class="flex min-h-0 flex-col gap-3">
        <div class="flex items-center justify-end gap-3 text-xs text-muted-foreground">
          <span>{{ t('settings.catAppearance.role.preview.tokenSummary', { count: tokenTotal }) }}</span>
        </div>

        <ScrollArea class="max-h-[68vh] min-h-64 rounded-md border bg-background/60">
          <TooltipProvider :delay-duration="120">
            <div
              v-if="segments.length"
              class="min-h-64 p-5 text-sm leading-8 whitespace-pre-wrap text-foreground"
            >
              <template
                v-for="(segment, index) in segments"
                :key="segment.id"
              >
                <Tooltip>
                  <TooltipTrigger as-child>
                    <span
                      :class="cn(
                        'inline cursor-help box-decoration-clone rounded-sm px-1 py-0.5 transition-[background-color,box-shadow] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                        segmentToneClass[segment.tone],
                      )"
                      tabindex="0"
                    >{{ segment.text }}</span>
                  </TooltipTrigger>
                  <TooltipContent
                    side="top"
                    align="start"
                    :side-offset="6"
                    class="pointer-events-none"
                  >
                    <span class="font-medium">{{ segment.owner }}</span>
                    <span class="text-background/70">
                      {{ t('settings.catAppearance.role.preview.tokens', { count: segment.estimatedTokens }) }}
                    </span>
                  </TooltipContent>
                </Tooltip>
                <br v-if="index < segments.length - 1">
              </template>
            </div>

            <p
              v-else
              class="grid min-h-64 place-items-center px-4 text-center text-sm text-muted-foreground"
            >
              {{ t('settings.catAppearance.role.preview.empty') }}
            </p>
          </TooltipProvider>
        </ScrollArea>
      </div>
    </DialogContent>
  </Dialog>
</template>

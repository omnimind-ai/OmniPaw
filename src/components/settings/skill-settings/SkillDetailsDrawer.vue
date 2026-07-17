<script setup lang="ts">
import { AlertCircleIcon, BookOpenIcon, XIcon } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import type { BridgeLocalSkillSummary } from '@/bridge/app'
import MarkdownMessagePart from '@/components/chat/parts/MarkdownMessagePart.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'

const open = defineModel<boolean>('open', { required: true })

const props = defineProps<{
  skill?: BridgeLocalSkillSummary
  content: string
  loading: boolean
  loadError: string
}>()

const { t } = useI18n()
</script>

<template>
  <Sheet v-model:open="open">
    <SheetContent
      side="right"
      class="w-full gap-0 p-0 sm:max-w-lg"
      :show-close-button="false"
    >
      <SheetHeader class="flex-row items-start gap-3 px-5 py-4 text-left">
        <div class="min-w-0 flex-1">
          <SheetTitle>{{ t('settings.skill.details.title') }}</SheetTitle>
          <SheetDescription>{{ skill?.name ?? t('settings.skill.details.selectSkill') }}</SheetDescription>
        </div>
        <SheetClose as-child>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            :aria-label="t('settings.skill.details.close')"
          >
            <XIcon />
          </Button>
        </SheetClose>
      </SheetHeader>

      <Separator />

      <div
        v-if="skill"
        class="min-h-0 flex-1 overflow-y-auto px-5 py-5"
      >
        <FieldGroup>
          <div class="flex items-start gap-3">
            <div class="flex size-12 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <BookOpenIcon />
            </div>
            <div class="min-w-0 flex-1">
              <h2 class="text-base font-semibold">{{ skill.name }}</h2>
              <div class="mt-2 flex flex-wrap gap-2">
                <Badge variant="secondary">
                  {{ t(`settings.skill.skillStatus.${skill.status}`) }}
                </Badge>
                <Badge variant="outline">
                  {{ skill.enabled ? t('settings.skill.enabled') : t('settings.skill.disabled') }}
                </Badge>
              </div>
            </div>
          </div>

          <Field>
            <FieldLabel>{{ t('settings.skill.details.description') }}</FieldLabel>
            <p class="whitespace-pre-wrap break-words text-sm leading-relaxed">
              {{ skill.description || t('settings.skill.noDescription') }}
            </p>
          </Field>

          <Field>
            <FieldLabel>{{ t('settings.skill.details.content') }}</FieldLabel>
            <div
              v-if="loading"
              class="flex flex-col gap-3"
            >
              <Skeleton class="h-5 w-4/5" />
              <Skeleton class="h-5 w-full" />
              <Skeleton class="h-5 w-3/4" />
              <Skeleton class="h-24 w-full" />
            </div>
            <FieldDescription
              v-else-if="loadError"
              class="text-destructive"
            >
              {{ loadError }}
            </FieldDescription>
            <MarkdownMessagePart
              v-else-if="content"
              :content="content"
            />
            <FieldDescription v-else>
              {{ t('settings.skill.details.emptyContent') }}
            </FieldDescription>
          </Field>

          <Field
            v-if="skill.error"
            data-invalid
            class="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-3"
          >
            <FieldLabel class="flex items-center gap-2 text-destructive">
              <AlertCircleIcon
                class="size-4"
                aria-hidden="true"
              />
              {{ t('settings.skill.errorLabel') }}
            </FieldLabel>
            <FieldDescription class="text-destructive">
              {{ skill.error }}
            </FieldDescription>
          </Field>
        </FieldGroup>
      </div>

      <Separator />
      <SheetFooter class="p-4">
        <SheetClose as-child>
          <Button
            type="button"
            variant="outline"
          >
            {{ t('settings.skill.details.close') }}
          </Button>
        </SheetClose>
      </SheetFooter>
    </SheetContent>
  </Sheet>
</template>

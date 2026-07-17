<script setup lang="ts">
import { XIcon } from '@lucide/vue'
import type {
  CompanionMemoryInspectResponse,
  CompanionMemoryItem,
  CompanionMemoryKind,
  CompanionMemoryLink,
  CompanionMemoryMaintenanceProposal,
  CompanionMemoryStatus,
  UpdateCompanionMemoryRequest,
} from '@shared/types/memory'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import { Textarea } from '@/components/ui/textarea'
import {
  formatMemoryTime,
  memoryKindLabel,
  memoryScopeLabel,
  memoryStatusLabel,
  memoryStatusVariant,
  percentLabel,
} from './format'

const { t } = useI18n()

const open = defineModel<boolean>('open', { required: true })

const props = defineProps<{
  memory?: CompanionMemoryInspectResponse['memory']
  links?: CompanionMemoryLink[]
  proposals?: CompanionMemoryMaintenanceProposal[]
  loading: boolean
  saving: boolean
}>()

const emit = defineEmits<{
  submit: [request: UpdateCompanionMemoryRequest]
}>()

const content = ref('')
const kind = ref<CompanionMemoryKind>('fact')
const status = ref<CompanionMemoryStatus>('active')
const importance = ref(3)

const hasMemory = computed(() => Boolean(props.memory))
const canSubmit = computed(() => {
  const memory = props.memory
  if (!memory || props.loading) return false
  return (
    content.value.trim() !== memory.content ||
    kind.value !== memory.kind ||
    status.value !== memory.status ||
    clampInteger(importance.value, 1, 5) !== memory.importance
  )
})

watch(
  () => props.memory,
  (memory) => {
    if (memory) resetDraft(memory)
  },
  { immediate: true }
)

function submit(): void {
  const memory = props.memory
  if (!memory) return

  emit('submit', {
    memoryId: memory.id,
    kind: kind.value,
    status: status.value,
    content: content.value.trim(),
    importance: clampInteger(importance.value, 1, 5),
  })
}

function resetDraft(memory: CompanionMemoryItem): void {
  content.value = memory.content
  kind.value = memory.kind
  status.value = memory.status
  importance.value = memory.importance
}

function clampInteger(value: string | number, min: number, max: number): number {
  const next = Math.round(Number(value))
  if (!Number.isFinite(next)) return min
  return Math.min(max, Math.max(min, next))
}
</script>

<template>
  <Sheet v-model:open="open">
    <SheetContent
      side="right"
      class="w-full gap-0 p-0 sm:max-w-xl"
      :show-close-button="false"
    >
      <SheetHeader class="flex-row items-start gap-3 px-5 py-4 text-left">
        <div class="min-w-0 flex-1">
          <SheetTitle>{{ t('settings.memory.detailModal.title') }}</SheetTitle>
          <SheetDescription>
            {{ memory ? `${memoryKindLabel(memory.kind)} · ${formatMemoryTime(memory.updatedAt)}` : t('settings.memory.detailModal.selectMemory') }}
          </SheetDescription>
        </div>
        <SheetClose as-child>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            :aria-label="t('settings.memory.detailModal.close')"
          >
            <XIcon />
          </Button>
        </SheetClose>
      </SheetHeader>

      <Separator />

      <div class="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        <div
          v-if="loading && !hasMemory"
          class="flex flex-col gap-3"
        >
          <Skeleton class="h-12 w-full" />
          <Skeleton class="h-40 w-full" />
          <Skeleton class="h-24 w-full" />
        </div>

        <FieldGroup v-else-if="memory">
          <div class="flex flex-wrap items-center gap-2">
            <Badge :variant="memoryStatusVariant(memory.status)">
              {{ memoryStatusLabel(memory.status) }}
            </Badge>
            <Badge variant="outline">{{ memoryScopeLabel(memory.scope) }}</Badge>
            <Badge variant="outline">
              {{ t('settings.memory.detailModal.confidence', { value: percentLabel(memory.confidence) }) }}
            </Badge>
          </div>

          <Field>
            <FieldLabel for="memory-detail-kind">{{ t('settings.memory.detailModal.kind') }}</FieldLabel>
            <Select v-model="kind">
              <SelectTrigger
                id="memory-detail-kind"
                class="w-full"
              >
                <SelectValue :placeholder="t('settings.memory.detailModal.selectKind')" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="fact">{{ t('settings.memory.detailModal.kindFact') }}</SelectItem>
                  <SelectItem value="preference">{{ t('settings.memory.detailModal.kindPreference') }}</SelectItem>
                  <SelectItem value="profile">{{ t('settings.memory.detailModal.kindProfile') }}</SelectItem>
                  <SelectItem value="relationship">{{ t('settings.memory.detailModal.kindRelationship') }}</SelectItem>
                  <SelectItem value="episode">{{ t('settings.memory.detailModal.kindEpisode') }}</SelectItem>
                  <SelectItem value="plan">{{ t('settings.memory.detailModal.kindPlan') }}</SelectItem>
                  <SelectItem value="boundary">{{ t('settings.memory.detailModal.kindBoundary') }}</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <FieldLabel for="memory-detail-status">{{ t('settings.memory.detailModal.status') }}</FieldLabel>
            <Select v-model="status">
              <SelectTrigger
                id="memory-detail-status"
                class="w-full"
              >
                <SelectValue :placeholder="t('settings.memory.detailModal.selectStatus')" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="active">{{ t('settings.memory.detailModal.statusActive') }}</SelectItem>
                  <SelectItem value="pending">{{ t('settings.memory.detailModal.statusPending') }}</SelectItem>
                  <SelectItem value="disabled">{{ t('settings.memory.detailModal.statusDisabled') }}</SelectItem>
                  <SelectItem value="archived">{{ t('settings.memory.detailModal.statusArchived') }}</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <FieldLabel for="memory-detail-importance">{{ t('settings.memory.detailModal.importance') }}</FieldLabel>
            <Input
              id="memory-detail-importance"
              v-model="importance"
              type="number"
              min="1"
              max="5"
              step="1"
            />
          </Field>

          <Field>
            <FieldLabel for="memory-detail-content">{{ t('settings.memory.detailModal.content') }}</FieldLabel>
            <Textarea
              id="memory-detail-content"
              v-model="content"
              rows="8"
            />
          </Field>

          <Separator />

          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field class="rounded-md border px-3 py-2">
              <FieldLabel>{{ t('settings.memory.detailModal.createdAt') }}</FieldLabel>
              <FieldDescription>{{ formatMemoryTime(memory.createdAt) }}</FieldDescription>
            </Field>
            <Field class="rounded-md border px-3 py-2">
              <FieldLabel>{{ t('settings.memory.detailModal.updatedAt') }}</FieldLabel>
              <FieldDescription>{{ formatMemoryTime(memory.updatedAt) }}</FieldDescription>
            </Field>
          </div>

          <template v-if="links?.length">
            <Field>
              <FieldContent>
                <FieldLabel>{{ t('settings.memory.detailModal.relatedMemories') }}</FieldLabel>
                <FieldDescription>{{ t('settings.memory.detailModal.relatedMemoriesDescription') }}</FieldDescription>
              </FieldContent>
            </Field>

            <div class="flex flex-col gap-2">
              <div
                v-for="link in links"
                :key="link.id"
                class="rounded-md border px-3 py-2 text-sm"
              >
                <div class="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{{ link.relation }}</Badge>
                  <span class="break-all text-muted-foreground">
                    {{ link.memoryId === memory.id ? link.linkedMemoryId : link.memoryId }}
                  </span>
                  <span class="text-muted-foreground">
                    {{ t('settings.memory.detailModal.linkConfidence', { value: percentLabel(link.confidence) }) }}
                  </span>
                </div>
              </div>
            </div>
          </template>

          <template v-if="proposals?.length">
            <Field>
              <FieldContent>
                <FieldLabel>{{ t('settings.memory.detailModal.proposals') }}</FieldLabel>
                <FieldDescription>{{ t('settings.memory.detailModal.proposalsDescription') }}</FieldDescription>
              </FieldContent>
            </Field>

            <div class="flex flex-col gap-2">
              <div
                v-for="proposal in proposals"
                :key="proposal.id"
                class="rounded-md border px-3 py-2 text-sm"
              >
                <div class="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{{ proposal.kind }}</Badge>
                  <Badge variant="outline">{{ proposal.status }}</Badge>
                  <span class="text-muted-foreground">
                    {{ t('settings.memory.detailModal.proposalConfidence', { value: percentLabel(proposal.confidence) }) }}
                  </span>
                </div>
                <p class="mt-2 text-muted-foreground">{{ proposal.reason }}</p>
              </div>
            </div>
          </template>
        </FieldGroup>

        <div
          v-else
          class="rounded-md border px-4 py-6 text-sm text-muted-foreground"
        >
          {{ t('settings.memory.detailModal.notLoaded') }}
        </div>
      </div>

      <Separator />
      <SheetFooter class="grid grid-cols-2 p-4">
        <SheetClose as-child>
          <Button
            type="button"
            variant="outline"
          >
            {{ t('settings.memory.detailModal.close') }}
          </Button>
        </SheetClose>
        <Button
          type="button"
          :disabled="saving || !canSubmit"
          @click="submit"
        >
          {{ t('settings.memory.detailModal.save') }}
        </Button>
      </SheetFooter>
    </SheetContent>
  </Sheet>
</template>

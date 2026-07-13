<script setup lang="ts">
import { BookOpenIcon, CheckIcon, PencilIcon, PlusIcon, Trash2Icon } from '@lucide/vue'
import type { CompanionRoleKnowledgeEntry } from '@shared/types/companion-role'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingEntry from '@/components/settings/common/SettingEntry.vue'
import SettingsSearchBar from '@/components/settings/common/SettingsSearchBar.vue'
import SettingsSection from '@/components/settings/common/SettingsSection.vue'
import CompanionRoleKnowledgeCreateDialog, {
  type CreateCompanionRoleKnowledgeEntryPayload,
} from '@/components/settings/companion-role-settings/CompanionRoleKnowledgeCreateDialog.vue'
import CompanionRoleKnowledgeDeleteModal from '@/components/settings/companion-role-settings/CompanionRoleKnowledgeDeleteModal.vue'
import type { CompanionRole } from '@/components/settings/companion-role-settings/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

const props = defineProps<{
  entries: CompanionRole['knowledgeEntries']
  settings: CompanionRole['knowledgeSettings']
}>()

const emit = defineEmits<{
  'update:entries': [entries: CompanionRole['knowledgeEntries']]
  'update:settings': [settings: CompanionRole['knowledgeSettings']]
}>()

const { t } = useI18n()
const knowledgeSearchQuery = ref('')
const editingKnowledgeEntryIds = ref<string[]>([])
const knowledgeCreateDialogOpen = ref(false)
const knowledgeDeleteTargetId = ref<string>()
const normalizedSettings = computed(() => ({
  scanDepth: props.settings?.scanDepth ?? 8,
  maxTokens: props.settings?.maxTokens ?? 900,
}))
const filteredKnowledgeEntries = computed(() => {
  const query = normalizeKnowledgeSearchText(knowledgeSearchQuery.value)
  return props.entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => !query || knowledgeEntryMatchesSearch(entry, query))
})
const knowledgeDeleteTarget = computed(() =>
  props.entries.find((entry) => entry.id === knowledgeDeleteTargetId.value)
)
const knowledgeDeleteDialogOpen = computed({
  get: () => Boolean(knowledgeDeleteTarget.value),
  set: (open) => {
    if (!open) {
      knowledgeDeleteTargetId.value = undefined
    }
  },
})

function openKnowledgeCreateDialog(): void {
  knowledgeCreateDialogOpen.value = true
}

function createKnowledgeEntry(payload: CreateCompanionRoleKnowledgeEntryPayload): void {
  const entries = ensureKnowledgeEntries()
  const now = Date.now()
  emit('update:entries', [
    ...entries,
    {
      id: createRoleKnowledgeId(entries.length),
      enabled: true,
      title: payload.title || t('settings.catAppearance.role.knowledge.newTitle'),
      content: payload.content,
      keys: payload.keys,
      constant: payload.constant,
      priority: payload.priority,
      order: entries.length,
      tokenBudget: payload.tokenBudget,
      createdAt: now,
      updatedAt: now,
    },
  ])
  knowledgeCreateDialogOpen.value = false
}

function deleteKnowledgeEntry(targetId: string): void {
  emit(
    'update:entries',
    ensureKnowledgeEntries().filter((entry) => entry.id !== targetId)
  )
  editingKnowledgeEntryIds.value = editingKnowledgeEntryIds.value.filter((id) => id !== targetId)
}

function requestDeleteKnowledgeEntry(targetId: string): void {
  knowledgeDeleteTargetId.value = targetId
}

function confirmDeleteKnowledgeEntry(): void {
  if (!knowledgeDeleteTargetId.value) return
  deleteKnowledgeEntry(knowledgeDeleteTargetId.value)
  knowledgeDeleteTargetId.value = undefined
}

function isKnowledgeEntryEditing(targetId: string): boolean {
  return editingKnowledgeEntryIds.value.includes(targetId)
}

function toggleKnowledgeEntryEditing(targetId: string): void {
  editingKnowledgeEntryIds.value = isKnowledgeEntryEditing(targetId)
    ? editingKnowledgeEntryIds.value.filter((id) => id !== targetId)
    : [...editingKnowledgeEntryIds.value, targetId]
}

function updateKnowledgeEntry(
  targetId: string,
  patch: Partial<Omit<CompanionRoleKnowledgeEntry, 'id' | 'createdAt'>>
): void {
  emit(
    'update:entries',
    ensureKnowledgeEntries().map((entry) =>
      entry.id === targetId ? { ...entry, ...patch, updatedAt: Date.now() } : entry
    )
  )
}

function updateKnowledgeKeys(targetId: string, value: string): void {
  updateKnowledgeEntry(targetId, { keys: splitInlineList(value) })
}

function updateKnowledgeTokenBudget(targetId: string, value: string): void {
  const trimmed = value.trim()
  if (!trimmed) {
    updateKnowledgeEntry(targetId, { tokenBudget: undefined })
    return
  }
  const numeric = Number(trimmed)
  if (Number.isFinite(numeric)) {
    updateKnowledgeEntry(targetId, { tokenBudget: Math.max(50, Math.round(numeric)) })
  }
}

function updateKnowledgeScanDepth(value: string): void {
  emit('update:settings', {
    ...normalizedSettings.value,
    scanDepth: normalizeIntegerInput(value, 8, 1, 40),
  })
}

function updateKnowledgeMaxTokens(value: string): void {
  emit('update:settings', {
    ...normalizedSettings.value,
    maxTokens: normalizeIntegerInput(value, 900, 200, 8000),
  })
}

function eventInputValue(event: Event): string {
  return (event.target as HTMLInputElement | null)?.value ?? ''
}

function ensureKnowledgeEntries(): CompanionRole['knowledgeEntries'] {
  return Array.isArray(props.entries) ? props.entries : []
}

function splitInlineList(value: string): string[] {
  return value
    .split(/[,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function normalizeKnowledgeSearchText(value: string): string {
  return value.trim().toLocaleLowerCase()
}

function knowledgeEntryMatchesSearch(entry: CompanionRoleKnowledgeEntry, query: string): boolean {
  return [
    entry.title,
    entry.content,
    ...entry.keys,
    entry.constant ? t('settings.catAppearance.role.knowledge.fields.constant') : '',
  ]
    .join(' ')
    .toLocaleLowerCase()
    .includes(query)
}

function normalizeIntegerInput(value: string, fallback: number, min: number, max: number): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.min(max, Math.max(min, Math.round(numeric)))
}

function createRoleKnowledgeId(index: number): string {
  return `role-knowledge-${Date.now().toString(36)}-${index}-${Math.random().toString(36).slice(2, 8)}`
}
</script>

<template>
  <SettingsSection
    :title="t('settings.catAppearance.role.sections.knowledge.title')"
    :description="t('settings.catAppearance.role.sections.knowledge.description')"
    :icon="BookOpenIcon"
  >
    <template #actions>
      <Button
        type="button"
        size="sm"
        @click="openKnowledgeCreateDialog"
      >
        <PlusIcon data-icon="inline-start" />
        {{ t('settings.catAppearance.role.knowledge.add') }}
      </Button>
    </template>

    <FieldGroup class="gap-0">
      <SettingEntry
        control-id="settings-companion-role-knowledge-scan-depth"
        :title="t('settings.catAppearance.role.knowledge.settings.scanDepth')"
        :description="t('settings.catAppearance.role.knowledge.settings.scanDepthDescription')"
      >
        <Input
          id="settings-companion-role-knowledge-scan-depth"
          :model-value="normalizedSettings.scanDepth"
          class="w-full md:w-32"
          type="number"
          min="1"
          max="40"
          @input="updateKnowledgeScanDepth(eventInputValue($event))"
        />
      </SettingEntry>

      <SettingEntry
        control-id="settings-companion-role-knowledge-max-tokens"
        :title="t('settings.catAppearance.role.knowledge.settings.maxTokens')"
        :description="t('settings.catAppearance.role.knowledge.settings.maxTokensDescription')"
      >
        <Input
          id="settings-companion-role-knowledge-max-tokens"
          :model-value="normalizedSettings.maxTokens"
          class="w-full md:w-32"
          type="number"
          min="200"
          max="8000"
          @input="updateKnowledgeMaxTokens(eventInputValue($event))"
        />
      </SettingEntry>
    </FieldGroup>

    <div class="flex flex-col gap-3 border-t p-4 sm:p-5">
      <div class="flex min-w-0 flex-col gap-1">
        <p class="text-sm font-semibold leading-5 text-foreground">
          {{
            t('settings.catAppearance.role.knowledge.count', {
              count: entries.length,
            })
          }}
        </p>
        <p class="max-w-4xl text-xs leading-5 text-muted-foreground">
          {{ t('settings.catAppearance.role.knowledge.description') }}
        </p>
      </div>

      <SettingsSearchBar
        v-model="knowledgeSearchQuery"
        :placeholder="t('settings.catAppearance.role.knowledge.searchPlaceholder')"
        :label="t('settings.catAppearance.role.knowledge.search')"
        :disabled="!entries.length"
        class="rounded-md border px-3 py-2 sm:px-3"
      >
        <template #summary>
          <Badge variant="secondary">
            {{
              knowledgeSearchQuery.trim()
                ? `${filteredKnowledgeEntries.length}/${entries.length}`
                : entries.length
            }}
          </Badge>
        </template>
      </SettingsSearchBar>

      <p
        v-if="!entries.length"
        class="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground"
      >
        {{ t('settings.catAppearance.role.knowledge.empty') }}
      </p>

      <p
        v-else-if="!filteredKnowledgeEntries.length"
        class="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground"
      >
        {{
          t('settings.catAppearance.role.knowledge.noSearchMatch', {
            query: knowledgeSearchQuery,
          })
        }}
      </p>

      <div
        v-for="item in filteredKnowledgeEntries"
        :key="item.entry.id"
        class="flex flex-col gap-3 rounded-md border bg-background/60 p-3"
      >
        <div class="flex flex-wrap items-center gap-2">
          <Switch
            :model-value="item.entry.enabled"
            :disabled="!isKnowledgeEntryEditing(item.entry.id)"
            @update:model-value="updateKnowledgeEntry(item.entry.id, { enabled: Boolean($event) })"
          />
          <Input
            :model-value="item.entry.title"
            class="min-w-0 flex-1"
            :disabled="!isKnowledgeEntryEditing(item.entry.id)"
            :placeholder="t('settings.catAppearance.role.knowledge.fields.title')"
            @update:model-value="updateKnowledgeEntry(item.entry.id, { title: String($event) })"
          />
          <Button
            type="button"
            :variant="isKnowledgeEntryEditing(item.entry.id) ? 'secondary' : 'ghost'"
            size="icon-sm"
            :aria-label="
              isKnowledgeEntryEditing(item.entry.id)
                ? t('settings.catAppearance.role.knowledge.finishEdit')
                : t('settings.catAppearance.role.knowledge.edit')
            "
            @click="toggleKnowledgeEntryEditing(item.entry.id)"
          >
            <component :is="isKnowledgeEntryEditing(item.entry.id) ? CheckIcon : PencilIcon" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            :aria-label="t('settings.catAppearance.role.knowledge.delete')"
            @click="requestDeleteKnowledgeEntry(item.entry.id)"
          >
            <Trash2Icon />
          </Button>
        </div>

        <Textarea
          :model-value="item.entry.content"
          class="min-h-32"
          :disabled="!isKnowledgeEntryEditing(item.entry.id)"
          :placeholder="t('settings.catAppearance.role.knowledge.fields.content')"
          @update:model-value="updateKnowledgeEntry(item.entry.id, { content: String($event) })"
        />

        <div class="grid gap-3 @3xl/field-group:grid-cols-[minmax(12rem,1fr)_8rem_9rem_auto_auto]">
          <Input
            :model-value="item.entry.keys.join(', ')"
            :disabled="!isKnowledgeEntryEditing(item.entry.id)"
            :placeholder="t('settings.catAppearance.role.knowledge.fields.keys')"
            @input="updateKnowledgeKeys(item.entry.id, eventInputValue($event))"
          />
          <Input
            :model-value="item.entry.priority"
            type="number"
            :disabled="!isKnowledgeEntryEditing(item.entry.id)"
            :placeholder="t('settings.catAppearance.role.knowledge.fields.priority')"
            @update:model-value="updateKnowledgeEntry(item.entry.id, { priority: Number($event) })"
          />
          <Input
            :model-value="item.entry.tokenBudget ?? ''"
            type="number"
            min="50"
            :disabled="!isKnowledgeEntryEditing(item.entry.id)"
            :placeholder="t('settings.catAppearance.role.knowledge.fields.tokenBudget')"
            @input="updateKnowledgeTokenBudget(item.entry.id, eventInputValue($event))"
          />
          <Field
            orientation="horizontal"
            class="min-w-max justify-start @3xl/field-group:justify-center"
          >
            <Switch
              :model-value="item.entry.constant"
              :disabled="!isKnowledgeEntryEditing(item.entry.id)"
              @update:model-value="updateKnowledgeEntry(item.entry.id, { constant: Boolean($event) })"
            />
            <FieldLabel>
              {{ t('settings.catAppearance.role.knowledge.fields.constant') }}
            </FieldLabel>
          </Field>
          <span class="self-center text-sm text-muted-foreground">
            {{ t('settings.catAppearance.role.knowledge.order', { index: item.index + 1 }) }}
          </span>
        </div>
      </div>
    </div>
  </SettingsSection>

  <CompanionRoleKnowledgeCreateDialog
    v-model:open="knowledgeCreateDialogOpen"
    @submit="createKnowledgeEntry"
  />

  <CompanionRoleKnowledgeDeleteModal
    v-if="knowledgeDeleteTarget"
    v-model:open="knowledgeDeleteDialogOpen"
    :title="knowledgeDeleteTarget.title || t('settings.catAppearance.role.knowledge.untitled')"
    @confirm="confirmDeleteKnowledgeEntry"
  />
</template>

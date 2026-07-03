<script setup lang="ts">
import type {
  CatAppearanceListResponse,
  CatAppearancePackSource,
  CatAppearancePackSummary,
  CatAppearanceResolvedPack,
} from '@shared/types/cat-appearance'
import { CopyIcon, ImageIcon, PackagePlusIcon, PlusIcon, Trash2Icon } from 'lucide-vue-next'
import { storeToRefs } from 'pinia'
import type { AcceptableValue } from 'reka-ui'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  appBridge,
  type BridgeDesktopSettingsConfig,
  type BridgeUnsubscribe,
  ensureElectronBridge,
  isFallbackBridge,
} from '@/bridge/app'
import SettingEntry from '@/components/settings/common/SettingEntry.vue'
import CompanionRoleAppearanceDetailPreview from '@/components/settings/companion-role-settings/CompanionRoleAppearanceDetailPreview.vue'
import CompanionRoleMemoryPanel from '@/components/settings/companion-role-settings/CompanionRoleMemoryPanel.vue'
import { Badge, type BadgeVariants } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FieldGroup } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { type ProviderModelOption, useProviderStore } from '@/stores/provider'
import { errorToText, useToast } from '@/utils/toast'

const NONE_VALUE = '__none__'

type BadgeVariant = NonNullable<BadgeVariants['variant']>
type CompanionRole = BridgeDesktopSettingsConfig['app']['companionRoles'][number]

const props = defineProps<{
  role: CompanionRole
  canDeleteRole: boolean
}>()

const emit = defineEmits<{
  duplicateRole: []
  deleteRole: [role: CompanionRole]
}>()

const { t } = useI18n()
const toast = useToast()
const providerStore = useProviderStore()
const { modelOptions, saving, persistenceAvailable } = storeToRefs(providerStore)
const activeTab = ref('basic')
const response = shallowRef<CatAppearanceListResponse>()
const loading = ref(false)
const importing = ref(false)
const currentDetailLoading = ref(false)
const currentDetailError = ref<string>()
const currentDetail = shallowRef<CatAppearanceResolvedPack>()
let unsubscribe: BridgeUnsubscribe | undefined
let detailRequestId = 0

const editableRole = computed(() => props.role)
const alternateGreetingsText = computed({
  get: () => editableRole.value.alternateGreetings.join('\n'),
  set: (value: string) => {
    editableRole.value.alternateGreetings = splitMultiline(value)
  },
})
const enabledModelOptions = computed(() => modelOptions.value.filter((option) => option.enabled))
const selectedModelKey = computed(() => {
  const providerId = editableRole.value.defaultProviderId
  const modelId = editableRole.value.defaultModelId
  if (!providerId || !modelId) return NONE_VALUE
  return (
    enabledModelOptions.value.find(
      (option) => option.providerId === providerId && option.modelId === modelId
    )?.key ?? NONE_VALUE
  )
})
const modelSelectDisabled = computed(
  () => saving.value || !persistenceAvailable.value || !enabledModelOptions.value.length
)
const packs = computed(() => response.value?.packs ?? [])
const importDisabled = computed(() => importing.value || loading.value || isFallbackBridge)
const importButtonLabel = computed(() =>
  importing.value ? t('settings.catAppearance.importing') : t('settings.catAppearance.importButton')
)
const activeRoleAppearancePackId = computed(() => editableRole.value.appearancePackId || 'builtin')
const currentPack = computed<CatAppearancePackSummary | undefined>(() => {
  const packId = activeRoleAppearancePackId.value
  const summary = packs.value.find((pack) => pack.id === packId)
  if (summary) return summary
  if (currentDetail.value?.id === packId) return currentDetail.value
  if (packId === 'builtin') {
    return {
      id: 'builtin',
      name: 'OmniPaw Cat',
      source: 'builtin',
      status: 'available',
      active: true,
      updatedAt: response.value?.updatedAt,
    }
  }
  return {
    id: packId,
    name: packId,
    source: 'local',
    status: 'missing',
    active: false,
    error: t('settings.catAppearance.detail.unavailable'),
  }
})
const currentSourceLabel = computed(() => sourceLabel(currentPack.value?.source ?? 'builtin'))
const currentStatusLabel = computed(() =>
  t(`settings.catAppearance.status.${currentPack.value?.status ?? 'available'}`)
)
const currentUpdatedLabel = computed(() =>
  t('settings.catAppearance.meta.updatedAt', {
    time: formatUpdatedAt(currentPack.value?.updatedAt ?? currentDetail.value?.updatedAt),
  })
)

onMounted(async () => {
  unsubscribe = appBridge.catAppearance.onChanged((event) => {
    response.value = event
    void loadCurrentDetail()
  })
  await loadPacks()
})

onBeforeUnmount(() => {
  unsubscribe?.()
  unsubscribe = undefined
})

watch(activeRoleAppearancePackId, () => {
  void loadCurrentDetail()
})

function modelLabel(option: ProviderModelOption): string {
  return `${option.providerName} / ${option.modelName}`
}

function updateInteractionMode(value: AcceptableValue): void {
  const next = typeof value === 'string' ? value : ''
  if (next === 'assistant' || next === 'roleplay' || next === 'companion') {
    editableRole.value.interactionMode = next
  }
}

function updateDefaultModel(value: AcceptableValue): void {
  const next = typeof value === 'string' ? value : ''
  if (!next || next === NONE_VALUE) {
    editableRole.value.defaultProviderId = undefined
    editableRole.value.defaultModelId = undefined
    return
  }

  const selected = enabledModelOptions.value.find((option) => option.key === next)
  editableRole.value.defaultProviderId = selected?.providerId
  editableRole.value.defaultModelId = selected?.modelId
}

function addKnowledgeEntry(): void {
  const entries = ensureKnowledgeEntries()
  const now = Date.now()
  entries.push({
    id: createRoleKnowledgeId(entries.length),
    enabled: true,
    title: t('settings.catAppearance.role.knowledge.newTitle'),
    content: '',
    keys: [],
    constant: true,
    priority: 0,
    order: entries.length,
    createdAt: now,
    updatedAt: now,
  })
  activeTab.value = 'knowledge'
}

function deleteKnowledgeEntry(targetId: string): void {
  const entries = ensureKnowledgeEntries()
  const index = entries.findIndex((entry) => entry.id === targetId)
  if (index >= 0) {
    entries.splice(index, 1)
  }
}

function updateKnowledgeKeys(targetId: string, value: string): void {
  const entry = ensureKnowledgeEntries().find((item) => item.id === targetId)
  if (!entry) return
  entry.keys = splitInlineList(value)
  entry.updatedAt = Date.now()
}

function eventInputValue(event: Event): string {
  return (event.target as HTMLInputElement | null)?.value ?? ''
}

function ensureKnowledgeEntries(): CompanionRole['knowledgeEntries'] {
  if (!Array.isArray(editableRole.value.knowledgeEntries)) {
    editableRole.value.knowledgeEntries = []
  }
  return editableRole.value.knowledgeEntries
}

async function loadPacks(): Promise<void> {
  loading.value = true
  try {
    response.value = await appBridge.catAppearance.list()
    await loadCurrentDetail()
  } catch (error) {
    toast.error(errorToText(error, t('settings.catAppearance.toasts.loadFailed')))
  } finally {
    loading.value = false
  }
}

async function importPack(): Promise<void> {
  if (importing.value) return

  try {
    ensureElectronBridge(t('settings.catAppearance.importButton'))
  } catch (error) {
    toast.error(errorToText(error, t('settings.catAppearance.bridgeNotReady')))
    return
  }

  importing.value = true
  try {
    const result = await appBridge.catAppearance.importPack()
    response.value = result
    if (result.canceled) {
      return
    }

    if (result.importedPackId) {
      editableRole.value.appearancePackId = result.importedPackId
    }
    await loadCurrentDetail()
    const importedPack = result.packs.find((pack) => pack.id === result.importedPackId)
    toast.success(t('settings.catAppearance.toasts.imported'), {
      description: importedPack?.name,
    })
  } catch (error) {
    toast.error(errorToText(error, t('settings.catAppearance.toasts.importFailed')))
  } finally {
    importing.value = false
  }
}

async function loadCurrentDetail(): Promise<void> {
  const requestId = detailRequestId + 1
  detailRequestId = requestId
  currentDetailLoading.value = true
  currentDetailError.value = undefined
  try {
    const resolvedPack = await appBridge.catAppearance.getPack({
      packId: activeRoleAppearancePackId.value,
    })
    if (detailRequestId !== requestId) return
    currentDetail.value = resolvedPack
  } catch (error) {
    if (detailRequestId !== requestId) return
    currentDetail.value = undefined
    currentDetailError.value = errorToText(error, t('settings.catAppearance.detail.loadFailed'))
  } finally {
    if (detailRequestId === requestId) {
      currentDetailLoading.value = false
    }
  }
}

function statusVariant(pack: CatAppearancePackSummary): BadgeVariant {
  if (pack.status === 'invalid' || pack.status === 'missing') return 'destructive'
  return 'secondary'
}

function sourceLabel(source: CatAppearancePackSource): string {
  return t(`settings.catAppearance.source.${source}`)
}

function sourceVariant(source: CatAppearancePackSource): BadgeVariant {
  return source === 'builtin' ? 'secondary' : 'outline'
}

function formatUpdatedAt(value?: number): string {
  if (!value) return t('settings.catAppearance.neverUpdated')
  return new Date(value).toLocaleString()
}

function splitMultiline(value: string): string[] {
  return value
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function splitInlineList(value: string): string[] {
  return value
    .split(/[,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function createRoleKnowledgeId(index: number): string {
  return `role-knowledge-${Date.now().toString(36)}-${index}-${Math.random().toString(36).slice(2, 8)}`
}
</script>

<template>
  <div class="grid h-full min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-md border bg-card">
    <div class="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-4 sm:px-5">
      <div class="min-w-0">
        <h1 class="truncate text-xl font-semibold">
          {{ editableRole.name || t('settings.catAppearance.role.unnamed') }}
        </h1>
        <p class="text-sm text-muted-foreground">{{ t('settings.catAppearance.role.activeHint') }}</p>
      </div>
      <div class="flex items-center gap-2">
        <Switch v-model="editableRole.enabled" />
        <Button
          variant="outline"
          size="sm"
          @click="emit('duplicateRole')"
        >
          <CopyIcon data-icon="inline-start" />
          {{ t('settings.catAppearance.role.actions.duplicate') }}
        </Button>
        <Button
          variant="outline"
          size="sm"
          :disabled="!canDeleteRole"
          @click="emit('deleteRole', editableRole)"
        >
          <Trash2Icon data-icon="inline-start" />
          {{ t('settings.catAppearance.role.actions.delete') }}
        </Button>
      </div>
    </div>

    <Tabs
      v-model="activeTab"
      class="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-0"
    >
      <div class="border-b px-4 py-3 sm:px-5">
        <TabsList class="w-full max-w-3xl">
          <TabsTrigger value="basic">
            {{ t('settings.catAppearance.role.tabs.basic') }}
          </TabsTrigger>
          <TabsTrigger value="memory">
            {{ t('settings.catAppearance.role.tabs.memory') }}
          </TabsTrigger>
          <TabsTrigger value="knowledge">
            {{ t('settings.catAppearance.role.tabs.knowledge') }}
          </TabsTrigger>
          <TabsTrigger value="appearance">
            {{ t('settings.catAppearance.role.tabs.appearance') }}
          </TabsTrigger>
          <TabsTrigger value="behavior">
            {{ t('settings.catAppearance.role.tabs.behavior') }}
          </TabsTrigger>
          <TabsTrigger value="advanced">
            {{ t('settings.catAppearance.role.tabs.advanced') }}
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent
        value="basic"
        class="min-h-0 overflow-y-auto"
      >
        <div class="flex flex-col gap-4 p-4 sm:p-5">
          <FieldGroup class="gap-0 rounded-md border bg-card">
            <SettingEntry
              control-id="settings-companion-role-name"
              :title="t('settings.catAppearance.role.fields.name.title')"
              :description="t('settings.catAppearance.role.fields.name.description')"
            >
              <Input
                id="settings-companion-role-name"
                v-model="editableRole.name"
                class="w-full md:w-72"
                :placeholder="t('settings.catAppearance.role.fields.name.placeholder')"
              />
            </SettingEntry>

            <SettingEntry
              control-id="settings-companion-role-user"
              :title="t('settings.catAppearance.role.fields.userNickname.title')"
              :description="t('settings.catAppearance.role.fields.userNickname.description')"
            >
              <Input
                id="settings-companion-role-user"
                v-model="editableRole.userNickname"
                class="w-full md:w-72"
                :placeholder="t('settings.catAppearance.role.fields.userNickname.placeholder')"
              />
            </SettingEntry>
          </FieldGroup>

          <FieldGroup class="gap-0 rounded-md border bg-card">
            <SettingEntry
              control-id="settings-companion-role-personality"
              :title="t('settings.catAppearance.role.fields.personality.title')"
              :description="t('settings.catAppearance.role.fields.personality.description')"
            >
              <Input
                id="settings-companion-role-personality"
                v-model="editableRole.personality"
                class="w-full md:w-96"
                :placeholder="t('settings.catAppearance.role.fields.personality.placeholder')"
              />
            </SettingEntry>

            <SettingEntry
              control-id="settings-companion-role-speech"
              :title="t('settings.catAppearance.role.fields.speechStyle.title')"
              :description="t('settings.catAppearance.role.fields.speechStyle.description')"
            >
              <Input
                id="settings-companion-role-speech"
                v-model="editableRole.speechStyle"
                class="w-full md:w-96"
                :placeholder="t('settings.catAppearance.role.fields.speechStyle.placeholder')"
              />
            </SettingEntry>

            <SettingEntry
              control-id="settings-companion-role-relationship"
              :title="t('settings.catAppearance.role.fields.relationship.title')"
              :description="t('settings.catAppearance.role.fields.relationship.description')"
            >
              <Input
                id="settings-companion-role-relationship"
                v-model="editableRole.relationship"
                class="w-full md:w-96"
                :placeholder="t('settings.catAppearance.role.fields.relationship.placeholder')"
              />
            </SettingEntry>
          </FieldGroup>

          <FieldGroup class="gap-0 rounded-md border bg-card">
            <SettingEntry
              control-id="settings-companion-role-background"
              :title="t('settings.catAppearance.role.fields.background.title')"
              :description="t('settings.catAppearance.role.fields.background.description')"
              control-class="@md/field-group:w-[min(32rem,50vw)]"
            >
              <Textarea
                id="settings-companion-role-background"
                v-model="editableRole.background"
                class="min-h-24"
                :placeholder="t('settings.catAppearance.role.fields.background.placeholder')"
              />
            </SettingEntry>

            <SettingEntry
              control-id="settings-companion-role-greeting"
              :title="t('settings.catAppearance.role.fields.greeting.title')"
              :description="t('settings.catAppearance.role.fields.greeting.description')"
              control-class="@md/field-group:w-[min(32rem,50vw)]"
            >
              <Textarea
                id="settings-companion-role-greeting"
                v-model="editableRole.greeting"
                class="min-h-24"
                :placeholder="t('settings.catAppearance.role.fields.greeting.placeholder')"
              />
            </SettingEntry>

            <SettingEntry
              control-id="settings-companion-role-alternate-greetings"
              :title="t('settings.catAppearance.role.fields.alternateGreetings.title')"
              :description="t('settings.catAppearance.role.fields.alternateGreetings.description')"
              control-class="@md/field-group:w-[min(32rem,50vw)]"
            >
              <Textarea
                id="settings-companion-role-alternate-greetings"
                v-model="alternateGreetingsText"
                class="min-h-24"
                :placeholder="t('settings.catAppearance.role.fields.alternateGreetings.placeholder')"
              />
            </SettingEntry>
          </FieldGroup>
        </div>
      </TabsContent>

      <TabsContent
        value="memory"
        class="min-h-0 overflow-hidden"
      >
        <CompanionRoleMemoryPanel
          :role-id="editableRole.id"
          :role-name="editableRole.name || t('settings.catAppearance.role.unnamed')"
        />
      </TabsContent>

      <TabsContent
        value="knowledge"
        class="min-h-0 overflow-y-auto"
      >
        <div class="flex flex-col gap-4 p-4 sm:p-5">
          <FieldGroup class="gap-0 rounded-md border bg-card">
            <SettingEntry
              control-id="settings-companion-role-knowledge"
              :title="t('settings.catAppearance.role.knowledge.title')"
              :description="t('settings.catAppearance.role.knowledge.description')"
              control-class="@md/field-group:w-[min(40rem,58vw)]"
            >
              <div class="flex w-full flex-col gap-3">
                <div class="flex items-center justify-between gap-3">
                  <p class="text-sm text-muted-foreground">
                    {{ t('settings.catAppearance.role.knowledge.count', { count: editableRole.knowledgeEntries.length }) }}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    @click="addKnowledgeEntry"
                  >
                    <PlusIcon data-icon="inline-start" />
                    {{ t('settings.catAppearance.role.knowledge.add') }}
                  </Button>
                </div>

                <p
                  v-if="!editableRole.knowledgeEntries.length"
                  class="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground"
                >
                  {{ t('settings.catAppearance.role.knowledge.empty') }}
                </p>

                <div
                  v-for="(entry, index) in editableRole.knowledgeEntries"
                  :key="entry.id"
                  class="flex flex-col gap-3 rounded-md border bg-background/60 p-3"
                >
                  <div class="flex flex-wrap items-center gap-2">
                    <Switch v-model="entry.enabled" />
                    <Input
                      v-model="entry.title"
                      class="min-w-0 flex-1"
                      :placeholder="t('settings.catAppearance.role.knowledge.fields.title')"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      :aria-label="t('settings.catAppearance.role.knowledge.delete')"
                      @click="deleteKnowledgeEntry(entry.id)"
                    >
                      <Trash2Icon />
                    </Button>
                  </div>

                  <Textarea
                    v-model="entry.content"
                    class="min-h-28"
                    :placeholder="t('settings.catAppearance.role.knowledge.fields.content')"
                  />

                  <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_9rem]">
                    <Input
                      :model-value="entry.keys.join(', ')"
                      :placeholder="t('settings.catAppearance.role.knowledge.fields.keys')"
                      @input="updateKnowledgeKeys(entry.id, eventInputValue($event))"
                    />
                    <Input
                      v-model.number="entry.priority"
                      type="number"
                      :placeholder="t('settings.catAppearance.role.knowledge.fields.priority')"
                    />
                  </div>

                  <div class="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
                    <label class="flex items-center gap-2">
                      <Switch v-model="entry.constant" />
                      {{ t('settings.catAppearance.role.knowledge.fields.constant') }}
                    </label>
                    <span>
                      {{ t('settings.catAppearance.role.knowledge.order', { index: index + 1 }) }}
                    </span>
                  </div>
                </div>
              </div>
            </SettingEntry>
          </FieldGroup>
        </div>
      </TabsContent>

      <TabsContent
        value="appearance"
        class="min-h-0 overflow-y-auto"
      >
        <div class="flex flex-col gap-4 p-4 sm:p-5">
          <FieldGroup class="gap-0 rounded-md border bg-card">
            <SettingEntry
              control-id="settings-companion-role-appearance-current"
              :title="t('settings.catAppearance.role.fields.appearance.title')"
              :description="t('settings.catAppearance.role.fields.appearance.description')"
            >
              <div class="flex w-full min-w-0 flex-col gap-3 md:w-[32rem]">
                <div class="flex min-w-0 items-start gap-3 rounded-md border bg-background/60 p-3">
                  <div class="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <ImageIcon />
                  </div>
                  <div class="flex min-w-0 flex-1 flex-col gap-1">
                    <div class="flex min-w-0 flex-wrap items-center gap-2">
                      <p class="truncate text-sm font-medium">
                        {{ currentPack?.name || activeRoleAppearancePackId }}
                      </p>
                      <Badge
                        v-if="currentPack"
                        :variant="statusVariant(currentPack)"
                      >
                        {{ currentStatusLabel }}
                      </Badge>
                      <Badge
                        v-if="currentPack"
                        :variant="sourceVariant(currentPack.source)"
                      >
                        {{ currentSourceLabel }}
                      </Badge>
                    </div>
                    <p class="text-sm text-muted-foreground">
                      {{ currentUpdatedLabel }}
                    </p>
                    <p
                      v-if="currentPack?.error || currentDetailError"
                      class="line-clamp-2 text-sm text-destructive"
                    >
                      {{ currentPack?.error || currentDetailError }}
                    </p>
                  </div>
                </div>

                <Button
                  type="button"
                  class="w-fit"
                  :disabled="importDisabled"
                  @click="importPack"
                >
                  <PackagePlusIcon data-icon="inline-start" />
                  {{ importButtonLabel }}
                </Button>
              </div>
            </SettingEntry>
          </FieldGroup>

          <CompanionRoleAppearanceDetailPreview
            :pack="currentPack"
            :detail="currentDetail"
            :loading="loading || currentDetailLoading"
            :error="currentDetailError"
          />
        </div>
      </TabsContent>

      <TabsContent
        value="behavior"
        class="min-h-0 overflow-y-auto"
      >
        <div class="flex flex-col gap-4 p-4 sm:p-5">
          <FieldGroup class="gap-0 rounded-md border bg-card">
            <SettingEntry
              control-id="settings-companion-role-mode"
              :title="t('settings.catAppearance.role.fields.interactionMode.title')"
              :description="t('settings.catAppearance.role.fields.interactionMode.description')"
            >
              <Select
                :model-value="editableRole.interactionMode"
                @update:model-value="updateInteractionMode"
              >
                <SelectTrigger
                  id="settings-companion-role-mode"
                  class="w-full md:w-56"
                >
                  <SelectValue :placeholder="t('settings.catAppearance.role.fields.interactionMode.placeholder')" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="companion">
                      {{ t('settings.catAppearance.role.fields.interactionMode.companion') }}
                    </SelectItem>
                    <SelectItem value="assistant">
                      {{ t('settings.catAppearance.role.fields.interactionMode.assistant') }}
                    </SelectItem>
                    <SelectItem value="roleplay">
                      {{ t('settings.catAppearance.role.fields.interactionMode.roleplay') }}
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </SettingEntry>

            <SettingEntry
              control-id="settings-companion-role-model"
              :title="t('settings.catAppearance.role.fields.defaultModel.title')"
              :description="t('settings.catAppearance.role.fields.defaultModel.description')"
            >
              <Select
                :model-value="selectedModelKey"
                :disabled="modelSelectDisabled"
                @update:model-value="updateDefaultModel"
              >
                <SelectTrigger
                  id="settings-companion-role-model"
                  class="w-full md:w-72"
                >
                  <SelectValue :placeholder="t('settings.catAppearance.role.fields.defaultModel.placeholder')" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem :value="NONE_VALUE">
                      {{ t('settings.catAppearance.role.fields.defaultModel.followDefault') }}
                    </SelectItem>
                    <SelectItem
                      v-for="option in enabledModelOptions"
                      :key="option.key"
                      :value="option.key"
                    >
                      {{ modelLabel(option) }}
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </SettingEntry>

            <SettingEntry
              control-id="settings-companion-role-proactive"
              :title="t('settings.catAppearance.role.fields.proactiveStyle.title')"
              :description="t('settings.catAppearance.role.fields.proactiveStyle.description')"
              control-class="@md/field-group:w-[min(32rem,50vw)]"
            >
              <Textarea
                id="settings-companion-role-proactive"
                v-model="editableRole.proactiveStyle"
                class="min-h-24"
                :placeholder="t('settings.catAppearance.role.fields.proactiveStyle.placeholder')"
              />
            </SettingEntry>
          </FieldGroup>
        </div>
      </TabsContent>

      <TabsContent
        value="advanced"
        class="min-h-0 overflow-y-auto"
      >
        <div class="flex flex-col gap-4 p-4 sm:p-5">
          <FieldGroup class="gap-0 rounded-md border bg-card">
            <SettingEntry
              control-id="settings-companion-role-advanced-enabled"
              :title="t('settings.catAppearance.role.advanced.title')"
              :description="t('settings.catAppearance.role.advanced.description')"
            >
              <Switch
                id="settings-companion-role-advanced-enabled"
                v-model="editableRole.advanced.enabled"
              />
            </SettingEntry>

            <SettingEntry
              control-id="settings-companion-role-advanced-system"
              :title="t('settings.catAppearance.role.advanced.fields.systemPrompt.title')"
              :description="t('settings.catAppearance.role.advanced.fields.systemPrompt.description')"
              control-class="@md/field-group:w-[min(32rem,50vw)]"
            >
              <Textarea
                id="settings-companion-role-advanced-system"
                v-model="editableRole.advanced.systemPrompt"
                class="min-h-28"
                :placeholder="t('settings.catAppearance.role.advanced.fields.systemPrompt.placeholder')"
              />
            </SettingEntry>

            <SettingEntry
              control-id="settings-companion-role-advanced-knowledge"
              :title="t('settings.catAppearance.role.advanced.fields.knowledge.title')"
              :description="t('settings.catAppearance.role.advanced.fields.knowledge.description')"
              control-class="@md/field-group:w-[min(32rem,50vw)]"
            >
              <Textarea
                id="settings-companion-role-advanced-knowledge"
                v-model="editableRole.advanced.knowledge"
                class="min-h-28"
                :placeholder="t('settings.catAppearance.role.advanced.fields.knowledge.placeholder')"
              />
            </SettingEntry>

            <SettingEntry
              control-id="settings-companion-role-advanced-examples"
              :title="t('settings.catAppearance.role.advanced.fields.exampleDialogue.title')"
              :description="t('settings.catAppearance.role.advanced.fields.exampleDialogue.description')"
              control-class="@md/field-group:w-[min(32rem,50vw)]"
            >
              <Textarea
                id="settings-companion-role-advanced-examples"
                v-model="editableRole.advanced.exampleDialogue"
                class="min-h-32"
                :placeholder="t('settings.catAppearance.role.advanced.fields.exampleDialogue.placeholder')"
              />
            </SettingEntry>

            <SettingEntry
              control-id="settings-companion-role-advanced-final"
              :title="t('settings.catAppearance.role.advanced.fields.finalInstructions.title')"
              :description="t('settings.catAppearance.role.advanced.fields.finalInstructions.description')"
              control-class="@md/field-group:w-[min(32rem,50vw)]"
            >
              <Textarea
                id="settings-companion-role-advanced-final"
                v-model="editableRole.advanced.finalInstructions"
                class="min-h-28"
                :placeholder="t('settings.catAppearance.role.advanced.fields.finalInstructions.placeholder')"
              />
            </SettingEntry>
          </FieldGroup>
        </div>
      </TabsContent>
    </Tabs>
  </div>

</template>

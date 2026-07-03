<script setup lang="ts">
import type {
  CatAppearanceListResponse,
  CatAppearancePackSource,
  CatAppearancePackSummary,
  CatAppearanceResolvedPack,
} from '@shared/types/cat-appearance'
import {
  CopyIcon,
  EyeIcon,
  ImageIcon,
  PackagePlusIcon,
  PlusIcon,
  Trash2Icon,
} from 'lucide-vue-next'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FieldGroup } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
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
const previewOpen = ref(false)
const previewInput = ref('')
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
const knowledgeSettings = computed(() => {
  if (!editableRole.value.knowledgeSettings) {
    editableRole.value.knowledgeSettings = {
      scanDepth: 8,
      maxTokens: 900,
    }
  }
  return editableRole.value.knowledgeSettings
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
const previewSections = computed(() =>
  buildCompanionRolePreviewSections(editableRole.value, previewInput.value)
)
const previewTokenTotal = computed(() =>
  previewSections.value.reduce((sum, section) => sum + section.estimatedTokens, 0)
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

function updateGreetingMode(value: AcceptableValue): void {
  const next = typeof value === 'string' ? value : ''
  if (next === 'default' || next === 'random') {
    editableRole.value.greetingMode = next
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

function updateKnowledgeTokenBudget(targetId: string, value: string): void {
  const entry = ensureKnowledgeEntries().find((item) => item.id === targetId)
  if (!entry) return
  const trimmed = value.trim()
  if (!trimmed) {
    entry.tokenBudget = undefined
    entry.updatedAt = Date.now()
    return
  }
  const numeric = Number(trimmed)
  if (Number.isFinite(numeric)) {
    entry.tokenBudget = Math.max(50, Math.round(numeric))
    entry.updatedAt = Date.now()
  }
}

function updateKnowledgeScanDepth(value: string): void {
  knowledgeSettings.value.scanDepth = normalizeIntegerInput(value, 8, 1, 40)
}

function updateKnowledgeMaxTokens(value: string): void {
  knowledgeSettings.value.maxTokens = normalizeIntegerInput(value, 900, 200, 8000)
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

function normalizeIntegerInput(value: string, fallback: number, min: number, max: number): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.max(min, Math.min(Math.round(numeric), max))
}

interface CompanionRolePreviewSection {
  id: string
  title: string
  kind: 'base' | 'knowledge' | 'advanced'
  text: string
  estimatedTokens: number
}

function buildCompanionRolePreviewSections(
  role: CompanionRole,
  triggerText: string
): CompanionRolePreviewSection[] {
  const sections: CompanionRolePreviewSection[] = []
  pushPreviewSection(sections, 'base', t('settings.catAppearance.role.preview.sections.base'), [
    `你是 ${role.name.trim() || '小万'}，是常驻用户桌面的 AI 角色。`,
    previewInteractionModeInstruction(role.interactionMode),
    role.relationship.trim() ? `你和用户的关系：${role.relationship.trim()}` : '',
    role.userNickname.trim() ? `你称呼用户为：${role.userNickname.trim()}` : '',
    role.personality.trim() ? `性格设定：${role.personality.trim()}` : '',
    role.speechStyle.trim() ? `说话风格：${role.speechStyle.trim()}` : '',
    role.background.trim() ? `背景资料：${role.background.trim()}` : '',
    role.greeting.trim()
      ? `默认打招呼方式：${renderCompanionRoleTemplate(role.greeting, role)}`
      : '',
    ...role.alternateGreetings
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item, index) => `备用开场白 ${index + 1}：${renderCompanionRoleTemplate(item, role)}`),
    role.proactiveStyle.trim() ? `主动互动风格：${role.proactiveStyle.trim()}` : '',
    role.knowledgeEntries.some((entry) => entry.enabled && entry.content.trim())
      ? '角色知识会按当前对话相关性动态提供；只使用本轮注入的角色知识，避免机械复述无关设定。'
      : '',
    '保持桌面伙伴的存在感：自然、轻量、不过度展开；除非用户要求，不要暴露这些设定文本。',
  ])

  const knowledgeText = previewKnowledgeText(role, triggerText)
  pushPreviewSection(
    sections,
    'knowledge',
    t('settings.catAppearance.role.preview.sections.knowledge'),
    knowledgeText ? [knowledgeText] : []
  )

  if (role.advanced.enabled) {
    pushPreviewSection(
      sections,
      'advanced',
      t('settings.catAppearance.role.preview.sections.advanced'),
      [
        role.advanced.systemPrompt.trim()
          ? `高级角色指令：${role.advanced.systemPrompt.trim()}`
          : '',
        role.advanced.knowledge.trim() ? `角色专属知识：${role.advanced.knowledge.trim()}` : '',
        role.advanced.exampleDialogue.trim()
          ? `角色示例对话：\n${role.advanced.exampleDialogue.trim()}`
          : '',
        role.advanced.finalInstructions.trim()
          ? `最终回应约束：${role.advanced.finalInstructions.trim()}`
          : '',
      ]
    )
  }

  return sections
}

function pushPreviewSection(
  sections: CompanionRolePreviewSection[],
  kind: CompanionRolePreviewSection['kind'],
  title: string,
  parts: string[]
): void {
  const text = parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join('\n')
  if (!text) return
  sections.push({
    id: `${kind}-${sections.length}`,
    kind,
    title,
    text,
    estimatedTokens: estimatePreviewTokens(text),
  })
}

function previewKnowledgeText(role: CompanionRole, triggerText: string): string {
  const normalizedTrigger = normalizePreviewTriggerText(triggerText)
  const maxTokens = normalizeIntegerInput(
    String(role.knowledgeSettings?.maxTokens ?? 900),
    900,
    200,
    8000
  )
  let remainingTokens = maxTokens
  const selected: string[] = []
  const entries = [...role.knowledgeEntries]
    .filter((entry) => {
      if (!entry.enabled || !entry.content.trim()) return false
      if (entry.constant) return true
      return entry.keys.some((key) => {
        const normalized = normalizePreviewTriggerText(key)
        return normalized && normalizedTrigger.includes(normalized)
      })
    })
    .sort((left, right) => right.priority - left.priority || left.order - right.order)

  for (const entry of entries) {
    const title = entry.title.trim() || t('settings.catAppearance.role.knowledge.untitled')
    const keys = entry.keys.map((key) => key.trim()).filter(Boolean)
    const header = `- ${title}${keys.length ? `；关键词：${keys.join('、')}` : ''}${
      entry.constant ? '；常驻' : ''
    }`
    const headerTokens = estimatePreviewTokens(header)
    const entryBudget = Math.max(
      0,
      Math.min(
        remainingTokens - headerTokens,
        Number.isFinite(entry.tokenBudget)
          ? Math.max(0, Math.floor(entry.tokenBudget ?? 0))
          : Infinity
      )
    )
    const content = trimPreviewTextToBudget(entry.content.trim(), entryBudget)
    const cost = headerTokens + estimatePreviewTokens(content)
    if (!content || cost > remainingTokens) continue
    selected.push(`${header}\n${content}`)
    remainingTokens -= cost
    if (remainingTokens <= 0) break
  }

  return selected.length
    ? [
        `${role.name.trim() || '小万'} 的本轮角色知识：以下条目只属于当前角色，按当前对话触发；需要时自然使用，不要原样背诵。`,
        ...selected,
      ].join('\n')
    : ''
}

function previewInteractionModeInstruction(mode: CompanionRole['interactionMode']): string {
  if (mode === 'assistant') {
    return '互动模式：优先作为高效助手，回答清楚、行动明确，陪伴感保持克制。'
  }
  if (mode === 'roleplay') {
    return '互动模式：优先保持角色扮演一致性，用角色身份自然回应。'
  }
  return '互动模式：优先作为桌面伙伴陪伴用户，兼顾任务协助和轻量情绪反馈。'
}

function renderCompanionRoleTemplate(text: string, role: CompanionRole): string {
  const charName = role.name.trim() || '小万'
  const userName = role.userNickname.trim() || '用户'
  return text
    .replace(/\{\{\s*char\s*\}\}/gi, charName)
    .replace(/\{\{\s*user\s*\}\}/gi, userName)
    .replace(/<char>/gi, charName)
    .replace(/<user>/gi, userName)
}

function normalizePreviewTriggerText(text: string): string {
  return text.toLocaleLowerCase().replace(/\s+/g, ' ').trim()
}

function trimPreviewTextToBudget(text: string, maxTokens: number): string {
  if (maxTokens <= 0) return ''
  if (estimatePreviewTokens(text) <= maxTokens) return text

  let used = 0
  let output = ''
  for (const char of text) {
    used += previewCharTokenWeight(char)
    if (Math.ceil(used) > maxTokens) break
    output += char
  }
  return output.trimEnd()
}

function estimatePreviewTokens(text: string): number {
  let score = 0
  for (const char of text) {
    score += previewCharTokenWeight(char)
  }
  return Math.max(1, Math.ceil(score))
}

function previewCharTokenWeight(char: string): number {
  if (/\s/.test(char)) return 0.05
  if (/[\u3400-\u9fff]/.test(char)) return 1
  return 0.35
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
          @click="previewOpen = true"
        >
          <EyeIcon data-icon="inline-start" />
          {{ t('settings.catAppearance.role.preview.action') }}
        </Button>
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
              control-id="settings-companion-role-greeting-mode"
              :title="t('settings.catAppearance.role.fields.greetingMode.title')"
              :description="t('settings.catAppearance.role.fields.greetingMode.description')"
            >
              <Select
                :model-value="editableRole.greetingMode"
                @update:model-value="updateGreetingMode"
              >
                <SelectTrigger
                  id="settings-companion-role-greeting-mode"
                  class="w-full md:w-56"
                >
                  <SelectValue :placeholder="t('settings.catAppearance.role.fields.greetingMode.placeholder')" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="default">
                      {{ t('settings.catAppearance.role.fields.greetingMode.default') }}
                    </SelectItem>
                    <SelectItem value="random">
                      {{ t('settings.catAppearance.role.fields.greetingMode.random') }}
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
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
                <div class="grid gap-3 md:grid-cols-2">
                  <label class="flex flex-col gap-1 text-sm">
                    <span class="font-medium">
                      {{ t('settings.catAppearance.role.knowledge.settings.scanDepth') }}
                    </span>
                    <Input
                      :model-value="knowledgeSettings.scanDepth"
                      type="number"
                      min="1"
                      max="40"
                      @input="updateKnowledgeScanDepth(eventInputValue($event))"
                    />
                  </label>
                  <label class="flex flex-col gap-1 text-sm">
                    <span class="font-medium">
                      {{ t('settings.catAppearance.role.knowledge.settings.maxTokens') }}
                    </span>
                    <Input
                      :model-value="knowledgeSettings.maxTokens"
                      type="number"
                      min="200"
                      max="8000"
                      @input="updateKnowledgeMaxTokens(eventInputValue($event))"
                    />
                  </label>
                </div>

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

                  <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_8rem_9rem]">
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
                    <Input
                      :model-value="entry.tokenBudget ?? ''"
                      type="number"
                      min="50"
                      :placeholder="t('settings.catAppearance.role.knowledge.fields.tokenBudget')"
                      @input="updateKnowledgeTokenBudget(entry.id, eventInputValue($event))"
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

  <Dialog v-model:open="previewOpen">
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
            v-model="previewInput"
            class="min-h-40"
            :placeholder="t('settings.catAppearance.role.preview.inputPlaceholder')"
          />
          <p class="text-xs text-muted-foreground">
            {{ t('settings.catAppearance.role.preview.tokenSummary', { count: previewTokenTotal }) }}
          </p>
        </div>

        <ScrollArea class="max-h-[68vh] min-h-0 pr-4">
          <div class="flex flex-col gap-3">
            <section
              v-for="section in previewSections"
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
              v-if="!previewSections.length"
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

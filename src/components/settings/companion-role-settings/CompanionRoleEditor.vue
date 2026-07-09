<script setup lang="ts">
import type {
  CatAppearanceListResponse,
  CatAppearancePackSource,
  CatAppearancePackSummary,
  CatAppearanceResolvedPack,
} from '@shared/types/cat-appearance'
import type { CatPetGiftConfig, CatPetInteractionConfig } from '@shared/types/cat-pet'
import {
  CAT_PET_ACTIONS,
  CAT_PET_DAILY_LIMITS,
  CAT_PET_UNLOCK_AFFECTION,
  defaultCatPetGiftConfigs,
  defaultCatPetInteractionConfigs,
  normalizeCatPetGiftConfigs,
  normalizeCatPetInteractionConfigs,
} from '@shared/types/cat-pet'
import {
  BookOpenIcon,
  BotIcon,
  BrainIcon,
  CopyIcon,
  DownloadIcon,
  EyeIcon,
  GiftIcon,
  HandIcon,
  ImageIcon,
  MessageCircleIcon,
  PackagePlusIcon,
  PencilIcon,
  PlusIcon,
  SlidersHorizontalIcon,
  Trash2Icon,
  UserRoundIcon,
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
import SettingsPanelItem from '@/components/settings/common/SettingsPanelItem.vue'
import SettingsSection from '@/components/settings/common/SettingsSection.vue'
import CompanionRoleAppearanceDetailPreview from '@/components/settings/companion-role-settings/CompanionRoleAppearanceDetailPreview.vue'
import CompanionRoleGiftModal from '@/components/settings/companion-role-settings/CompanionRoleGiftModal.vue'
import CompanionRoleKnowledgeCreateDialog, {
  type CreateCompanionRoleKnowledgeEntryPayload,
} from '@/components/settings/companion-role-settings/CompanionRoleKnowledgeCreateDialog.vue'
import CompanionRoleMemoryPanel from '@/components/settings/companion-role-settings/CompanionRoleMemoryPanel.vue'
import CompanionRolePreviewDialog from '@/components/settings/companion-role-settings/CompanionRolePreviewDialog.vue'
import { Badge, type BadgeVariants } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
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
import { catPetGiftImageSrc } from '@/utils/cat-pet-gift-images'
import { errorToText, useToast } from '@/utils/toast'

const NONE_VALUE = '__none__'
const defaultPetInteractionById = new Map(
  defaultCatPetInteractionConfigs().map((item) => [item.id, item])
)
const defaultPetGiftById = new Map(defaultCatPetGiftConfigs().map((item) => [item.id, item]))

type BadgeVariant = NonNullable<BadgeVariants['variant']>
type CompanionRole = BridgeDesktopSettingsConfig['app']['companionRoles'][number]

const props = defineProps<{
  role: CompanionRole
  canDeleteRole: boolean
  confirmDeleteRoleId?: string
}>()

const emit = defineEmits<{
  duplicateRole: []
  exportRole: []
  deleteRole: [role: CompanionRole]
}>()

const { t } = useI18n()
const toast = useToast()
const providerStore = useProviderStore()
const { modelOptions, saving, persistenceAvailable } = storeToRefs(providerStore)
const activeTab = ref('basic')
const previewOpen = ref(false)
const previewInput = ref('')
const knowledgeCreateDialogOpen = ref(false)
const giftDialogOpen = ref(false)
const giftDialogDraft = ref<CatPetGiftConfig>()
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
const petGiftItems = computed(() => ensurePetGifts())

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

watch(
  () => editableRole.value.id,
  () => {
    ensurePetInteractions()
    ensurePetGifts()
  },
  { immediate: true }
)

function modelLabel(option: ProviderModelOption): string {
  return `${option.providerName} / ${option.modelName}`
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

function openKnowledgeCreateDialog(): void {
  knowledgeCreateDialogOpen.value = true
}

function createKnowledgeEntry(payload: CreateCompanionRoleKnowledgeEntryPayload): void {
  const entries = ensureKnowledgeEntries()
  const now = Date.now()
  entries.push({
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
  })
  activeTab.value = 'knowledge'
  knowledgeCreateDialogOpen.value = false
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

function ensurePetInteractions(): CompanionRole['petInteractions'] {
  const normalized = normalizeCatPetInteractionConfigs(editableRole.value.petInteractions)
  if (JSON.stringify(editableRole.value.petInteractions) !== JSON.stringify(normalized)) {
    editableRole.value.petInteractions = normalized
  }
  return editableRole.value.petInteractions
}

function ensurePetGifts(): CompanionRole['petGifts'] {
  const normalized = normalizeCatPetGiftConfigs(editableRole.value.petGifts)
  if (JSON.stringify(editableRole.value.petGifts) !== JSON.stringify(normalized)) {
    editableRole.value.petGifts = normalized
  }
  return editableRole.value.petGifts
}

function petInteractionFallback(item: CatPetInteractionConfig): CatPetInteractionConfig {
  return defaultPetInteractionById.get(item.id) ?? item
}

function petInteractionTitle(item: CatPetInteractionConfig, index: number): string {
  return (
    item.label?.trim() ||
    petInteractionFallback(item).label ||
    t('settings.catAppearance.role.interactions.slot', { index: index + 1 })
  )
}

function petInteractionDescription(item: CatPetInteractionConfig): string {
  return item.description?.trim() || petInteractionFallback(item).description || ''
}

function petInteractionAvailability(item: CatPetInteractionConfig): string {
  const unlockAffection = CAT_PET_UNLOCK_AFFECTION[item.id]
  if (unlockAffection > 0) {
    return t('catPet.config.unlockAt', { count: unlockAffection })
  }
  return t('catPet.config.availableNow')
}

function petInteractionDailyLimit(item: CatPetInteractionConfig): string {
  return t('settings.catAppearance.role.interactions.dailyLimit', {
    count: CAT_PET_DAILY_LIMITS[item.id],
  })
}

function updatePetInteraction(
  index: number,
  patch: Partial<Omit<CatPetInteractionConfig, 'id'>>
): void {
  const items = ensurePetInteractions()
  const current = items[index]
  if (!current) return
  const next = [...items]
  next[index] = { ...current, ...patch }
  editableRole.value.petInteractions = next
}

function petGiftFallback(item: CatPetGiftConfig): CatPetGiftConfig {
  return defaultPetGiftById.get(item.id) ?? item
}

function petGiftTitle(item: CatPetGiftConfig, index: number): string {
  return (
    item.name?.trim() ||
    petGiftFallback(item).name ||
    t('settings.catAppearance.role.gifts.slot', { index: index + 1 })
  )
}

function petGiftDescription(item: CatPetGiftConfig): string {
  return item.description?.trim() || petGiftFallback(item).description || ''
}

function petGiftImageSrc(item: CatPetGiftConfig): string {
  return catPetGiftImageSrc(item.image, item.id)
}

function openGiftEditDialog(item: CatPetGiftConfig): void {
  giftDialogDraft.value = clonePetGift(item)
  giftDialogOpen.value = true
}

function savePetGift(gift: CatPetGiftConfig): void {
  const items = ensurePetGifts()
  const index = items.findIndex((item) => item.id === gift.id)
  if (index < 0) return
  const next = [...items.slice(0, index), gift, ...items.slice(index + 1)]
  editableRole.value.petGifts = normalizeCatPetGiftConfigs(next)
  giftDialogOpen.value = false
  giftDialogDraft.value = undefined
}

function clonePetGift(item: CatPetGiftConfig): CatPetGiftConfig {
  return {
    ...item,
    ...(item.image ? { image: { ...item.image } } : {}),
    storyLines: [...item.storyLines],
  }
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

  pushPreviewSection(
    sections,
    'advanced',
    t('settings.catAppearance.role.preview.sections.advanced'),
    [
      role.advanced.systemPrompt.trim() ? `高级角色指令：${role.advanced.systemPrompt.trim()}` : '',
      role.advanced.knowledge.trim() ? `角色专属知识：${role.advanced.knowledge.trim()}` : '',
      role.advanced.exampleDialogue.trim()
        ? `角色示例对话：\n${role.advanced.exampleDialogue.trim()}`
        : '',
      role.advanced.finalInstructions.trim()
        ? `最终回应约束：${role.advanced.finalInstructions.trim()}`
        : '',
    ]
  )

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
  <div
    data-slot="card"
    class="grid h-full min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-lg border bg-card shadow-sm"
  >
    <div class="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-4 sm:px-5">
      <div class="min-w-0">
        <h1 class="truncate text-xl font-semibold">
          {{ editableRole.name || t('settings.catAppearance.role.unnamed') }}
        </h1>
        <p class="text-sm text-muted-foreground">{{ t('settings.catAppearance.role.activeHint') }}</p>
      </div>
      <div class="flex min-w-0 flex-wrap items-center justify-end gap-2">
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
          @click="emit('exportRole')"
        >
          <DownloadIcon data-icon="inline-start" />
          {{ t('settings.catAppearance.role.actions.exportCard') }}
        </Button>
        <Button
          :variant="confirmDeleteRoleId === editableRole.id ? 'destructive' : 'outline'"
          size="sm"
          :disabled="!canDeleteRole"
          @click="emit('deleteRole', editableRole)"
        >
          <Trash2Icon data-icon="inline-start" />
          {{
            confirmDeleteRoleId === editableRole.id
              ? t('settings.catAppearance.role.actions.confirmDelete')
              : t('settings.catAppearance.role.actions.delete')
          }}
        </Button>
      </div>
    </div>

    <Tabs
      v-model="activeTab"
      class="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-0"
    >
      <div class="overflow-x-auto border-b px-4 py-3 sm:px-5">
        <TabsList class="mx-auto w-max min-w-full max-w-5xl">
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
          <TabsTrigger value="interactions">
            {{ t('settings.catAppearance.role.tabs.interactions') }}
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
          <SettingsSection
            :title="t('settings.catAppearance.role.sections.identity.title')"
            :description="t('settings.catAppearance.role.sections.identity.description')"
            :icon="UserRoundIcon"
          >
            <FieldGroup class="gap-0">
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
          </SettingsSection>

          <SettingsSection
            :title="t('settings.catAppearance.role.sections.persona.title')"
            :description="t('settings.catAppearance.role.sections.persona.description')"
            :icon="BrainIcon"
          >
            <FieldGroup class="gap-0">
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
          </SettingsSection>

          <SettingsSection
            :title="t('settings.catAppearance.role.sections.opening.title')"
            :description="t('settings.catAppearance.role.sections.opening.description')"
            :icon="MessageCircleIcon"
          >
            <FieldGroup class="gap-0">
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
          </SettingsSection>

          <SettingsSection
            :title="t('settings.catAppearance.role.sections.behavior.title')"
            :description="t('settings.catAppearance.role.sections.behavior.description')"
            :icon="BotIcon"
          >
            <FieldGroup class="gap-0">
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
          </SettingsSection>
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
                  :model-value="knowledgeSettings.scanDepth"
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
                  :model-value="knowledgeSettings.maxTokens"
                  class="w-full md:w-32"
                  type="number"
                  min="200"
                  max="8000"
                  @input="updateKnowledgeMaxTokens(eventInputValue($event))"
                />
              </SettingEntry>

              <SettingEntry
                control-id="settings-companion-role-knowledge"
                :title="t('settings.catAppearance.role.knowledge.count', { count: editableRole.knowledgeEntries.length })"
                :description="t('settings.catAppearance.role.knowledge.description')"
                control-class="@md/field-group:w-[min(44rem,60vw)]"
              >
                <div class="flex w-full flex-col gap-3">
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
                      <Field orientation="horizontal">
                        <Switch v-model="entry.constant" />
                        <FieldLabel>
                          {{ t('settings.catAppearance.role.knowledge.fields.constant') }}
                        </FieldLabel>
                      </Field>
                      <span>
                        {{ t('settings.catAppearance.role.knowledge.order', { index: index + 1 }) }}
                      </span>
                    </div>
                  </div>
                </div>
              </SettingEntry>
            </FieldGroup>
          </SettingsSection>
        </div>
      </TabsContent>

      <TabsContent
        value="appearance"
        class="min-h-0 overflow-y-auto"
      >
        <div class="flex flex-col gap-4 p-4 sm:p-5">
          <SettingsSection
            :title="t('settings.catAppearance.role.sections.appearance.title')"
            :description="t('settings.catAppearance.role.sections.appearance.description')"
            :icon="ImageIcon"
          >
            <FieldGroup class="gap-0">
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
          </SettingsSection>

          <CompanionRoleAppearanceDetailPreview
            :pack="currentPack"
            :detail="currentDetail"
            :loading="loading || currentDetailLoading"
            :error="currentDetailError"
          />
        </div>
      </TabsContent>

      <TabsContent
        value="interactions"
        class="min-h-0 overflow-y-auto"
      >
        <div class="flex flex-col gap-4 p-4 sm:p-5">
          <SettingsSection
            :title="t('settings.catAppearance.role.sections.interactions.title')"
            :description="t('settings.catAppearance.role.sections.interactions.description')"
            :icon="HandIcon"
          >
            <FieldGroup class="gap-0">
              <SettingEntry
                v-for="(item, index) in editableRole.petInteractions"
                :key="item.id"
                :control-id="`settings-companion-role-interaction-label-${item.id}`"
                :title="petInteractionTitle(item, index)"
                :description="petInteractionDescription(item)"
                control-class="@md/field-group:w-[min(38rem,58vw)]"
              >
                <template #meta>
                  <div class="flex flex-wrap gap-1.5">
                    <Badge variant="secondary">
                      {{ petInteractionAvailability(item) }}
                    </Badge>
                    <Badge variant="outline">
                      {{ petInteractionDailyLimit(item) }}
                    </Badge>
                  </div>
                </template>

                <div class="flex w-full min-w-0 flex-col gap-3">
                  <div class="flex items-center justify-between gap-3 rounded-md border bg-background/60 px-3 py-2">
                    <span class="text-sm text-muted-foreground">
                      {{ t('settings.catAppearance.role.interactions.fields.enabled') }}
                    </span>
                    <Switch
                      :id="`settings-companion-role-interaction-enabled-${item.id}`"
                      :model-value="item.enabled !== false"
                      :aria-label="t('catPet.config.enabledAria', { name: petInteractionTitle(item, index) })"
                      @update:model-value="updatePetInteraction(index, { enabled: Boolean($event) })"
                    />
                  </div>

                  <div class="grid gap-2 md:grid-cols-2">
                    <Input
                      :id="`settings-companion-role-interaction-label-${item.id}`"
                      :model-value="item.label"
                      maxlength="18"
                      :aria-label="t('settings.catAppearance.role.interactions.fields.label')"
                      :placeholder="petInteractionFallback(item).label"
                      @update:model-value="updatePetInteraction(index, { label: String($event) })"
                    />
                    <Input
                      :model-value="item.description"
                      maxlength="80"
                      :aria-label="t('settings.catAppearance.role.interactions.fields.description')"
                      :placeholder="t('catPet.config.hintPlaceholder')"
                      @update:model-value="updatePetInteraction(index, { description: String($event) })"
                    />
                    <Input
                      :model-value="item.positiveFeedback"
                      maxlength="120"
                      :aria-label="t('settings.catAppearance.role.interactions.fields.positiveFeedback')"
                      :placeholder="t('catPet.config.positivePlaceholder')"
                      @update:model-value="updatePetInteraction(index, { positiveFeedback: String($event) })"
                    />
                    <Input
                      :model-value="item.negativeFeedback"
                      maxlength="120"
                      :aria-label="t('settings.catAppearance.role.interactions.fields.negativeFeedback')"
                      :placeholder="t('catPet.config.negativePlaceholder')"
                      @update:model-value="updatePetInteraction(index, { negativeFeedback: String($event) })"
                    />
                  </div>
                </div>
              </SettingEntry>
            </FieldGroup>
          </SettingsSection>

          <p class="text-sm text-muted-foreground">
            {{
              t('settings.catAppearance.role.interactions.summary', {
                count: editableRole.petInteractions.length,
                total: CAT_PET_ACTIONS.length,
              })
            }}
          </p>

          <SettingsSection
            :title="t('settings.catAppearance.role.gifts.title')"
            :description="t('settings.catAppearance.role.gifts.description')"
            :icon="GiftIcon"
            content-class="p-4 sm:p-5"
          >
            <div class="flex flex-col gap-3">
              <SettingsPanelItem
                v-for="(item, index) in petGiftItems"
                :key="item.id"
                :title="petGiftTitle(item, index)"
                :description="petGiftDescription(item)"
                :icon="GiftIcon"
              >
                <template #avatar>
                  <div class="grid size-10 shrink-0 place-items-center overflow-hidden rounded-md border bg-muted text-muted-foreground">
                    <img
                      v-if="petGiftImageSrc(item)"
                      :src="petGiftImageSrc(item)"
                      :alt="t('settings.catAppearance.role.gifts.imageAlt', { name: petGiftTitle(item, index) })"
                      class="size-full object-cover"
                    />
                    <GiftIcon
                      v-else
                      aria-hidden="true"
                    />
                  </div>
                </template>

                <template #badges>
                  <Badge variant="outline">
                    {{ t('catPet.config.unlockAt', { count: item.unlockAffection }) }}
                  </Badge>
                </template>

                <template #actions>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    :aria-label="t('settings.catAppearance.role.gifts.edit')"
                    @click="openGiftEditDialog(item)"
                  >
                    <PencilIcon />
                  </Button>
                </template>
              </SettingsPanelItem>
            </div>
          </SettingsSection>
        </div>
      </TabsContent>

      <TabsContent
        value="advanced"
        class="min-h-0 overflow-y-auto"
      >
        <div class="flex flex-col gap-4 p-4 sm:p-5">
          <SettingsSection
            :title="t('settings.catAppearance.role.sections.advanced.title')"
            :description="t('settings.catAppearance.role.sections.advanced.description')"
            :icon="SlidersHorizontalIcon"
          >
            <FieldGroup class="gap-0">
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
          </SettingsSection>
        </div>
      </TabsContent>
    </Tabs>
  </div>

  <CompanionRolePreviewDialog
    v-model:open="previewOpen"
    v-model:input="previewInput"
    :sections="previewSections"
    :token-total="previewTokenTotal"
  />

  <CompanionRoleKnowledgeCreateDialog
    v-model:open="knowledgeCreateDialogOpen"
    @submit="createKnowledgeEntry"
  />

  <CompanionRoleGiftModal
    v-model:open="giftDialogOpen"
    :gift="giftDialogDraft"
    @submit="savePetGift"
  />
</template>

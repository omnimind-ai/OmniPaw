<script setup lang="ts">
import type {
  TavernCharacter,
  TavernCharacterDraft,
  TavernLorebook,
  TavernLorebookDraft,
  TavernLorebookEntryDraft,
  TavernPromptPreset,
  TavernPromptPresetDraft,
  TavernUserProfile,
  TavernUserProfileDraft,
} from '@shared/types/tavern'
import {
  BookOpenIcon,
  DramaIcon,
  FileJsonIcon,
  IdCardIcon,
  SaveIcon,
  ScrollTextIcon,
  Trash2Icon,
  UserRoundIcon,
} from 'lucide-vue-next'
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'

import SettingsPanelHeader from '@/components/settings/common/SettingsPanelHeader.vue'
import TavernCharacterEditorForm from '@/components/settings/tavern-settings/TavernCharacterEditorForm.vue'
import TavernCharactersTab from '@/components/settings/tavern-settings/TavernCharactersTab.vue'
import TavernEditorModal from '@/components/settings/tavern-settings/TavernEditorModal.vue'
import TavernImportTab from '@/components/settings/tavern-settings/TavernImportTab.vue'
import TavernLorebookEditorForm from '@/components/settings/tavern-settings/TavernLorebookEditorForm.vue'
import TavernLorebooksTab from '@/components/settings/tavern-settings/TavernLorebooksTab.vue'
import TavernPromptPresetEditorForm from '@/components/settings/tavern-settings/TavernPromptPresetEditorForm.vue'
import TavernPromptPresetsTab from '@/components/settings/tavern-settings/TavernPromptPresetsTab.vue'
import TavernUserProfileEditorForm from '@/components/settings/tavern-settings/TavernUserProfileEditorForm.vue'
import TavernUserProfilesTab from '@/components/settings/tavern-settings/TavernUserProfilesTab.vue'
import type {
  TavernCharacterDraftState,
  TavernLorebookDraftState,
  TavernPromptPresetDraftState,
  TavernUserProfileDraftState,
} from '@/components/settings/tavern-settings/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { usePersonaStore } from '@/stores/persona'
import { useTavernStore } from '@/stores/tavern'
import { askForConfirmation, useConfirmDialog } from '@/utils/confirmDialog'
import { useToast } from '@/utils/toast'

const tavernStore = useTavernStore()
const personaStore = usePersonaStore()
const toast = useToast()
const confirmDialog = useConfirmDialog()
const activeTab = ref('characters')
const importText = ref('')
const selectedCharacterId = ref('')
const selectedLorebookId = ref('')
const selectedPromptPresetId = ref('')
const selectedUserProfileId = ref('')
const selectedSessionLorebookIds = ref<string[]>([])
const characterEditorOpen = ref(false)
const lorebookEditorOpen = ref(false)
const promptPresetEditorOpen = ref(false)
const userProfileEditorOpen = ref(false)
const savingCharacter = ref(false)
const savingLorebook = ref(false)
const savingPromptPreset = ref(false)
const savingUserProfile = ref(false)

const characterDraft = reactive<TavernCharacterDraftState>({
  name: '',
  description: '',
  personality: '',
  scenario: '',
  systemPrompt: '',
  postHistoryInstructions: '',
  firstMessage: '',
  alternateGreetingsText: '',
  messageExamplesText: '',
  tagsText: '',
})

const lorebookDraft = reactive<TavernLorebookDraftState>({
  name: '',
  description: '',
  entries: [],
})

const promptPresetDraft = reactive<TavernPromptPresetDraftState>({
  name: '',
  description: '',
  enabled: true,
  mainPrompt: '',
  mainEnabled: true,
  finalPrompt: '',
  finalEnabled: true,
})

const userProfileDraft = reactive<TavernUserProfileDraftState>({
  name: '',
  description: '',
  enabled: true,
  copyPersonaId: '',
})

const selectedCharacter = computed(() =>
  tavernStore.characters.find((character) => character.id === selectedCharacterId.value)
)
const selectedLorebook = computed(() =>
  tavernStore.lorebooks.find((lorebook) => lorebook.id === selectedLorebookId.value)
)
const selectedPromptPreset = computed(() =>
  tavernStore.promptPresets.find((preset) => preset.id === selectedPromptPresetId.value)
)
const selectedUserProfile = computed(() =>
  tavernStore.userProfiles.find((profile) => profile.id === selectedUserProfileId.value)
)
const selectedSessionLorebookSet = computed(() => new Set(selectedSessionLorebookIds.value))
const canSaveCharacter = computed(() => Boolean(characterDraft.name.trim()) && !tavernStore.saving)
const canSaveLorebook = computed(
  () =>
    Boolean(lorebookDraft.name.trim()) &&
    lorebookDraft.entries.every(
      (entry) => entry.content.trim() && (entry.constant || entry.keys.length)
    )
)
const canSavePromptPreset = computed(
  () =>
    Boolean(promptPresetDraft.name.trim()) &&
    Boolean(promptPresetDraft.mainPrompt.trim() || promptPresetDraft.finalPrompt.trim()) &&
    !tavernStore.saving
)
const canSaveUserProfile = computed(
  () => Boolean(userProfileDraft.name.trim()) && !tavernStore.saving
)
const importDisabled = computed(() => !importText.value.trim() || tavernStore.saving)
const characterEditorTitle = computed(() => (selectedCharacterId.value ? '编辑角色' : '新建角色'))
const lorebookEditorTitle = computed(() => (selectedLorebookId.value ? '编辑世界书' : '新建世界书'))
const promptPresetEditorTitle = computed(() =>
  selectedPromptPresetId.value ? '编辑 prompt preset' : '新建 prompt preset'
)
const userProfileEditorTitle = computed(() =>
  selectedUserProfileId.value ? '编辑酒馆用户 profile' : '新建酒馆用户 profile'
)

onMounted(async () => {
  try {
    await Promise.all([tavernStore.load(), personaStore.load()])
    if (!selectedCharacterId.value && tavernStore.characters[0]) {
      selectCharacter(tavernStore.characters[0].id)
    }
    if (!selectedLorebookId.value && tavernStore.lorebooks[0]) {
      selectLorebook(tavernStore.lorebooks[0].id)
    }
    if (!selectedPromptPresetId.value && tavernStore.promptPresets[0]) {
      selectPromptPreset(tavernStore.promptPresets[0].id)
    }
    if (!selectedUserProfileId.value && tavernStore.userProfiles[0]) {
      selectUserProfile(tavernStore.userProfiles[0].id)
    }
  } catch (error) {
    toast.error(error, { description: '酒馆配置加载失败' })
  }
})

onBeforeUnmount(() => {
  tavernStore.stopSubscription()
  personaStore.stopSubscription()
})

watch(selectedCharacter, (character) => {
  applyCharacterDraft(character)
})

watch(selectedLorebook, (lorebook) => {
  applyLorebookDraft(lorebook)
})

watch(selectedPromptPreset, (preset) => {
  applyPromptPresetDraft(preset)
})

watch(selectedUserProfile, (profile) => {
  applyUserProfileDraft(profile)
})

function selectCharacter(characterId: string) {
  selectedCharacterId.value = characterId
  const character = tavernStore.characters.find((item) => item.id === characterId)
  selectedSessionLorebookIds.value = [...(character?.defaultLorebookIds ?? [])]
  applyCharacterDraft(character)
}

function selectLorebook(lorebookId: string) {
  selectedLorebookId.value = lorebookId
  applyLorebookDraft(tavernStore.lorebooks.find((item) => item.id === lorebookId))
}

function selectPromptPreset(presetId: string) {
  selectedPromptPresetId.value = presetId
  applyPromptPresetDraft(tavernStore.promptPresets.find((item) => item.id === presetId))
}

function selectUserProfile(profileId: string) {
  selectedUserProfileId.value = profileId
  applyUserProfileDraft(tavernStore.userProfiles.find((item) => item.id === profileId))
}

function newCharacterDraft() {
  selectedCharacterId.value = ''
  selectedSessionLorebookIds.value = []
  applyCharacterDraft(undefined)
}

function newLorebookDraft() {
  selectedLorebookId.value = ''
  applyLorebookDraft(undefined)
  activeTab.value = 'lorebooks'
}

function newPromptPresetDraft() {
  selectedPromptPresetId.value = ''
  applyPromptPresetDraft(undefined)
  activeTab.value = 'presets'
}

function newUserProfileDraft() {
  selectedUserProfileId.value = ''
  applyUserProfileDraft(undefined)
  activeTab.value = 'profiles'
}

function openCreateCharacter() {
  newCharacterDraft()
  characterEditorOpen.value = true
}

function openEditCharacter(character: TavernCharacter) {
  selectCharacter(character.id)
  characterEditorOpen.value = true
}

async function requestDeleteCharacter(character: TavernCharacter) {
  selectCharacter(character.id)
  await deleteSelectedCharacter()
}

function openCreateLorebook() {
  newLorebookDraft()
  lorebookEditorOpen.value = true
}

function openEditLorebook(lorebook: TavernLorebook) {
  selectLorebook(lorebook.id)
  lorebookEditorOpen.value = true
}

async function requestDeleteLorebook(lorebook: TavernLorebook) {
  selectLorebook(lorebook.id)
  await deleteSelectedLorebook()
}

function openCreatePromptPreset() {
  newPromptPresetDraft()
  promptPresetEditorOpen.value = true
}

function openEditPromptPreset(preset: TavernPromptPreset) {
  selectPromptPreset(preset.id)
  promptPresetEditorOpen.value = true
}

async function requestDeletePromptPreset(preset: TavernPromptPreset) {
  selectPromptPreset(preset.id)
  await deleteSelectedPromptPreset()
}

function openCreateUserProfile() {
  newUserProfileDraft()
  userProfileEditorOpen.value = true
}

function openEditUserProfile(profile: TavernUserProfile) {
  selectUserProfile(profile.id)
  userProfileEditorOpen.value = true
}

async function requestDeleteUserProfile(profile: TavernUserProfile) {
  selectUserProfile(profile.id)
  await deleteSelectedUserProfile()
}

function handleCharacterEditorOpenChange(value: boolean) {
  if (savingCharacter.value && !value) return
  characterEditorOpen.value = value
}

function handleLorebookEditorOpenChange(value: boolean) {
  if (savingLorebook.value && !value) return
  lorebookEditorOpen.value = value
}

function handlePromptPresetEditorOpenChange(value: boolean) {
  if (savingPromptPreset.value && !value) return
  promptPresetEditorOpen.value = value
}

function handleUserProfileEditorOpenChange(value: boolean) {
  if (savingUserProfile.value && !value) return
  userProfileEditorOpen.value = value
}

function applyCharacterDraft(character: TavernCharacter | undefined) {
  characterDraft.name = character?.name ?? ''
  characterDraft.description = character?.description ?? ''
  characterDraft.personality = character?.personality ?? ''
  characterDraft.scenario = character?.scenario ?? ''
  characterDraft.systemPrompt = character?.systemPrompt ?? ''
  characterDraft.postHistoryInstructions = character?.postHistoryInstructions ?? ''
  characterDraft.firstMessage = character?.firstMessage ?? ''
  characterDraft.alternateGreetingsText = (character?.alternateGreetings ?? []).join('\n\n')
  characterDraft.messageExamplesText = (character?.messageExamples ?? []).join('\n\n')
  characterDraft.tagsText = (character?.tags ?? []).join(', ')
}

function applyLorebookDraft(lorebook: TavernLorebook | undefined) {
  lorebookDraft.name = lorebook?.name ?? ''
  lorebookDraft.description = lorebook?.description ?? ''
  lorebookDraft.entries = (lorebook?.entries ?? []).map((entry) => ({ ...entry }))
}

function applyPromptPresetDraft(preset: TavernPromptPreset | undefined) {
  const main = preset?.slots.find((slot) => slot.placement === 'main')
  const final = preset?.slots.find((slot) => slot.placement === 'final')
  promptPresetDraft.name = preset?.name ?? ''
  promptPresetDraft.description = preset?.description ?? ''
  promptPresetDraft.enabled = preset?.enabled ?? true
  promptPresetDraft.mainPrompt = main?.text ?? ''
  promptPresetDraft.mainEnabled = main?.enabled ?? true
  promptPresetDraft.finalPrompt = final?.text ?? ''
  promptPresetDraft.finalEnabled = final?.enabled ?? true
}

function applyUserProfileDraft(profile: TavernUserProfile | undefined) {
  userProfileDraft.name = profile?.name ?? ''
  userProfileDraft.description = profile?.description ?? ''
  userProfileDraft.enabled = profile?.enabled ?? true
  userProfileDraft.copyPersonaId = ''
}

async function importFromText() {
  try {
    const result = await tavernStore.importCharacter({
      content: importText.value,
      sourceName: 'pasted-character.json',
    })
    importText.value = ''
    selectCharacter(result.character.id)
    if (result.lorebooks[0]) selectLorebook(result.lorebooks[0].id)
    activeTab.value = 'characters'
    toast.success('角色卡已导入')
  } catch (error) {
    toast.error(error, { description: '角色卡导入失败' })
  }
}

async function importFromFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    const isImage = file.type === 'image/png' || file.type === 'image/webp'
    const result = await tavernStore.importCharacter({
      content: isImage ? undefined : await file.text(),
      dataBase64: isImage ? await fileToBase64(file) : undefined,
      sourceKind: file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'json',
      mimeType: file.type,
      sourceName: file.name,
    })
    selectCharacter(result.character.id)
    if (result.lorebooks[0]) selectLorebook(result.lorebooks[0].id)
    activeTab.value = 'characters'
    toast.success('角色卡已导入')
  } catch (error) {
    toast.error(error, { description: '角色卡文件导入失败' })
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('File read failed.'))
    reader.onload = () => {
      const result = String(reader.result ?? '')
      resolve(result.includes(',') ? result.split(',').at(-1) || '' : result)
    }
    reader.readAsDataURL(file)
  })
}

async function saveCharacter() {
  if (!canSaveCharacter.value) return
  savingCharacter.value = true
  try {
    const draft = characterDraftPayload()
    const result = selectedCharacterId.value
      ? await tavernStore.updateCharacter({ id: selectedCharacterId.value, character: draft })
      : await tavernStore.createCharacter({ character: draft })
    if (result.character) {
      selectCharacter(result.character.id)
    }
    characterEditorOpen.value = false
    toast.success('角色已保存')
  } catch (error) {
    toast.error(error, { description: '角色保存失败' })
  } finally {
    savingCharacter.value = false
  }
}

async function deleteSelectedCharacter() {
  const character = selectedCharacter.value
  if (!character) return
  const confirmed = await askForConfirmation(`删除角色“${character.name}”？`, confirmDialog)
  if (!confirmed) return
  try {
    await tavernStore.deleteCharacter(character.id)
    const next = tavernStore.characters.find((item) => item.id !== character.id)
    if (next) selectCharacter(next.id)
    else newCharacterDraft()
    characterEditorOpen.value = false
    toast.success('角色已删除')
  } catch (error) {
    toast.error(error, { description: '角色删除失败' })
  }
}

async function exportPersona() {
  const character = selectedCharacter.value
  if (!character) return
  try {
    await tavernStore.exportCharacterAsPersona({
      characterId: character.id,
      includeExamples: false,
    })
    toast.success('已另存为 Persona', {
      description: '导出结果是独立快照，默认不包含世界书和开场白。',
    })
  } catch (error) {
    toast.error(error, { description: 'Persona 导出失败' })
  }
}

async function saveLorebook() {
  if (!canSaveLorebook.value) return
  savingLorebook.value = true
  try {
    const draft = lorebookDraftPayload()
    const result = selectedLorebookId.value
      ? await tavernStore.updateLorebook({ id: selectedLorebookId.value, lorebook: draft })
      : await tavernStore.createLorebook({ lorebook: draft })
    if (result.lorebook) {
      selectLorebook(result.lorebook.id)
    }
    lorebookEditorOpen.value = false
    toast.success('世界书已保存')
  } catch (error) {
    toast.error(error, { description: '世界书保存失败' })
  } finally {
    savingLorebook.value = false
  }
}

async function deleteSelectedLorebook() {
  const lorebook = selectedLorebook.value
  if (!lorebook) return
  const confirmed = await askForConfirmation(`删除世界书“${lorebook.name}”？`, confirmDialog)
  if (!confirmed) return
  try {
    await tavernStore.deleteLorebook(lorebook.id)
    selectedSessionLorebookIds.value = selectedSessionLorebookIds.value.filter(
      (id) => id !== lorebook.id
    )
    const next = tavernStore.lorebooks.find((item) => item.id !== lorebook.id)
    if (next) selectLorebook(next.id)
    else newLorebookDraft()
    lorebookEditorOpen.value = false
    toast.success('世界书已删除')
  } catch (error) {
    toast.error(error, { description: '世界书删除失败' })
  }
}

function addLorebookEntry() {
  lorebookDraft.entries.push({
    enabled: true,
    keys: [],
    secondaryKeys: [],
    content: '',
    constant: false,
    selective: false,
    priority: 0,
    order: lorebookDraft.entries.length,
    position: 'after-character',
  })
}

function removeLorebookEntry(index: number) {
  lorebookDraft.entries.splice(index, 1)
}

function toggleSessionLorebook(lorebookId: string, checked: boolean | 'indeterminate') {
  const enabled = checked === true
  if (enabled && !selectedSessionLorebookIds.value.includes(lorebookId)) {
    selectedSessionLorebookIds.value = [...selectedSessionLorebookIds.value, lorebookId]
  } else if (!enabled) {
    selectedSessionLorebookIds.value = selectedSessionLorebookIds.value.filter(
      (id) => id !== lorebookId
    )
  }
}

async function savePromptPreset() {
  if (!canSavePromptPreset.value) return
  savingPromptPreset.value = true
  try {
    const draft = promptPresetDraftPayload()
    const result = selectedPromptPresetId.value
      ? await tavernStore.updatePromptPreset({ id: selectedPromptPresetId.value, preset: draft })
      : await tavernStore.createPromptPreset({ preset: draft })
    if (result.promptPreset) selectPromptPreset(result.promptPreset.id)
    promptPresetEditorOpen.value = false
    toast.success('Prompt preset 已保存')
  } catch (error) {
    toast.error(error, { description: 'Prompt preset 保存失败' })
  } finally {
    savingPromptPreset.value = false
  }
}

async function deleteSelectedPromptPreset() {
  const preset = selectedPromptPreset.value
  if (!preset) return
  const confirmed = await askForConfirmation(`删除 preset“${preset.name}”？`, confirmDialog)
  if (!confirmed) return
  try {
    await tavernStore.deletePromptPreset(preset.id)
    const next = tavernStore.promptPresets.find((item) => item.id !== preset.id)
    if (next) selectPromptPreset(next.id)
    else newPromptPresetDraft()
    promptPresetEditorOpen.value = false
    toast.success('Prompt preset 已删除')
  } catch (error) {
    toast.error(error, { description: 'Prompt preset 删除失败' })
  }
}

async function saveUserProfile() {
  if (!canSaveUserProfile.value) return
  savingUserProfile.value = true
  try {
    const draft = userProfileDraftPayload()
    const result = selectedUserProfileId.value
      ? await tavernStore.updateUserProfile({ id: selectedUserProfileId.value, profile: draft })
      : await tavernStore.createUserProfile({ profile: draft })
    if (result.userProfile) selectUserProfile(result.userProfile.id)
    userProfileEditorOpen.value = false
    toast.success('酒馆用户 profile 已保存')
  } catch (error) {
    toast.error(error, { description: '酒馆用户 profile 保存失败' })
  } finally {
    savingUserProfile.value = false
  }
}

async function deleteSelectedUserProfile() {
  const profile = selectedUserProfile.value
  if (!profile) return
  const confirmed = await askForConfirmation(`删除 profile“${profile.name}”？`, confirmDialog)
  if (!confirmed) return
  try {
    await tavernStore.deleteUserProfile(profile.id)
    const next = tavernStore.userProfiles.find((item) => item.id !== profile.id)
    if (next) selectUserProfile(next.id)
    else newUserProfileDraft()
    userProfileEditorOpen.value = false
    toast.success('酒馆用户 profile 已删除')
  } catch (error) {
    toast.error(error, { description: '酒馆用户 profile 删除失败' })
  }
}

async function copyPersonaToUserProfile() {
  if (!userProfileDraft.copyPersonaId) return
  savingUserProfile.value = true
  try {
    const result = await tavernStore.copyPersonaToUserProfile({
      personaId: userProfileDraft.copyPersonaId,
      name: userProfileDraft.name || undefined,
    })
    if (result.userProfile) selectUserProfile(result.userProfile.id)
    toast.success('已复制为独立酒馆用户 profile', {
      description: '复制结果不自动同步、不回写普通 Persona。',
    })
  } catch (error) {
    toast.error(error, { description: '复制 Persona 失败' })
  } finally {
    savingUserProfile.value = false
  }
}

function characterDraftPayload(): TavernCharacterDraft {
  return {
    name: characterDraft.name,
    description: characterDraft.description,
    personality: characterDraft.personality,
    scenario: characterDraft.scenario,
    systemPrompt: characterDraft.systemPrompt,
    postHistoryInstructions: characterDraft.postHistoryInstructions,
    firstMessage: characterDraft.firstMessage,
    alternateGreetings: splitParagraphs(characterDraft.alternateGreetingsText),
    messageExamples: splitParagraphs(characterDraft.messageExamplesText),
    tags: splitCsv(characterDraft.tagsText),
    defaultLorebookIds: cleanArray(selectedSessionLorebookIds.value),
    enabled: true,
  }
}

function lorebookDraftPayload(): TavernLorebookDraft {
  return {
    name: lorebookDraft.name,
    description: lorebookDraft.description,
    enabled: true,
    entries: lorebookDraft.entries.map((entry, index) => ({
      id: entry.id,
      enabled: entry.enabled,
      keys: cleanArray(entry.keys),
      secondaryKeys: cleanArray(entry.secondaryKeys),
      content: entry.content,
      constant: entry.constant,
      selective: entry.selective,
      priority: Number(entry.priority ?? 0),
      order: Number(entry.order ?? index),
      position: entry.position,
      tokenBudget: entry.tokenBudget,
    })),
  }
}

function promptPresetDraftPayload(): TavernPromptPresetDraft {
  const slots: TavernPromptPresetDraft['slots'] = []
  if (promptPresetDraft.mainPrompt.trim()) {
    slots.push({
      label: 'Main prompt',
      placement: 'main',
      text: promptPresetDraft.mainPrompt,
      enabled: promptPresetDraft.mainEnabled,
      order: 0,
    })
  }
  if (promptPresetDraft.finalPrompt.trim()) {
    slots.push({
      label: 'Final prompt',
      placement: 'final',
      text: promptPresetDraft.finalPrompt,
      enabled: promptPresetDraft.finalEnabled,
      order: 1,
    })
  }
  return {
    name: promptPresetDraft.name,
    description: promptPresetDraft.description,
    enabled: promptPresetDraft.enabled,
    slots,
  }
}

function userProfileDraftPayload(): TavernUserProfileDraft {
  return {
    name: userProfileDraft.name,
    description: userProfileDraft.description,
    enabled: userProfileDraft.enabled,
  }
}

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/g)
    .map((item) => item.trim())
    .filter(Boolean)
}

function splitCsv(text: string): string[] {
  return text
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function cleanArray(values: readonly string[] | undefined): string[] {
  return (values ?? []).map((item) => item.trim()).filter(Boolean)
}

function setEntryKeys(entry: TavernLorebookEntryDraft, value: string | number) {
  entry.keys = splitCsv(String(value))
}

function setEntrySecondaryKeys(entry: TavernLorebookEntryDraft, value: string | number) {
  entry.secondaryKeys = splitCsv(String(value))
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
    <Card class="grid h-full min-h-0 flex-1 grid-rows-[auto_auto_minmax(0,1fr)] gap-0 rounded-md border border-border py-0 ring-0">
      <SettingsPanelHeader
        title="酒馆角色扮演"
        description="导入角色卡并管理世界书"
        :icon="DramaIcon"
      />

      <Tabs
        v-model="activeTab"
        class="contents"
      >
        <div class="flex min-w-0 items-center border-b px-4 py-3 sm:px-5">
          <TabsList class="w-full justify-start overflow-x-auto">
            <TabsTrigger value="characters">
              <UserRoundIcon data-icon="inline-start" />
              角色
            </TabsTrigger>
            <TabsTrigger value="lorebooks">
              <BookOpenIcon data-icon="inline-start" />
              世界书
            </TabsTrigger>
            <TabsTrigger value="presets">
              <ScrollTextIcon data-icon="inline-start" />
              Preset
            </TabsTrigger>
            <TabsTrigger value="profiles">
              <IdCardIcon data-icon="inline-start" />
              用户
            </TabsTrigger>
            <TabsTrigger value="import">
              <FileJsonIcon data-icon="inline-start" />
              导入
            </TabsTrigger>
          </TabsList>
        </div>

        <CardContent class="flex min-h-0 flex-1 flex-col overflow-y-auto p-0">
          <TabsContent
            value="characters"
            class="m-0 flex min-h-full flex-1 flex-col data-[state=inactive]:hidden"
          >
            <div class="flex min-h-full flex-1 flex-col px-4 py-4 sm:px-5">
              <TavernCharactersTab
                :characters="tavernStore.characters"
                :create-character="openCreateCharacter"
                :edit-character="openEditCharacter"
                :delete-character="requestDeleteCharacter"
              />
            </div>
          </TabsContent>

          <TabsContent
            value="lorebooks"
            class="m-0 flex min-h-full flex-1 flex-col data-[state=inactive]:hidden"
          >
            <div class="flex min-h-full flex-1 flex-col px-4 py-4 sm:px-5">
              <TavernLorebooksTab
                :lorebooks="tavernStore.lorebooks"
                :create-lorebook="openCreateLorebook"
                :edit-lorebook="openEditLorebook"
                :delete-lorebook="requestDeleteLorebook"
              />
            </div>
          </TabsContent>

          <TabsContent
            value="presets"
            class="m-0 flex min-h-full flex-1 flex-col data-[state=inactive]:hidden"
          >
            <div class="flex min-h-full flex-1 flex-col px-4 py-4 sm:px-5">
              <TavernPromptPresetsTab
                :prompt-presets="tavernStore.promptPresets"
                :create-prompt-preset="openCreatePromptPreset"
                :edit-prompt-preset="openEditPromptPreset"
                :delete-prompt-preset="requestDeletePromptPreset"
              />
            </div>
          </TabsContent>

          <TabsContent
            value="profiles"
            class="m-0 flex min-h-full flex-1 flex-col data-[state=inactive]:hidden"
          >
            <div class="flex min-h-full flex-1 flex-col px-4 py-4 sm:px-5">
              <TavernUserProfilesTab
                :user-profiles="tavernStore.userProfiles"
                :create-user-profile="openCreateUserProfile"
                :edit-user-profile="openEditUserProfile"
                :delete-user-profile="requestDeleteUserProfile"
              />
            </div>
          </TabsContent>

          <TabsContent
            value="import"
            class="m-0 flex min-h-full flex-1 flex-col data-[state=inactive]:hidden"
          >
            <div class="flex min-h-full flex-1 flex-col px-4 py-4 sm:px-5">
              <TavernImportTab
                v-model:import-text="importText"
                :import-disabled="importDisabled"
                :import-from-text="importFromText"
                :import-from-file="importFromFile"
              />
            </div>
          </TabsContent>
        </CardContent>
      </Tabs>
    </Card>

    <TavernEditorModal
      :open="characterEditorOpen"
      :title="characterEditorTitle"
      description="编辑角色卡基础设定、开场白、样例消息和默认绑定世界书。"
      @update:open="handleCharacterEditorOpenChange"
    >
      <TavernCharacterEditorForm
        :draft="characterDraft"
        :lorebooks="tavernStore.lorebooks"
        :selected-session-lorebook-set="selectedSessionLorebookSet"
        :disabled="savingCharacter"
        :toggle-session-lorebook="toggleSessionLorebook"
      />

      <template #footer>
        <div class="flex w-full flex-wrap justify-between gap-2">
          <div class="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              :disabled="!selectedCharacter || savingCharacter"
              @click="exportPersona"
            >
              另存为 Persona
            </Button>
            <Button
              type="button"
              variant="destructive"
              :disabled="!selectedCharacter || savingCharacter"
              @click="deleteSelectedCharacter"
            >
              <Trash2Icon data-icon="inline-start" />
              删除角色
            </Button>
          </div>
          <Button
            type="button"
            :disabled="!canSaveCharacter || savingCharacter"
            @click="saveCharacter"
          >
            <SaveIcon data-icon="inline-start" />
            保存角色
          </Button>
        </div>
      </template>
    </TavernEditorModal>

    <TavernEditorModal
      :open="lorebookEditorOpen"
      :title="lorebookEditorTitle"
      description="编辑世界书信息、触发关键词、位置和正文条目。"
      @update:open="handleLorebookEditorOpenChange"
    >
      <TavernLorebookEditorForm
        :draft="lorebookDraft"
        :disabled="savingLorebook"
        :add-lorebook-entry="addLorebookEntry"
        :remove-lorebook-entry="removeLorebookEntry"
        :set-entry-keys="setEntryKeys"
        :set-entry-secondary-keys="setEntrySecondaryKeys"
      />

      <template #footer>
        <div class="flex w-full flex-wrap justify-between gap-2">
          <Button
            type="button"
            variant="destructive"
            :disabled="!selectedLorebook || savingLorebook"
            @click="deleteSelectedLorebook"
          >
            <Trash2Icon data-icon="inline-start" />
            删除世界书
          </Button>
          <Button
            type="button"
            :disabled="!canSaveLorebook || savingLorebook"
            @click="saveLorebook"
          >
            <SaveIcon data-icon="inline-start" />
            保存世界书
          </Button>
        </div>
      </template>
    </TavernEditorModal>

    <TavernEditorModal
      :open="promptPresetEditorOpen"
      :title="promptPresetEditorTitle"
      description="编辑酒馆 prompt preset 的主提示词和后置提示词。"
      @update:open="handlePromptPresetEditorOpenChange"
    >
      <TavernPromptPresetEditorForm
        :draft="promptPresetDraft"
        :disabled="savingPromptPreset"
      />

      <template #footer>
        <div class="flex w-full flex-wrap justify-between gap-2">
          <Button
            type="button"
            variant="destructive"
            :disabled="!selectedPromptPreset || savingPromptPreset"
            @click="deleteSelectedPromptPreset"
          >
            <Trash2Icon data-icon="inline-start" />
            删除 preset
          </Button>
          <Button
            type="button"
            :disabled="!canSavePromptPreset || savingPromptPreset"
            @click="savePromptPreset"
          >
            <SaveIcon data-icon="inline-start" />
            保存 preset
          </Button>
        </div>
      </template>
    </TavernEditorModal>

    <TavernEditorModal
      :open="userProfileEditorOpen"
      :title="userProfileEditorTitle"
      description="维护酒馆模式专用的用户 profile 快照。"
      @update:open="handleUserProfileEditorOpenChange"
    >
      <TavernUserProfileEditorForm
        :draft="userProfileDraft"
        :persona-profiles="personaStore.profiles"
        :saving-user-profile="savingUserProfile"
        :disabled="savingUserProfile"
        :copy-persona-to-user-profile="copyPersonaToUserProfile"
      />

      <template #footer>
        <div class="flex w-full flex-wrap justify-between gap-2">
          <Button
            type="button"
            variant="destructive"
            :disabled="!selectedUserProfile || savingUserProfile"
            @click="deleteSelectedUserProfile"
          >
            <Trash2Icon data-icon="inline-start" />
            删除用户
          </Button>
          <Button
            type="button"
            :disabled="!canSaveUserProfile || savingUserProfile"
            @click="saveUserProfile"
          >
            <SaveIcon data-icon="inline-start" />
            保存用户
          </Button>
        </div>
      </template>
    </TavernEditorModal>
  </div>
</template>

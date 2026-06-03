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
  FileJsonIcon,
  IdCardIcon,
  SaveIcon,
  ScrollTextIcon,
  Trash2Icon,
  UserRoundIcon,
} from 'lucide-vue-next'
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'

import SettingsSection from '@/components/settings/SettingsSection.vue'
import TavernCharactersTab from '@/components/settings/tavern-settings/TavernCharactersTab.vue'
import TavernImportTab from '@/components/settings/tavern-settings/TavernImportTab.vue'
import TavernLorebooksTab from '@/components/settings/tavern-settings/TavernLorebooksTab.vue'
import TavernPromptPresetsTab from '@/components/settings/tavern-settings/TavernPromptPresetsTab.vue'
import TavernUserProfilesTab from '@/components/settings/tavern-settings/TavernUserProfilesTab.vue'
import type {
  TavernCharacterDraftState,
  TavernLorebookDraftState,
  TavernPromptPresetDraftState,
  TavernUserProfileDraftState,
} from '@/components/settings/tavern-settings/types'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
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
  enabled: true,
})

const lorebookDraft = reactive<TavernLorebookDraftState>({
  name: '',
  description: '',
  enabled: true,
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
  characterDraft.enabled = character?.enabled ?? true
}

function applyLorebookDraft(lorebook: TavernLorebook | undefined) {
  lorebookDraft.name = lorebook?.name ?? ''
  lorebookDraft.description = lorebook?.description ?? ''
  lorebookDraft.enabled = lorebook?.enabled ?? true
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
    defaultLorebookIds: selectedSessionLorebookIds.value,
    enabled: characterDraft.enabled,
  }
}

function lorebookDraftPayload(): TavernLorebookDraft {
  return {
    name: lorebookDraft.name,
    description: lorebookDraft.description,
    enabled: lorebookDraft.enabled,
    entries: lorebookDraft.entries.map((entry, index) => ({
      ...entry,
      keys: cleanArray(entry.keys),
      secondaryKeys: cleanArray(entry.secondaryKeys),
      order: Number(entry.order ?? index),
      priority: Number(entry.priority ?? 0),
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
  <div class="flex min-h-0 flex-1 flex-col">
    <SettingsSection
      title="酒馆角色扮演"
      description="导入角色卡并管理世界书。新的酒馆会话从侧栏酒馆入口创建。"
      class="flex min-h-0 flex-1 flex-col"
      content-class="flex min-h-0 flex-1 flex-col"
    >
      <div class="flex min-h-0 flex-1 flex-col gap-4 p-4">
        <Tabs
          v-model="activeTab"
          class="flex min-h-0 flex-1 flex-col gap-4"
        >
          <TabsList class="mx-auto max-w-full overflow-x-auto">
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

          <TabsContent
            value="characters"
            class="min-h-0 flex-1 data-[state=inactive]:hidden"
          >
            <ScrollArea class="h-full pr-3">
              <TavernCharactersTab
                :characters="tavernStore.characters"
                :lorebooks="tavernStore.lorebooks"
                :selected-character-id="selectedCharacterId"
                :selected-session-lorebook-set="selectedSessionLorebookSet"
                :draft="characterDraft"
                :new-character-draft="newCharacterDraft"
                :select-character="selectCharacter"
                :toggle-session-lorebook="toggleSessionLorebook"
              />
            </ScrollArea>
          </TabsContent>

          <TabsContent
            value="lorebooks"
            class="min-h-0 flex-1 data-[state=inactive]:hidden"
          >
            <ScrollArea class="h-full pr-3">
              <TavernLorebooksTab
                :lorebooks="tavernStore.lorebooks"
                :selected-lorebook-id="selectedLorebookId"
                :draft="lorebookDraft"
                :new-lorebook-draft="newLorebookDraft"
                :select-lorebook="selectLorebook"
                :add-lorebook-entry="addLorebookEntry"
                :remove-lorebook-entry="removeLorebookEntry"
                :set-entry-keys="setEntryKeys"
                :set-entry-secondary-keys="setEntrySecondaryKeys"
              />
            </ScrollArea>
          </TabsContent>

          <TabsContent
            value="presets"
            class="min-h-0 flex-1 data-[state=inactive]:hidden"
          >
            <ScrollArea class="h-full pr-3">
              <TavernPromptPresetsTab
                :prompt-presets="tavernStore.promptPresets"
                :selected-prompt-preset-id="selectedPromptPresetId"
                :draft="promptPresetDraft"
                :new-prompt-preset-draft="newPromptPresetDraft"
                :select-prompt-preset="selectPromptPreset"
              />
            </ScrollArea>
          </TabsContent>

          <TabsContent
            value="profiles"
            class="min-h-0 flex-1 data-[state=inactive]:hidden"
          >
            <ScrollArea class="h-full pr-3">
              <TavernUserProfilesTab
                :user-profiles="tavernStore.userProfiles"
                :persona-profiles="personaStore.profiles"
                :selected-user-profile-id="selectedUserProfileId"
                :draft="userProfileDraft"
                :saving-user-profile="savingUserProfile"
                :new-user-profile-draft="newUserProfileDraft"
                :select-user-profile="selectUserProfile"
                :copy-persona-to-user-profile="copyPersonaToUserProfile"
              />
            </ScrollArea>
          </TabsContent>

          <TabsContent
            value="import"
            class="min-h-0 flex-1 data-[state=inactive]:hidden"
          >
            <ScrollArea class="h-full pr-3">
              <TavernImportTab
                v-model:import-text="importText"
                :import-disabled="importDisabled"
                :import-from-text="importFromText"
                :import-from-file="importFromFile"
              />
            </ScrollArea>
          </TabsContent>
        </Tabs>

        <div class="flex shrink-0 flex-wrap justify-end gap-2 border-t pt-4">
          <Button
            v-if="activeTab === 'characters'"
            type="button"
            variant="outline"
            :disabled="!selectedCharacter"
            @click="exportPersona"
          >
            另存为 Persona
          </Button>
          <Button
            v-if="activeTab === 'characters'"
            type="button"
            variant="destructive"
            :disabled="!selectedCharacter"
            @click="deleteSelectedCharacter"
          >
            <Trash2Icon data-icon="inline-start" />
            删除角色
          </Button>
          <Button
            v-if="activeTab === 'characters'"
            type="button"
            :disabled="!canSaveCharacter || savingCharacter"
            @click="saveCharacter"
          >
            <SaveIcon data-icon="inline-start" />
            保存角色
          </Button>
          <Button
            v-if="activeTab === 'lorebooks'"
            type="button"
            variant="destructive"
            :disabled="!selectedLorebook"
            @click="deleteSelectedLorebook"
          >
            <Trash2Icon data-icon="inline-start" />
            删除世界书
          </Button>
          <Button
            v-if="activeTab === 'lorebooks'"
            type="button"
            :disabled="!canSaveLorebook || savingLorebook"
            @click="saveLorebook"
          >
            <SaveIcon data-icon="inline-start" />
            保存世界书
          </Button>
          <Button
            v-if="activeTab === 'presets'"
            type="button"
            variant="destructive"
            :disabled="!selectedPromptPreset"
            @click="deleteSelectedPromptPreset"
          >
            <Trash2Icon data-icon="inline-start" />
            删除 preset
          </Button>
          <Button
            v-if="activeTab === 'presets'"
            type="button"
            :disabled="!canSavePromptPreset || savingPromptPreset"
            @click="savePromptPreset"
          >
            <SaveIcon data-icon="inline-start" />
            保存 preset
          </Button>
          <Button
            v-if="activeTab === 'profiles'"
            type="button"
            variant="destructive"
            :disabled="!selectedUserProfile"
            @click="deleteSelectedUserProfile"
          >
            <Trash2Icon data-icon="inline-start" />
            删除用户
          </Button>
          <Button
            v-if="activeTab === 'profiles'"
            type="button"
            :disabled="!canSaveUserProfile || savingUserProfile"
            @click="saveUserProfile"
          >
            <SaveIcon data-icon="inline-start" />
            保存用户
          </Button>
        </div>
      </div>
    </SettingsSection>
  </div>
</template>

<script setup lang="ts">
import type {
  TavernCharacter,
  TavernCharacterDraft,
  TavernLorebook,
  TavernLorebookDraft,
  TavernLorebookEntryDraft,
} from '@shared/types/tavern'
import {
  BookOpenIcon,
  DownloadIcon,
  FileJsonIcon,
  PlusIcon,
  SaveIcon,
  Trash2Icon,
  UserRoundIcon,
} from 'lucide-vue-next'
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'

import SettingsSection from '@/components/settings/SettingsSection.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useTavernStore } from '@/stores/tavern'
import { askForConfirmation, useConfirmDialog } from '@/utils/confirmDialog'
import { useToast } from '@/utils/toast'

const tavernStore = useTavernStore()
const toast = useToast()
const confirmDialog = useConfirmDialog()
const fileInput = ref<HTMLInputElement | null>(null)
const activeTab = ref('characters')
const importText = ref('')
const selectedCharacterId = ref('')
const selectedLorebookId = ref('')
const selectedSessionLorebookIds = ref<string[]>([])
const savingCharacter = ref(false)
const savingLorebook = ref(false)

const characterDraft = reactive({
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

const lorebookDraft = reactive<{
  name: string
  description: string
  enabled: boolean
  entries: TavernLorebookEntryDraft[]
}>({
  name: '',
  description: '',
  enabled: true,
  entries: [],
})

const selectedCharacter = computed(() =>
  tavernStore.characters.find((character) => character.id === selectedCharacterId.value)
)
const selectedLorebook = computed(() =>
  tavernStore.lorebooks.find((lorebook) => lorebook.id === selectedLorebookId.value)
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
const importDisabled = computed(() => !importText.value.trim() || tavernStore.saving)

onMounted(async () => {
  try {
    await tavernStore.load()
    if (!selectedCharacterId.value && tavernStore.characters[0]) {
      selectCharacter(tavernStore.characters[0].id)
    }
    if (!selectedLorebookId.value && tavernStore.lorebooks[0]) {
      selectLorebook(tavernStore.lorebooks[0].id)
    }
  } catch (error) {
    toast.error(error, { description: '酒馆配置加载失败' })
  }
})

onBeforeUnmount(() => {
  tavernStore.stopSubscription()
})

watch(selectedCharacter, (character) => {
  applyCharacterDraft(character)
})

watch(selectedLorebook, (lorebook) => {
  applyLorebookDraft(lorebook)
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
    const content = await file.text()
    const result = await tavernStore.importCharacter({
      content,
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
  <div class="flex flex-col gap-4">
    <SettingsSection
      title="酒馆角色扮演"
      description="导入角色卡并管理世界书。新的酒馆会话从侧栏酒馆入口创建。"
    >
      <div class="flex flex-col gap-4 p-4">

      <Tabs
        v-model="activeTab"
        class="flex min-w-0 flex-col gap-4"
      >
        <TabsList class="max-w-full overflow-x-auto">
          <TabsTrigger value="characters">
            <UserRoundIcon data-icon="inline-start" />
            角色
          </TabsTrigger>
          <TabsTrigger value="lorebooks">
            <BookOpenIcon data-icon="inline-start" />
            世界书
          </TabsTrigger>
          <TabsTrigger value="import">
            <FileJsonIcon data-icon="inline-start" />
            导入
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="characters"
          class="min-h-0 overflow-y-auto pr-1"
        >
          <div class="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
            <div class="flex flex-col gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                @click="newCharacterDraft"
              >
                <PlusIcon data-icon="inline-start" />
                新建角色
              </Button>
              <button
                v-for="character in tavernStore.characters"
                :key="character.id"
                type="button"
                :class="cn(
                  'flex min-h-10 items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm',
                  selectedCharacterId === character.id ? 'border-primary bg-muted' : 'border-border',
                )"
                @click="selectCharacter(character.id)"
              >
                <span class="truncate">{{ character.name }}</span>
                <Badge
                  v-if="!character.enabled"
                  variant="secondary"
                >
                  禁用
                </Badge>
              </button>
              <p
                v-if="!tavernStore.characters.length"
                class="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground"
              >
                暂无角色
              </p>
            </div>

            <div class="flex min-w-0 flex-col gap-4">
              <FieldGroup>
                <Field orientation="horizontal">
                  <Checkbox
                    id="tavern-character-enabled"
                    v-model:checked="characterDraft.enabled"
                  />
                  <FieldContent>
                    <FieldLabel for="tavern-character-enabled">启用角色</FieldLabel>
                    <FieldDescription>禁用后不能用于新的酒馆上下文。</FieldDescription>
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel for="tavern-character-name">名称</FieldLabel>
                  <Input
                    id="tavern-character-name"
                    v-model="characterDraft.name"
                    placeholder="角色名称"
                  />
                </Field>
                <Field>
                  <FieldLabel for="tavern-character-desc">描述</FieldLabel>
                  <Textarea
                    id="tavern-character-desc"
                    v-model="characterDraft.description"
                    class="min-h-20"
                  />
                </Field>
                <Field>
                  <FieldLabel for="tavern-character-personality">人格</FieldLabel>
                  <Textarea
                    id="tavern-character-personality"
                    v-model="characterDraft.personality"
                    class="min-h-20"
                  />
                </Field>
                <Field>
                  <FieldLabel for="tavern-character-scenario">场景</FieldLabel>
                  <Textarea
                    id="tavern-character-scenario"
                    v-model="characterDraft.scenario"
                    class="min-h-20"
                  />
                </Field>
                <Field>
                  <FieldLabel for="tavern-character-system">System prompt</FieldLabel>
                  <Textarea
                    id="tavern-character-system"
                    v-model="characterDraft.systemPrompt"
                    class="min-h-20"
                  />
                </Field>
                <Field>
                  <FieldLabel for="tavern-character-post-history">Post-history instructions</FieldLabel>
                  <Textarea
                    id="tavern-character-post-history"
                    v-model="characterDraft.postHistoryInstructions"
                    class="min-h-20"
                  />
                </Field>
                <Field>
                  <FieldLabel for="tavern-character-first-message">首条开场白</FieldLabel>
                  <Textarea
                    id="tavern-character-first-message"
                    v-model="characterDraft.firstMessage"
                    class="min-h-20"
                  />
                </Field>
                <Field>
                  <FieldLabel for="tavern-character-alt">Alternate greetings</FieldLabel>
                  <Textarea
                    id="tavern-character-alt"
                    v-model="characterDraft.alternateGreetingsText"
                    class="min-h-24"
                    placeholder="每段之间空一行"
                  />
                </Field>
                <Field>
                  <FieldLabel for="tavern-character-examples">Message examples</FieldLabel>
                  <Textarea
                    id="tavern-character-examples"
                    v-model="characterDraft.messageExamplesText"
                    class="min-h-24"
                    placeholder="每段之间空一行"
                  />
                </Field>
                <Field>
                  <FieldLabel for="tavern-character-tags">标签</FieldLabel>
                  <Input
                    id="tavern-character-tags"
                    v-model="characterDraft.tagsText"
                    placeholder="tag-a, tag-b"
                  />
                </Field>
              </FieldGroup>

              <div class="flex flex-col gap-2 rounded-md border p-3">
                <p class="text-sm font-medium">默认绑定世界书</p>
                <label
                  v-for="lorebook in tavernStore.lorebooks"
                  :key="lorebook.id"
                  class="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                >
                  <Checkbox
                    :checked="selectedSessionLorebookSet.has(lorebook.id)"
                    @update:checked="toggleSessionLorebook(lorebook.id, $event)"
                  />
                  <span class="truncate">{{ lorebook.name }}</span>
                </label>
                <p
                  v-if="!tavernStore.lorebooks.length"
                  class="text-sm text-muted-foreground"
                >
                  暂无世界书。
                </p>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent
          value="lorebooks"
          class="min-h-0 overflow-y-auto pr-1"
        >
          <div class="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
            <div class="flex flex-col gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                @click="newLorebookDraft"
              >
                <PlusIcon data-icon="inline-start" />
                新建世界书
              </Button>
              <button
                v-for="lorebook in tavernStore.lorebooks"
                :key="lorebook.id"
                type="button"
                :class="cn(
                  'flex min-h-10 items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm',
                  selectedLorebookId === lorebook.id ? 'border-primary bg-muted' : 'border-border',
                )"
                @click="selectLorebook(lorebook.id)"
              >
                <span class="truncate">{{ lorebook.name }}</span>
                <Badge variant="outline">{{ lorebook.entries.length }}</Badge>
              </button>
            </div>

            <div class="flex min-w-0 flex-col gap-4">
              <FieldGroup>
                <Field orientation="horizontal">
                  <Checkbox
                    id="tavern-lorebook-enabled"
                    v-model:checked="lorebookDraft.enabled"
                  />
                  <FieldContent>
                    <FieldLabel for="tavern-lorebook-enabled">启用世界书</FieldLabel>
                    <FieldDescription>禁用后所有条目都不会被触发。</FieldDescription>
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel for="tavern-lorebook-name">名称</FieldLabel>
                  <Input
                    id="tavern-lorebook-name"
                    v-model="lorebookDraft.name"
                  />
                </Field>
                <Field>
                  <FieldLabel for="tavern-lorebook-desc">描述</FieldLabel>
                  <Textarea
                    id="tavern-lorebook-desc"
                    v-model="lorebookDraft.description"
                  />
                </Field>
              </FieldGroup>

              <div class="flex items-center justify-between gap-3">
                <p class="text-sm font-medium">条目</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  @click="addLorebookEntry"
                >
                  <PlusIcon data-icon="inline-start" />
                  添加条目
                </Button>
              </div>

              <div class="flex flex-col gap-3">
                <div
                  v-for="(entry, index) in lorebookDraft.entries"
                  :key="entry.id || index"
                  class="rounded-md border p-3"
                >
                  <div class="flex flex-col gap-3">
                    <div class="flex items-center justify-between gap-3">
                      <label class="flex items-center gap-2 text-sm">
                        <Checkbox v-model:checked="entry.enabled" />
                        启用条目
                      </label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="删除世界书条目"
                        @click="removeLorebookEntry(index)"
                      >
                        <Trash2Icon data-icon="inline-start" />
                      </Button>
                    </div>
                    <div class="grid gap-3 md:grid-cols-2">
                      <Field>
                        <FieldLabel>关键词</FieldLabel>
                        <Input
                          :model-value="entry.keys.join(', ')"
                          placeholder="keyword-a, keyword-b"
                          @update:model-value="setEntryKeys(entry, $event)"
                        />
                      </Field>
                      <Field>
                        <FieldLabel>Secondary keys</FieldLabel>
                        <Input
                          :model-value="(entry.secondaryKeys ?? []).join(', ')"
                          @update:model-value="setEntrySecondaryKeys(entry, $event)"
                        />
                      </Field>
                      <Field>
                        <FieldLabel>Priority</FieldLabel>
                        <Input
                          v-model="entry.priority"
                          type="number"
                        />
                      </Field>
                      <Field>
                        <FieldLabel>Order</FieldLabel>
                        <Input
                          v-model="entry.order"
                          type="number"
                        />
                      </Field>
                    </div>
                    <div class="flex flex-wrap gap-4">
                      <label class="flex items-center gap-2 text-sm">
                        <Checkbox v-model:checked="entry.constant" />
                        Constant
                      </label>
                      <label class="flex items-center gap-2 text-sm">
                        <Checkbox v-model:checked="entry.selective" />
                        Selective
                      </label>
                      <Select v-model="entry.position">
                        <SelectTrigger class="w-44">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value="after-character">After character</SelectItem>
                            <SelectItem value="before-history">Before history</SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </div>
                    <Field>
                      <FieldLabel>正文</FieldLabel>
                      <Textarea
                        v-model="entry.content"
                        class="min-h-24"
                      />
                    </Field>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent
          value="import"
          class="min-h-0 overflow-y-auto pr-1"
        >
          <div class="flex flex-col gap-4">
            <FieldGroup>
              <Field>
                <FieldLabel for="tavern-import-json">角色卡 JSON</FieldLabel>
                <Textarea
                  id="tavern-import-json"
                  v-model="importText"
                  class="min-h-56 font-mono text-xs"
                  placeholder="{ &quot;spec&quot;: &quot;chara_card_v2&quot;, &quot;data&quot;: { ... } }"
                />
                <FieldDescription>支持 SillyTavern V1/V2 风格 JSON 角色卡。</FieldDescription>
              </Field>
            </FieldGroup>
            <div class="flex flex-wrap gap-2">
              <Button
                type="button"
                :disabled="importDisabled"
                @click="importFromText"
              >
                <FileJsonIcon data-icon="inline-start" />
                导入文本
              </Button>
              <Button
                type="button"
                variant="outline"
                @click="fileInput?.click()"
              >
                <DownloadIcon data-icon="inline-start" />
                选择 JSON 文件
              </Button>
              <input
                ref="fileInput"
                class="sr-only"
                type="file"
                accept="application/json,.json"
                @change="importFromFile"
              >
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <div class="flex flex-wrap justify-end gap-2 border-t pt-4">
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
      </div>
      </div>
    </SettingsSection>
  </div>
</template>

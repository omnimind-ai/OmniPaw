<script setup lang="ts">
import type { CatAppearancePackSummary } from '@shared/types/cat-appearance'
import { CopyIcon, PackagePlusIcon, Trash2Icon } from 'lucide-vue-next'
import { storeToRefs } from 'pinia'
import type { AcceptableValue } from 'reka-ui'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { appBridge, type BridgeDesktopSettingsConfig, isFallbackBridge } from '@/bridge/app'
import SettingEntry from '@/components/settings/common/SettingEntry.vue'
import { Badge } from '@/components/ui/badge'
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

type CompanionRole = BridgeDesktopSettingsConfig['app']['companionRoles'][number]

const props = defineProps<{
  role: CompanionRole
  canDeleteRole: boolean
  appearancePacks: CatAppearancePackSummary[]
  appearanceLoading?: boolean
}>()

const emit = defineEmits<{
  duplicateRole: []
  deleteRole: [role: CompanionRole]
  importAppearance: []
}>()

const { t } = useI18n()
const toast = useToast()
const providerStore = useProviderStore()
const { modelOptions, saving, persistenceAvailable } = storeToRefs(providerStore)
const activeTab = ref('basic')
const selectingAppearancePackId = ref<string>()

const editableRole = computed(() => props.role)
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
const availableAppearancePacks = computed(() =>
  props.appearancePacks.filter((pack) => pack.status === 'available')
)
const appearanceSelectDisabled = computed(
  () => Boolean(props.appearanceLoading) || !availableAppearancePacks.value.length
)

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

async function updateAppearancePack(value: AcceptableValue): Promise<void> {
  const next = typeof value === 'string' ? value : ''
  const selected = availableAppearancePacks.value.find((pack) => pack.id === next)
  if (!selected) return

  editableRole.value.appearancePackId = selected.id
  selectingAppearancePackId.value = selected.id
  try {
    await appBridge.catAppearance.setActive({ packId: selected.id })
    toast.success(t('settings.catAppearance.role.toasts.appearanceSelected'), {
      description: selected.name,
    })
  } catch (error) {
    toast.error(errorToText(error, t('settings.catAppearance.toasts.selectFailed')))
  } finally {
    selectingAppearancePackId.value = undefined
  }
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
      class="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-0"
    >
      <div class="border-b px-4 py-3 sm:px-5">
        <TabsList class="w-full max-w-2xl">
          <TabsTrigger value="basic">
            {{ t('settings.catAppearance.role.tabs.basic') }}
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
              control-id="settings-companion-role-appearance"
              :title="t('settings.catAppearance.role.fields.appearance.title')"
              :description="t('settings.catAppearance.role.fields.appearance.description')"
            >
              <div class="flex w-full flex-col gap-2 md:w-[28rem]">
                <div class="flex flex-wrap items-center gap-2">
                  <Select
                    :model-value="editableRole.appearancePackId || 'builtin'"
                    :disabled="appearanceSelectDisabled"
                    @update:model-value="updateAppearancePack"
                  >
                    <SelectTrigger
                      id="settings-companion-role-appearance"
                      class="min-w-0 flex-1"
                    >
                      <SelectValue :placeholder="t('settings.catAppearance.role.fields.appearance.placeholder')" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem
                          v-for="pack in availableAppearancePacks"
                          :key="pack.id"
                          :value="pack.id"
                        >
                          {{ pack.name }}
                        </SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    class="shrink-0"
                    :disabled="isFallbackBridge"
                    @click="emit('importAppearance')"
                  >
                    <PackagePlusIcon data-icon="inline-start" />
                    {{ t('settings.catAppearance.importButton') }}
                  </Button>
                </div>
                <Badge
                  v-if="selectingAppearancePackId"
                  variant="outline"
                >
                  {{ t('settings.catAppearance.role.fields.appearance.switching') }}
                </Badge>
              </div>
            </SettingEntry>
          </FieldGroup>
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

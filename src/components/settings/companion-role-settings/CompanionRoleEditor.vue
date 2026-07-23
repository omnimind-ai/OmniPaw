<script setup lang="ts">
import {
  DownloadIcon,
  EyeIcon,
  SlidersHorizontalIcon,
  Trash2Icon,
  UserRoundIcon,
  XIcon,
} from '@lucide/vue'
import {
  buildCompanionRolePromptSections,
  type CompanionRolePromptSectionId,
  estimateCompanionRoleTextTokens,
} from '@shared/companion-role-prompt'
import { storeToRefs } from 'pinia'
import type { AcceptableValue } from 'reka-ui'
import { computed, type HTMLAttributes, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingEntry from '@/components/settings/common/SettingEntry.vue'
import SettingsSection from '@/components/settings/common/SettingsSection.vue'
import CompanionRoleAppearanceSection from '@/components/settings/companion-role-settings/CompanionRoleAppearanceSection.vue'
import CompanionRoleAvatarField from '@/components/settings/companion-role-settings/CompanionRoleAvatarField.vue'
import CompanionRoleDeleteModal from '@/components/settings/companion-role-settings/CompanionRoleDeleteModal.vue'
import CompanionRoleGiftsSection from '@/components/settings/companion-role-settings/CompanionRoleGiftsSection.vue'
import CompanionRoleInteractionsSection from '@/components/settings/companion-role-settings/CompanionRoleInteractionsSection.vue'
import CompanionRoleKnowledgeSection from '@/components/settings/companion-role-settings/CompanionRoleKnowledgeSection.vue'
import CompanionRoleMemoryPanel from '@/components/settings/companion-role-settings/CompanionRoleMemoryPanel.vue'
import CompanionRolePreviewDialog from '@/components/settings/companion-role-settings/CompanionRolePreviewDialog.vue'
import CompanionRoleTextEditorField from '@/components/settings/companion-role-settings/CompanionRoleTextEditorField.vue'
import type {
  CompanionRole,
  CompanionRolePromptSegment,
  CompanionRolePromptTone,
} from '@/components/settings/companion-role-settings/types'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useCompanionRoleIdleImages } from '@/composables/useCompanionRoleIdleImages'
import { cn } from '@/lib/utils'
import { type ProviderModelOption, useProviderStore } from '@/stores/provider'

const NONE_VALUE = '__none__'

const props = defineProps<{
  role: CompanionRole
  isActiveRole: boolean
  canDeleteRole: boolean
  showCloseAction?: boolean
  class?: HTMLAttributes['class']
}>()

const emit = defineEmits<{
  close: []
  exportRole: []
  deleteRole: [role: CompanionRole]
}>()

const { t } = useI18n()
const providerStore = useProviderStore()
const { modelOptions, saving, persistenceAvailable } = storeToRefs(providerStore)
const activeTab = ref('basic')
const previewOpen = ref(false)
const deleteDialogOpen = ref(false)

const editableRole = computed(() => props.role)
const roleAppearancePackIds = computed(() => [editableRole.value.appearancePackId || 'builtin'])
const { idleImageByPackId } = useCompanionRoleIdleImages(roleAppearancePackIds)
const avatarFallbackSrc = computed(
  () =>
    idleImageByPackId.value[editableRole.value.appearancePackId || 'builtin'] ||
    idleImageByPackId.value.builtin
)
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
const previewSegments = computed(() => buildCompanionRolePromptSegments(editableRole.value))
const previewTokenTotal = computed(() =>
  previewSegments.value.reduce((sum, segment) => sum + segment.estimatedTokens, 0)
)

function modelLabel(option: ProviderModelOption): string {
  return `${option.providerName} / ${option.modelName}`
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

function updateKnowledgeEntries(entries: CompanionRole['knowledgeEntries']): void {
  editableRole.value.knowledgeEntries = entries
}

function updateKnowledgeSettings(settings: CompanionRole['knowledgeSettings']): void {
  editableRole.value.knowledgeSettings = settings
}

function updateAppearancePackId(appearancePackId: string): void {
  if (editableRole.value.appearancePackId !== appearancePackId) {
    editableRole.value.appearanceLayoutOverride = undefined
  }
  editableRole.value.appearancePackId = appearancePackId
}

function updateAppearanceLayoutOverride(
  layout: NonNullable<CompanionRole['appearanceLayoutOverride']>
): void {
  editableRole.value.appearanceLayoutOverride = { ...layout }
}

function updatePetInteractions(interactions: CompanionRole['petInteractions']): void {
  editableRole.value.petInteractions = interactions
}

function updatePetGifts(gifts: CompanionRole['petGifts']): void {
  editableRole.value.petGifts = gifts
}

function buildCompanionRolePromptSegments(role: CompanionRole): CompanionRolePromptSegment[] {
  const owners: Record<CompanionRolePromptSectionId, string> = {
    identity: t('settings.catAppearance.role.preview.owners.identity'),
    'user-nickname': t('settings.catAppearance.role.fields.userNickname.title'),
    personality: t('settings.catAppearance.role.fields.personality.title'),
    background: t('settings.catAppearance.role.fields.background.title'),
    'example-dialogue': t('settings.catAppearance.role.fields.exampleDialogue.title'),
    'knowledge-policy': t('settings.catAppearance.role.knowledge.title'),
    'advanced-system': t('settings.catAppearance.role.advanced.fields.systemPrompt.title'),
    'advanced-final': t('settings.catAppearance.role.advanced.fields.finalInstructions.title'),
    'desktop-presence': t('settings.catAppearance.role.preview.owners.desktopPresence'),
  }
  const tones: Record<CompanionRolePromptSectionId, CompanionRolePromptTone> = {
    identity: 'blue',
    'user-nickname': 'teal',
    personality: 'amber',
    background: 'blue',
    'example-dialogue': 'slate',
    'knowledge-policy': 'teal',
    'advanced-system': 'amber',
    'advanced-final': 'blue',
    'desktop-presence': 'violet',
  }

  return buildCompanionRolePromptSections(role).map((section) => ({
    id: section.id,
    owner: owners[section.id],
    text: section.text,
    tone: tones[section.id],
    estimatedTokens: estimateCompanionRoleTextTokens(section.text),
  }))
}

function confirmDeleteRole(): void {
  deleteDialogOpen.value = false
  emit('deleteRole', editableRole.value)
}
</script>

<template>
  <div
    data-slot="card"
    :class="cn(
      'grid h-full min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-lg border bg-card shadow-sm',
      props.class,
    )"
  >
    <div class="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-4 sm:px-5">
      <div class="min-w-0">
        <h1 class="truncate text-xl font-semibold">
          {{ editableRole.name || t('settings.catAppearance.role.unnamed') }}
        </h1>
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
          variant="outline"
          size="sm"
          :disabled="!canDeleteRole"
          @click="deleteDialogOpen = true"
        >
          <Trash2Icon data-icon="inline-start" />
          {{ t('settings.catAppearance.role.actions.delete') }}
        </Button>
        <Button
          v-if="showCloseAction"
          variant="ghost"
          size="icon-sm"
          :aria-label="t('settings.catAppearance.role.overview.close')"
          @click="emit('close')"
        >
          <XIcon />
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
            :title="t('settings.catAppearance.role.sections.basic.title')"
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

              <CompanionRoleAvatarField
                v-model="editableRole.avatar"
                :role-name="editableRole.name"
                :avatar-fallback-src="avatarFallbackSrc"
              />

              <CompanionRoleTextEditorField
                v-model="editableRole.introduction"
                control-id="settings-companion-role-introduction"
                :title="t('settings.catAppearance.role.fields.introduction.title')"
                :description="t('settings.catAppearance.role.fields.introduction.description')"
                :placeholder="t('settings.catAppearance.role.fields.introduction.placeholder')"
                :rows="16"
                :preview-lines="2"
                :maxlength="240"
              />

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

              <SettingEntry
                control-id="settings-companion-role-personality"
                :title="t('settings.catAppearance.role.fields.personality.title')"
                :description="t('settings.catAppearance.role.fields.personality.description')"
              >
                <Input
                  id="settings-companion-role-personality"
                  v-model="editableRole.personality"
                  class="w-full md:w-72"
                  :placeholder="t('settings.catAppearance.role.fields.personality.placeholder')"
                />
              </SettingEntry>

              <CompanionRoleTextEditorField
                control-id="settings-companion-role-background"
                v-model="editableRole.background"
                :title="t('settings.catAppearance.role.fields.background.title')"
                :description="t('settings.catAppearance.role.fields.background.description')"
                :placeholder="t('settings.catAppearance.role.fields.background.placeholder')"
                :rows="18"
              />

              <CompanionRoleTextEditorField
                control-id="settings-companion-role-examples"
                v-model="editableRole.advanced.exampleDialogue"
                :title="t('settings.catAppearance.role.fields.exampleDialogue.title')"
                :description="t('settings.catAppearance.role.fields.exampleDialogue.description')"
                :placeholder="t('settings.catAppearance.role.fields.exampleDialogue.placeholder')"
                :rows="22"
              />

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
        />
      </TabsContent>

      <TabsContent
        value="knowledge"
        class="min-h-0 overflow-hidden"
      >
        <CompanionRoleKnowledgeSection
          :entries="editableRole.knowledgeEntries"
          :settings="editableRole.knowledgeSettings"
          @update:entries="updateKnowledgeEntries"
          @update:settings="updateKnowledgeSettings"
        />
      </TabsContent>

      <TabsContent
        value="appearance"
        class="min-h-0 overflow-y-auto"
      >
        <div class="flex flex-col gap-4 p-4 sm:p-5">
          <CompanionRoleAppearanceSection
            :appearance-pack-id="editableRole.appearancePackId"
            :appearance-layout-override="editableRole.appearanceLayoutOverride"
            @update:appearance-pack-id="updateAppearancePackId"
            @update:appearance-layout-override="updateAppearanceLayoutOverride"
          />
        </div>
      </TabsContent>

      <TabsContent
        value="interactions"
        class="min-h-0 overflow-y-auto"
      >
        <div class="flex flex-col gap-4 p-4 sm:p-5">
          <CompanionRoleInteractionsSection
            :interactions="editableRole.petInteractions"
            @update:interactions="updatePetInteractions"
          />
          <CompanionRoleGiftsSection
            :gifts="editableRole.petGifts"
            @update:gifts="updatePetGifts"
          />
        </div>
      </TabsContent>

      <TabsContent
        value="advanced"
        class="min-h-0 overflow-y-auto"
      >
        <div class="flex flex-col gap-4 p-4 sm:p-5">
          <SettingsSection
            :title="t('settings.catAppearance.role.sections.advanced.title')"
            :icon="SlidersHorizontalIcon"
          >
            <FieldGroup class="gap-0">
              <CompanionRoleTextEditorField
                control-id="settings-companion-role-advanced-system"
                v-model="editableRole.advanced.systemPrompt"
                :title="t('settings.catAppearance.role.advanced.fields.systemPrompt.title')"
                :description="t('settings.catAppearance.role.advanced.fields.systemPrompt.description')"
                :placeholder="t('settings.catAppearance.role.advanced.fields.systemPrompt.placeholder')"
                :rows="20"
              />

              <CompanionRoleTextEditorField
                control-id="settings-companion-role-advanced-final"
                v-model="editableRole.advanced.finalInstructions"
                :title="t('settings.catAppearance.role.advanced.fields.finalInstructions.title')"
                :description="t('settings.catAppearance.role.advanced.fields.finalInstructions.description')"
                :placeholder="t('settings.catAppearance.role.advanced.fields.finalInstructions.placeholder')"
                :rows="18"
              />
            </FieldGroup>
          </SettingsSection>
        </div>
      </TabsContent>
    </Tabs>
  </div>

  <CompanionRolePreviewDialog
    v-model:open="previewOpen"
    :segments="previewSegments"
    :token-total="previewTokenTotal"
  />

  <CompanionRoleDeleteModal
    v-model:open="deleteDialogOpen"
    :role-name="editableRole.name || t('settings.catAppearance.role.unnamed')"
    @confirm="confirmDeleteRole"
  />
</template>

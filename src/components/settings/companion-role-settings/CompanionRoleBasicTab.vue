<script setup lang="ts">
import type { CatAppearancePackSummary } from '@shared/types/cat-appearance'
import {
  BotIcon,
  CheckIcon,
  CopyIcon,
  PackagePlusIcon,
  PlusIcon,
  Trash2Icon,
  UserRoundIcon,
} from 'lucide-vue-next'
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
import { Textarea } from '@/components/ui/textarea'
import { type ProviderModelOption, useProviderStore } from '@/stores/provider'
import { errorToText, useToast } from '@/utils/toast'

const NONE_VALUE = '__none__'

type CompanionRole = BridgeDesktopSettingsConfig['app']['companionRoles'][number]

const props = defineProps<{
  draft: BridgeDesktopSettingsConfig
  appearancePacks: CatAppearancePackSummary[]
  appearanceLoading?: boolean
}>()

const emit = defineEmits<{
  importAppearance: []
}>()

const { t } = useI18n()
const toast = useToast()
const providerStore = useProviderStore()
const { modelOptions, saving, persistenceAvailable } = storeToRefs(providerStore)
const selectingAppearancePackId = ref<string>()

const roles = computed(() => props.draft.app.companionRoles)
const activeRoleId = computed(() => props.draft.app.activeCompanionRoleId)
const role = computed(() => {
  return roles.value.find((item) => item.id === activeRoleId.value) ?? roles.value[0]
})
const canDeleteRole = computed(() => roles.value.length > 1)
const enabledModelOptions = computed(() => modelOptions.value.filter((option) => option.enabled))
const selectedModelKey = computed(() => {
  const providerId = role.value?.defaultProviderId
  const modelId = role.value?.defaultModelId
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

function createRole(): void {
  const nextRole = createCompanionRole()
  roles.value.push(nextRole)
  props.draft.app.activeCompanionRoleId = nextRole.id
}

function duplicateRole(): void {
  if (!role.value) return
  const nextRole: CompanionRole = {
    ...role.value,
    id: createRoleId(),
    name: t('settings.catAppearance.role.copyName', { name: role.value.name || defaultRoleName() }),
    advanced: { ...role.value.advanced },
  }
  roles.value.push(nextRole)
  props.draft.app.activeCompanionRoleId = nextRole.id
}

function deleteRole(target: CompanionRole): void {
  if (!canDeleteRole.value) return
  const index = roles.value.findIndex((item) => item.id === target.id)
  if (index < 0) return
  roles.value.splice(index, 1)
  if (props.draft.app.activeCompanionRoleId === target.id) {
    props.draft.app.activeCompanionRoleId =
      roles.value[Math.max(0, index - 1)]?.id ?? roles.value[0]?.id ?? ''
  }
}

function selectRole(target: CompanionRole): void {
  props.draft.app.activeCompanionRoleId = target.id
}

function updateInteractionMode(value: AcceptableValue): void {
  if (!role.value) return
  const next = typeof value === 'string' ? value : ''
  if (next === 'assistant' || next === 'roleplay' || next === 'companion') {
    role.value.interactionMode = next
  }
}

function updateDefaultModel(value: AcceptableValue): void {
  if (!role.value) return
  const next = typeof value === 'string' ? value : ''
  if (!next || next === NONE_VALUE) {
    role.value.defaultProviderId = undefined
    role.value.defaultModelId = undefined
    return
  }

  const selected = enabledModelOptions.value.find((option) => option.key === next)
  role.value.defaultProviderId = selected?.providerId
  role.value.defaultModelId = selected?.modelId
}

async function updateAppearancePack(value: AcceptableValue): Promise<void> {
  if (!role.value) return
  const next = typeof value === 'string' ? value : ''
  const selected = availableAppearancePacks.value.find((pack) => pack.id === next)
  if (!selected) return

  role.value.appearancePackId = selected.id
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

function createCompanionRole(): CompanionRole {
  return {
    id: createRoleId(),
    enabled: true,
    name: defaultRoleName(),
    appearancePackId: 'builtin',
    userNickname: '',
    personality: '',
    speechStyle: '',
    relationship: '',
    background: '',
    greeting: '',
    proactiveStyle: '',
    interactionMode: 'companion',
    advanced: {
      enabled: false,
      systemPrompt: '',
      knowledge: '',
      exampleDialogue: '',
      finalInstructions: '',
    },
    defaultProviderId: undefined,
    defaultModelId: undefined,
  }
}

function createRoleId(): string {
  return `role-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function defaultRoleName(): string {
  return t('settings.catAppearance.role.newRoleName')
}
</script>

<template>
  <div class="flex min-h-full flex-1 flex-col gap-4 px-4 py-4 sm:px-5">
    <div class="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <div class="flex flex-col gap-3 rounded-md border bg-card p-3">
        <div class="flex items-center justify-between gap-2">
          <div class="flex min-w-0 items-center gap-2">
            <p class="text-sm font-medium">{{ t('settings.catAppearance.role.listTitle') }}</p>
            <Badge variant="outline">{{ roles.length }}</Badge>
          </div>
          <Button
            size="sm"
            variant="outline"
            @click="createRole"
          >
            <PlusIcon data-icon="inline-start" />
            {{ t('settings.catAppearance.role.actions.add') }}
          </Button>
        </div>

        <div class="flex flex-col gap-2">
          <button
            v-for="item in roles"
            :key="item.id"
            type="button"
            class="flex min-h-16 w-full items-start gap-3 rounded-md border px-3 py-2 text-left transition-colors hover:bg-muted/50"
            :class="item.id === activeRoleId ? 'border-primary bg-muted/50' : 'border-border'"
            @click="selectRole(item)"
          >
            <div class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <UserRoundIcon class="size-4" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <p class="truncate text-sm font-medium">{{ item.name || t('settings.catAppearance.role.unnamed') }}</p>
                <CheckIcon
                  v-if="item.id === activeRoleId"
                  class="size-4 shrink-0 text-primary"
                />
              </div>
              <p class="truncate text-xs text-muted-foreground">
                {{ item.relationship || t('settings.catAppearance.role.noRelationship') }}
              </p>
              <div class="mt-1 flex flex-wrap gap-1">
                <Badge
                  v-if="item.enabled"
                  variant="secondary"
                >
                  {{ t('settings.catAppearance.role.enabled') }}
                </Badge>
                <Badge
                  v-else
                  variant="outline"
                >
                  {{ t('settings.catAppearance.role.disabled') }}
                </Badge>
              </div>
            </div>
          </button>
        </div>
      </div>

      <div
        v-if="role"
        class="flex min-w-0 flex-col gap-4"
      >
        <div class="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-card px-4 py-3">
          <div class="min-w-0">
            <p class="truncate text-sm font-semibold">
              {{ role.name || t('settings.catAppearance.role.unnamed') }}
            </p>
            <p class="text-xs text-muted-foreground">{{ t('settings.catAppearance.role.activeHint') }}</p>
          </div>
          <div class="flex items-center gap-2">
            <Switch v-model="role.enabled" />
            <Button
              variant="outline"
              size="sm"
              @click="duplicateRole"
            >
              <CopyIcon data-icon="inline-start" />
              {{ t('settings.catAppearance.role.actions.duplicate') }}
            </Button>
            <Button
              variant="outline"
              size="sm"
              :disabled="!canDeleteRole"
              @click="deleteRole(role)"
            >
              <Trash2Icon data-icon="inline-start" />
              {{ t('settings.catAppearance.role.actions.delete') }}
            </Button>
          </div>
        </div>

        <FieldGroup class="gap-0 rounded-md border bg-card">
          <SettingEntry
            control-id="settings-companion-role-name"
            :title="t('settings.catAppearance.role.fields.name.title')"
            :description="t('settings.catAppearance.role.fields.name.description')"
          >
            <Input
              id="settings-companion-role-name"
              v-model="role.name"
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
              v-model="role.userNickname"
              class="w-full md:w-72"
              :placeholder="t('settings.catAppearance.role.fields.userNickname.placeholder')"
            />
          </SettingEntry>

          <SettingEntry
            control-id="settings-companion-role-appearance"
            :title="t('settings.catAppearance.role.fields.appearance.title')"
            :description="t('settings.catAppearance.role.fields.appearance.description')"
          >
            <div class="flex w-full flex-col gap-2 md:w-[28rem]">
              <div class="flex flex-wrap items-center gap-2">
                <Select
                  :model-value="role.appearancePackId || 'builtin'"
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
              <div
                v-if="selectingAppearancePackId"
                class="flex items-center gap-2"
              >
                <Badge
                  variant="outline"
                >
                  {{ t('settings.catAppearance.role.fields.appearance.switching') }}
                </Badge>
              </div>
            </div>
          </SettingEntry>

          <SettingEntry
            control-id="settings-companion-role-mode"
            :title="t('settings.catAppearance.role.fields.interactionMode.title')"
            :description="t('settings.catAppearance.role.fields.interactionMode.description')"
          >
            <Select
              :model-value="role.interactionMode"
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
        </FieldGroup>

        <FieldGroup class="gap-0 rounded-md border bg-card">
          <SettingEntry
            control-id="settings-companion-role-personality"
            :title="t('settings.catAppearance.role.fields.personality.title')"
            :description="t('settings.catAppearance.role.fields.personality.description')"
          >
            <Input
              id="settings-companion-role-personality"
              v-model="role.personality"
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
              v-model="role.speechStyle"
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
              v-model="role.relationship"
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
            control-class="@md/field-group:w-[min(28rem,50vw)]"
          >
            <Textarea
              id="settings-companion-role-background"
              v-model="role.background"
              class="min-h-20"
              :placeholder="t('settings.catAppearance.role.fields.background.placeholder')"
            />
          </SettingEntry>

          <SettingEntry
            control-id="settings-companion-role-greeting"
            :title="t('settings.catAppearance.role.fields.greeting.title')"
            :description="t('settings.catAppearance.role.fields.greeting.description')"
            control-class="@md/field-group:w-[min(28rem,50vw)]"
          >
            <Textarea
              id="settings-companion-role-greeting"
              v-model="role.greeting"
              class="min-h-20"
              :placeholder="t('settings.catAppearance.role.fields.greeting.placeholder')"
            />
          </SettingEntry>

          <SettingEntry
            control-id="settings-companion-role-proactive"
            :title="t('settings.catAppearance.role.fields.proactiveStyle.title')"
            :description="t('settings.catAppearance.role.fields.proactiveStyle.description')"
            control-class="@md/field-group:w-[min(28rem,50vw)]"
          >
            <Textarea
              id="settings-companion-role-proactive"
              v-model="role.proactiveStyle"
              class="min-h-20"
              :placeholder="t('settings.catAppearance.role.fields.proactiveStyle.placeholder')"
            />
          </SettingEntry>
        </FieldGroup>

        <FieldGroup class="gap-0 rounded-md border bg-card">
          <SettingEntry
            control-id="settings-companion-role-advanced-enabled"
            :title="t('settings.catAppearance.role.advanced.title')"
            :description="t('settings.catAppearance.role.advanced.description')"
          >
            <Switch
              id="settings-companion-role-advanced-enabled"
              v-model="role.advanced.enabled"
            />
          </SettingEntry>

          <SettingEntry
            control-id="settings-companion-role-advanced-system"
            :title="t('settings.catAppearance.role.advanced.fields.systemPrompt.title')"
            :description="t('settings.catAppearance.role.advanced.fields.systemPrompt.description')"
            control-class="@md/field-group:w-[min(28rem,50vw)]"
          >
            <Textarea
              id="settings-companion-role-advanced-system"
              v-model="role.advanced.systemPrompt"
              class="min-h-24"
              :placeholder="t('settings.catAppearance.role.advanced.fields.systemPrompt.placeholder')"
            />
          </SettingEntry>

          <SettingEntry
            control-id="settings-companion-role-advanced-knowledge"
            :title="t('settings.catAppearance.role.advanced.fields.knowledge.title')"
            :description="t('settings.catAppearance.role.advanced.fields.knowledge.description')"
            control-class="@md/field-group:w-[min(28rem,50vw)]"
          >
            <Textarea
              id="settings-companion-role-advanced-knowledge"
              v-model="role.advanced.knowledge"
              class="min-h-24"
              :placeholder="t('settings.catAppearance.role.advanced.fields.knowledge.placeholder')"
            />
          </SettingEntry>

          <SettingEntry
            control-id="settings-companion-role-advanced-examples"
            :title="t('settings.catAppearance.role.advanced.fields.exampleDialogue.title')"
            :description="t('settings.catAppearance.role.advanced.fields.exampleDialogue.description')"
            control-class="@md/field-group:w-[min(28rem,50vw)]"
          >
            <Textarea
              id="settings-companion-role-advanced-examples"
              v-model="role.advanced.exampleDialogue"
              class="min-h-28"
              :placeholder="t('settings.catAppearance.role.advanced.fields.exampleDialogue.placeholder')"
            />
          </SettingEntry>

          <SettingEntry
            control-id="settings-companion-role-advanced-final"
            :title="t('settings.catAppearance.role.advanced.fields.finalInstructions.title')"
            :description="t('settings.catAppearance.role.advanced.fields.finalInstructions.description')"
            control-class="@md/field-group:w-[min(28rem,50vw)]"
          >
            <Textarea
              id="settings-companion-role-advanced-final"
              v-model="role.advanced.finalInstructions"
              class="min-h-24"
              :placeholder="t('settings.catAppearance.role.advanced.fields.finalInstructions.placeholder')"
            />
          </SettingEntry>
        </FieldGroup>
      </div>
    </div>

    <div class="flex items-center gap-2 rounded-md border bg-muted/20 px-4 py-3 text-xs leading-5 text-muted-foreground">
      <BotIcon class="size-4 shrink-0" />
      <span>{{ t('settings.catAppearance.role.hints.newSessions') }}</span>
    </div>
  </div>
</template>

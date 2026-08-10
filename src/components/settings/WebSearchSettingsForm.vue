<script setup lang="ts">
import { Globe2Icon, KeyRoundIcon, SaveIcon, SearchCheckIcon, Settings2Icon } from '@lucide/vue'
import type { WebSearchDepth, WebSearchProvider } from '@shared/types/web-search'
import { storeToRefs } from 'pinia'
import type { AcceptableValue } from 'reka-ui'
import { computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingEntry from '@/components/settings/common/SettingEntry.vue'
import SettingsSection from '@/components/settings/common/SettingsSection.vue'
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
import { useWebSearchStore } from '@/stores/web-search'
import { errorToText, useToast } from '@/utils/toast'

const providerOptions: WebSearchProvider[] = [
  'tavily',
  'bocha',
  'brave',
  'firecrawl',
  'baidu',
  'exa',
]

const { t } = useI18n()
const toast = useToast()
const store = useWebSearchStore()
const { apiKey, draft, hasChanges, loading, persistenceAvailable, saving, testing } =
  storeToRefs(store)

const enabled = computed({
  get: () => draft.value?.enabled ?? false,
  set: (value: boolean) => store.updateDraft((next) => (next.enabled = value)),
})
const selectedProvider = computed(() => draft.value?.provider ?? 'tavily')
const providerConfigured = computed(
  () => draft.value?.configuredProviders[selectedProvider.value] ?? false
)
const maxResults = computed({
  get: () => draft.value?.maxResults ?? 5,
  set: (value: string | number) =>
    store.updateDraft((next) => {
      next.maxResults = clampInteger(value, 1, 10)
    }),
})

onMounted(() => {
  void store.load().catch((error) => {
    toast.error(errorToText(error, t('settings.webSearch.errors.loadFailed')))
  })
})

watch(selectedProvider, () => {
  apiKey.value = ''
})

function updateProvider(value: AcceptableValue): void {
  if (!isProvider(value)) return
  store.updateDraft((next) => (next.provider = value))
}

function updateSearchDepth(value: AcceptableValue): void {
  if (value !== 'basic' && value !== 'advanced') return
  store.updateDraft((next) => (next.searchDepth = value as WebSearchDepth))
}

async function save(): Promise<void> {
  try {
    await store.save()
    toast.success(t('settings.webSearch.saved'))
  } catch (error) {
    toast.error(errorToText(error, t('settings.webSearch.errors.saveFailed')))
  }
}

async function test(): Promise<void> {
  try {
    const result = await store.test(selectedProvider.value)
    if (result.ok) {
      toast.success(t('settings.webSearch.testSucceeded', { count: result.resultCount }))
      return
    }
    toast.error(result.error?.message || t('settings.webSearch.errors.testFailed'))
  } catch (error) {
    toast.error(errorToText(error, t('settings.webSearch.errors.testFailed')))
  }
}

function providerLabel(provider: WebSearchProvider): string {
  return t(`settings.webSearch.providers.${provider}`)
}

function isProvider(value: AcceptableValue): value is WebSearchProvider {
  return typeof value === 'string' && providerOptions.includes(value as WebSearchProvider)
}

function clampInteger(value: string | number, min: number, max: number): number {
  const numeric = Math.round(Number(value))
  if (!Number.isFinite(numeric)) return min
  return Math.max(min, Math.min(numeric, max))
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <SettingsSection
      :title="t('settings.webSearch.title')"
      :icon="Globe2Icon"
    >
      <FieldGroup class="gap-0">
        <SettingEntry
          control-id="web-search-enabled"
          :title="t('settings.webSearch.enabled.title')"
          :description="t('settings.webSearch.enabled.description')"
          :disabled="loading || !draft"
        >
          <Switch
            id="web-search-enabled"
            v-model="enabled"
            :disabled="loading || !draft || !persistenceAvailable"
            :aria-label="t('settings.webSearch.enabled.title')"
          />
        </SettingEntry>

        <SettingEntry
          control-id="web-search-provider"
          :title="t('settings.webSearch.provider.title')"
          :description="t('settings.webSearch.provider.description')"
          :disabled="loading || !draft"
        >
          <Select
            :model-value="selectedProvider"
            :disabled="loading || !draft || !persistenceAvailable"
            @update:model-value="updateProvider"
          >
            <SelectTrigger id="web-search-provider" class="w-full md:w-56">
              <SelectValue :placeholder="t('settings.webSearch.provider.placeholder')" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem
                  v-for="provider in providerOptions"
                  :key="provider"
                  :value="provider"
                >
                  {{ providerLabel(provider) }}
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </SettingEntry>
      </FieldGroup>
    </SettingsSection>

    <SettingsSection
      :title="t('settings.webSearch.credential.title')"
      :icon="KeyRoundIcon"
    >
      <FieldGroup class="gap-0">
        <SettingEntry
          control-id="web-search-api-key"
          :title="t('settings.webSearch.credential.apiKey')"
          :description="t('settings.webSearch.credential.description')"
          control-class="flex-wrap"
        >
          <div class="flex w-full flex-col items-stretch gap-2 md:w-[28rem] md:items-end">
            <div class="flex w-full items-center gap-2">
              <Input
                id="web-search-api-key"
                v-model="apiKey"
                type="password"
                autocomplete="off"
                :disabled="loading || !draft || !persistenceAvailable"
                :placeholder="
                  providerConfigured
                    ? t('settings.webSearch.credential.savedPlaceholder')
                    : t('settings.webSearch.credential.placeholder')
                "
              />
              <Badge :variant="providerConfigured ? 'secondary' : 'outline'">
                {{
                  providerConfigured
                    ? t('settings.webSearch.credential.configured')
                    : t('settings.webSearch.credential.missing')
                }}
              </Badge>
            </div>
            <p class="text-xs text-muted-foreground">
              {{ t('settings.webSearch.credential.security') }}
            </p>
          </div>
        </SettingEntry>
      </FieldGroup>
    </SettingsSection>

    <SettingsSection
      :title="t('settings.webSearch.options.title')"
      :icon="Settings2Icon"
    >
      <FieldGroup class="gap-0">
        <SettingEntry
          control-id="web-search-max-results"
          :title="t('settings.webSearch.options.maxResults.title')"
          :description="t('settings.webSearch.options.maxResults.description')"
        >
          <Input
            id="web-search-max-results"
            v-model="maxResults"
            class="w-full md:w-32"
            type="number"
            min="1"
            max="10"
            step="1"
            :disabled="loading || !draft || !persistenceAvailable"
          />
        </SettingEntry>

        <SettingEntry
          control-id="web-search-depth"
          :title="t('settings.webSearch.options.searchDepth.title')"
          :description="t('settings.webSearch.options.searchDepth.description')"
        >
          <Select
            :model-value="draft?.searchDepth ?? 'basic'"
            :disabled="loading || !draft || !persistenceAvailable || selectedProvider !== 'tavily'"
            @update:model-value="updateSearchDepth"
          >
            <SelectTrigger id="web-search-depth" class="w-full md:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="basic">
                {{ t('settings.webSearch.options.searchDepth.basic') }}
              </SelectItem>
              <SelectItem value="advanced">
                {{ t('settings.webSearch.options.searchDepth.advanced') }}
              </SelectItem>
            </SelectContent>
          </Select>
        </SettingEntry>
      </FieldGroup>
    </SettingsSection>

    <div class="flex flex-wrap justify-end gap-2">
      <Button
        type="button"
        variant="outline"
        :disabled="
          loading ||
          saving ||
          testing ||
          !draft ||
          (!providerConfigured && !apiKey.trim()) ||
          !persistenceAvailable
        "
        @click="test"
      >
        <SearchCheckIcon />
        {{ testing ? t('settings.webSearch.testing') : t('settings.webSearch.test') }}
      </Button>
      <Button
        type="button"
        :disabled="loading || saving || !draft || !hasChanges || !persistenceAvailable"
        @click="save"
      >
        <SaveIcon />
        {{ saving ? t('settings.webSearch.saving') : t('settings.webSearch.save') }}
      </Button>
    </div>
  </div>
</template>

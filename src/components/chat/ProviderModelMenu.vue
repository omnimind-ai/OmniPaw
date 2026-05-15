<template>
  <v-menu v-model="menuOpen" :close-on-content-click="false" location="top" @update:model-value="handleMenuToggle">
    <template #activator="{ props: menuProps }">
      <v-chip v-bind="menuProps" class="text-none provider-chip" variant="outlined" size="small">
        <v-icon start size="14">mdi-creation</v-icon>
        <span v-if="selectedOption" class="chip-label">
          {{ selectedOption.modelName }}
        </span>
        <span v-else>Model</span>
      </v-chip>
    </template>

    <v-card class="provider-menu-card" min-width="320" max-width="440">
      <v-card-text class="pa-2">
        <v-text-field
          v-model="searchQuery"
          placeholder="Search..."
          hide-details
          variant="plain"
          flat
          density="compact"
          prepend-inner-icon="mdi-magnify"
          class="ml-2 mb-2 mr-2"
          clearable
        />

        <div v-if="loading" class="provider-loading">
          <v-progress-circular indeterminate size="18" width="2" />
          <span>Loading models</span>
        </div>

        <v-list v-else density="compact" nav class="provider-menu-list">
          <v-list-item
            v-for="option in filteredOptions"
            :key="option.key"
            :active="selectedKey === option.key"
            rounded="lg"
            class="provider-menu-item"
            @click="selectOption(option)"
          >
            <v-list-item-title class="text-body-2 provider-title">
              <span>{{ option.modelName }}</span>
              <v-icon v-if="selectedKey === option.key" size="14">mdi-check</v-icon>
            </v-list-item-title>
            <v-list-item-subtitle class="provider-subtitle">
              <span class="provider-name">{{ option.providerName }}</span>
              <span class="meta-icons">
                <v-tooltip text="支持图像输入" location="top" v-if="supportsImageInput(option)">
                  <template #activator="{ props: tipProps }">
                    <v-icon v-bind="tipProps" size="12" color="grey">mdi-eye-outline</v-icon>
                  </template>
                </v-tooltip>
                <v-tooltip text="支持音频输入" location="top" v-if="supportsAudioInput(option)">
                  <template #activator="{ props: tipProps }">
                    <v-icon v-bind="tipProps" size="12" color="grey">mdi-music-note-outline</v-icon>
                  </template>
                </v-tooltip>
                <v-tooltip text="支持工具调用" location="top" v-if="supportsToolCall(option)">
                  <template #activator="{ props: tipProps }">
                    <v-icon v-bind="tipProps" size="12" color="grey">mdi-wrench</v-icon>
                  </template>
                </v-tooltip>
                <v-tooltip text="支持推理" location="top" v-if="supportsReasoning(option)">
                  <template #activator="{ props: tipProps }">
                    <v-icon v-bind="tipProps" size="12" color="grey">mdi-brain</v-icon>
                  </template>
                </v-tooltip>
              </span>
            </v-list-item-subtitle>
          </v-list-item>
        </v-list>

        <div v-if="!loading && filteredOptions.length === 0" class="empty-hint">
          No available models
        </div>
      </v-card-text>
    </v-card>
  </v-menu>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useProviderStore, type ProviderModelOption } from '@/stores/provider'

export interface ProviderModelSelection {
  providerId: string
  modelId: string
  modelName: string
}

const providerStore = useProviderStore()
const { enabledModelOptions, loading } = storeToRefs(providerStore)
const selectedKey = ref('')
const searchQuery = ref('')
const menuOpen = ref(false)

const selectedOption = computed(() =>
  enabledModelOptions.value.find((option) => option.key === selectedKey.value),
)

const filteredOptions = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) {
    return enabledModelOptions.value
  }

  return enabledModelOptions.value.filter((option) =>
    [option.providerId, option.providerName, option.modelId, option.modelName, option.remoteId]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query)),
  )
})

function loadFromStorage() {
  const savedKey = localStorage.getItem('selectedProviderModel')
  if (savedKey) {
    selectedKey.value = savedKey
    return
  }

  const legacyProviderId = localStorage.getItem('selectedProvider')
  if (legacyProviderId) {
    const option = enabledModelOptions.value.find((item) => item.providerId === legacyProviderId)
    selectedKey.value = option?.key ?? ''
  }
}

function saveToStorage() {
  if (!selectedKey.value) return
  localStorage.setItem('selectedProviderModel', selectedKey.value)
  const option = selectedOption.value
  if (option) {
    localStorage.setItem('selectedProvider', option.providerId)
  }
}

async function loadProviderConfigs() {
  await providerStore.loadProviders()
  if (!selectedKey.value) {
    loadFromStorage()
  }
  if (!selectedOption.value && enabledModelOptions.value.length) {
    selectedKey.value = enabledModelOptions.value[0].key
    saveToStorage()
  }
}

function selectOption(option: ProviderModelOption) {
  selectedKey.value = option.key
  saveToStorage()
  menuOpen.value = false
}

function supportsImageInput(option: ProviderModelOption): boolean {
  return option.input.includes('image')
}

function supportsAudioInput(option: ProviderModelOption): boolean {
  return option.input.includes('audio')
}

function supportsToolCall(option: ProviderModelOption): boolean {
  return option.supportsTools
}

function supportsReasoning(option: ProviderModelOption): boolean {
  return option.supportsReasoning
}

function getCurrentSelection(): ProviderModelSelection | null {
  const option = selectedOption.value
  return option
    ? {
        providerId: option.providerId,
        modelId: option.modelId,
        modelName: option.modelName,
      }
    : null
}

function handleMenuToggle(isOpen: boolean) {
  if (isOpen) {
    void loadProviderConfigs()
  }
}

watch(enabledModelOptions, () => {
  if (!selectedOption.value && enabledModelOptions.value.length) {
    selectedKey.value = enabledModelOptions.value[0].key
    saveToStorage()
  }
})

onMounted(() => {
  loadFromStorage()
  void loadProviderConfigs()
})

defineExpose({
  getCurrentSelection,
})
</script>

<style scoped>
.provider-chip {
  cursor: pointer;
  height: 36px !important;
  min-height: 36px !important;
  max-width: 240px;
  border-color: rgba(var(--v-theme-on-surface), 0.18) !important;
  background: transparent !important;
  color: rgba(var(--v-theme-on-surface), 0.78) !important;
}

.chip-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.provider-chip:hover {
  border-color: rgba(var(--v-theme-on-surface), 0.34) !important;
  background: rgba(var(--v-theme-on-surface), 0.04) !important;
}

.provider-menu-card {
  border-radius: 12px !important;
}

.provider-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px;
  color: var(--v-theme-secondaryText);
  font-size: 12px;
}

.provider-menu-list {
  max-height: 300px;
  overflow-y: auto;
}

.provider-menu-item {
  margin-bottom: 2px;
  border-radius: 8px !important;
  min-height: 48px !important;
}

.provider-menu-item:hover {
  background-color: rgba(103, 58, 183, 0.05);
}

.provider-menu-item.v-list-item--active {
  background-color: rgba(103, 58, 183, 0.1);
}

.provider-title,
.provider-subtitle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.provider-title span,
.provider-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.provider-name {
  font-size: 12px;
  color: var(--v-theme-secondaryText);
}

.meta-icons {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 4px;
}

.empty-hint {
  font-size: 12px;
  color: var(--v-theme-secondaryText);
  text-align: center;
  padding: 16px;
  opacity: 0.6;
}

@media (max-width: 768px) {
  .provider-chip {
    height: 32px !important;
    min-height: 32px !important;
    max-width: 180px;
  }
}
</style>

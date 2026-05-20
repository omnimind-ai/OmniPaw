import { storeToRefs } from 'pinia'
import { type ComputedRef, computed, type Ref, ref, watch } from 'vue'

import type { Session } from '@/composables/useSessions'
import { type ProviderModelOption, useProviderStore } from '@/stores/provider'
import { logger } from '@/utils/logger'
import { useToast } from '@/utils/toast'

interface UseChatWorkspaceModelOptions {
  currSessionId: Ref<string>
  sessions: Ref<Session[]>
  getCurrentSession: ComputedRef<Session | null>
}

const chatWorkspaceModelLogger = logger.child('chat.workspace.model')

export function useChatWorkspaceModel({
  currSessionId,
  sessions,
  getCurrentSession,
}: UseChatWorkspaceModelOptions) {
  const providerStore = useProviderStore()
  const toast = useToast()
  const {
    defaultModelKey,
    enabledModelOptions,
    loading: providersLoading,
  } = storeToRefs(providerStore)

  const selectedModelKey = ref('')

  const defaultModelOption = computed(() => {
    const options = enabledModelOptions.value
    if (!options.length) return undefined

    if (defaultModelKey.value) {
      const matched = options.find((option) => option.key === defaultModelKey.value)
      if (matched) return matched
    }

    return options[0]
  })

  const selectedModel = computed(
    () =>
      enabledModelOptions.value.find((option) => option.key === selectedModelKey.value) ??
      defaultModelOption.value
  )

  const selectedModelLabel = computed(() => {
    if (providersLoading.value) return '加载模型中'
    if (!selectedModel.value) return '未配置模型'
    return selectedModel.value.modelName
  })

  const selectedModelMeta = computed(() => {
    if (!selectedModel.value) return ''
    return selectedModel.value.providerName
  })

  watch(
    [enabledModelOptions, defaultModelKey, currSessionId, sessions],
    () => syncSelectedModel(),
    { deep: true, immediate: true }
  )

  function syncSelectedModel() {
    const options = enabledModelOptions.value
    if (!options.length) {
      selectedModelKey.value = ''
      return
    }

    const currentKeyIsValid = options.some((option) => option.key === selectedModelKey.value)
    const session = getCurrentSession.value

    if (!currSessionId.value) {
      if (!currentKeyIsValid || !selectedModelKey.value) {
        selectedModelKey.value = defaultModelOption.value?.key || ''
      }
      return
    }

    if (session) {
      const providerId = session.providerId || session.defaultProviderId
      const modelId = session.modelId || session.defaultModelId
      const sessionOption = options.find(
        (option) => option.providerId === providerId && option.modelId === modelId
      )

      selectedModelKey.value = sessionOption?.key || defaultModelOption.value?.key || options[0].key
      return
    }

    if (!currentKeyIsValid) {
      selectedModelKey.value = defaultModelOption.value?.key || options[0].key
    }
  }

  async function handleModelChange(value: unknown) {
    const option = enabledModelOptions.value.find((item) => item.key === value)
    if (!option) return
    await selectModel(option)
  }

  async function selectModel(option: ProviderModelOption) {
    selectedModelKey.value = option.key

    if (!currSessionId.value) return

    try {
      await providerStore.setSessionModel({
        sessionId: currSessionId.value,
        providerId: option.providerId,
        modelId: option.modelId,
      })

      const session = getCurrentSession.value
      if (session) {
        session.providerId = option.providerId
        session.defaultProviderId = option.providerId
        session.modelId = option.modelId
        session.defaultModelId = option.modelId
      }
    } catch (error) {
      chatWorkspaceModelLogger.warn('Failed to persist selected model.', {
        sessionId: currSessionId.value,
        providerId: option.providerId,
        modelId: option.modelId,
        error,
      })
      toast.error(error, { description: '会话模型保存失败' })
    }
  }

  function modelSupportsAttachment(type: string) {
    if (type === 'image') return Boolean(selectedModel.value?.input.includes('image'))
    if (type === 'record') return Boolean(selectedModel.value?.input.includes('audio'))
    if (type === 'file')
      return Boolean(
        selectedModel.value?.input.includes('file') || selectedModel.value?.input.includes('text')
      )
    if (type === 'video') return false
    return true
  }

  function attachmentTypeLabel(type: string) {
    if (type === 'image') return '图片'
    if (type === 'record') return '音频'
    if (type === 'video') return '视频'
    return '文件'
  }

  return {
    enabledModelOptions,
    providersLoading,
    selectedModel,
    selectedModelKey,
    selectedModelLabel,
    selectedModelMeta,
    syncSelectedModel,
    handleModelChange,
    selectModel,
    loadProviders: providerStore.loadProviders,
    modelSupportsAttachment,
    attachmentTypeLabel,
  }
}

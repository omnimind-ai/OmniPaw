<script setup lang="ts">
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  SearchIcon,
  XIcon,
} from '@lucide/vue'
import type {
  OmniInferCatalogDownloadFile,
  OmniInferCatalogModel,
  OmniInferCatalogQuantization,
  OmniInferModelCatalogSource,
  OmniInferModelDownloadTask,
} from '@shared/types/omniinfer'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { appBridge, type BridgeUnsubscribe } from '@/bridge/app'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { errorToText, useToast } from '@/utils/toast'
import ProviderModelCapabilityBadges from './ProviderModelCapabilityBadges.vue'
import ProviderOmniInferModelDownloadDetail from './ProviderOmniInferModelDownloadDetail.vue'

const open = defineModel<boolean>('open', { required: true })

const emit = defineEmits<{
  'models-changed': []
}>()

const { t } = useI18n()
const toast = useToast()
const activeSource = ref<OmniInferModelCatalogSource>('omnicore')
const searchQuery = ref('')
const catalogs = ref<Record<OmniInferModelCatalogSource, OmniInferCatalogModel[]>>({
  omnicore: [],
  huggingface: [],
})
const loadingSources = ref<Set<OmniInferModelCatalogSource>>(new Set())
const catalogErrors = ref<Partial<Record<OmniInferModelCatalogSource, string>>>({})
const selectedModelId = ref<string>()
const tasks = ref<OmniInferModelDownloadTask[]>([])
const completedTaskIds = new Set<string>()
let downloadUnsubscribe: BridgeUnsubscribe | undefined

const visibleModels = computed(() => {
  const models = catalogs.value[activeSource.value]
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return models
  return models.filter((model) => {
    return (
      model.name.toLowerCase().includes(query) ||
      model.provider.toLowerCase().includes(query) ||
      model.tags.some((tag) => tag.toLowerCase().includes(query))
    )
  })
})
const activeSourceLoading = computed(() => loadingSources.value.has(activeSource.value))
const selectedModel = computed(() => {
  if (!selectedModelId.value) return undefined
  return catalogs.value[activeSource.value].find((model) => model.id === selectedModelId.value)
})

watch(open, (isOpen) => {
  if (!isOpen) {
    selectedModelId.value = undefined
    return
  }
  void Promise.allSettled([loadTasks(), loadCatalog(activeSource.value)])
})

watch(activeSource, (source) => {
  selectedModelId.value = undefined
  searchQuery.value = ''
  if (open.value) void loadCatalog(source)
})

onMounted(() => {
  downloadUnsubscribe = appBridge.omniinfer.onModelDownloadChanged((task) => {
    upsertTask(task)
    if (task.status === 'completed' && !completedTaskIds.has(task.id)) {
      completedTaskIds.add(task.id)
      toast.success(t('settings.provider.models.download.completed', { model: task.modelName }))
      emit('models-changed')
    }
  })
})

onBeforeUnmount(() => {
  downloadUnsubscribe?.()
  downloadUnsubscribe = undefined
})

async function loadTasks(): Promise<void> {
  const result = await appBridge.omniinfer.listModelDownloads()
  tasks.value = result
  for (const task of result) {
    if (task.status === 'completed') completedTaskIds.add(task.id)
  }
}

async function loadCatalog(source: OmniInferModelCatalogSource, force = false): Promise<void> {
  if (loadingSources.value.has(source)) return
  if (!force && catalogs.value[source].length) return
  loadingSources.value = new Set([...loadingSources.value, source])
  catalogErrors.value[source] = undefined
  try {
    const result = await appBridge.omniinfer.listModelCatalog({
      source,
      query: source === 'huggingface' ? searchQuery.value : undefined,
      limit: 30,
    })
    catalogs.value = {
      ...catalogs.value,
      [source]: result.models,
    }
  } catch (error) {
    const message = errorToText(error, t('settings.provider.models.download.catalogLoadFailed'))
    catalogErrors.value[source] = message
    toast.error(message)
  } finally {
    const next = new Set(loadingSources.value)
    next.delete(source)
    loadingSources.value = next
  }
}

function downloadModelId(
  model: OmniInferCatalogModel,
  quantization: OmniInferCatalogQuantization
): string {
  return `${model.id}-${quantization.id}`
}

function taskFor(
  model: OmniInferCatalogModel,
  quantization: OmniInferCatalogQuantization
): OmniInferModelDownloadTask | undefined {
  const modelId = downloadModelId(model, quantization)
  return tasks.value.find((task) => task.modelId === modelId)
}

function taskIsActive(task: OmniInferModelDownloadTask | undefined): boolean {
  return task?.status === 'queued' || task?.status === 'downloading'
}

async function handleModelAction(
  model: OmniInferCatalogModel,
  quantization: OmniInferCatalogQuantization
): Promise<void> {
  const task = taskFor(model, quantization)
  try {
    if (taskIsActive(task) && task) {
      upsertTask(await appBridge.omniinfer.cancelModelDownload({ taskId: task.id }))
      return
    }
    if (task && (task.status === 'failed' || task.status === 'canceled')) {
      upsertTask(await appBridge.omniinfer.retryModelDownload({ taskId: task.id }))
      return
    }
    if (task?.status === 'completed') return

    const files: OmniInferCatalogDownloadFile[] = quantization.files?.length
      ? [...quantization.files]
      : [
          {
            download: quantization.download,
            sizeGiB: quantization.sizeGiB,
            filename: quantization.filename,
          },
        ]
    if (model.vision) {
      files.push({
        download: model.vision.download,
        sizeGiB: model.vision.sizeGiB,
        filename: model.vision.filename,
      })
    }
    const started = await appBridge.omniinfer.startModelDownload({
      modelId: downloadModelId(model, quantization),
      modelName: model.name,
      source: model.source,
      runtime: model.runtime,
      contextLength: model.contextLength,
      supportsVision: supportsVision(model),
      supportsThinking: supportsThinking(model),
      files,
    })
    upsertTask(started)
    toast.success(t('settings.provider.models.download.started', { model: model.name }))
  } catch (error) {
    toast.error(error, { description: t('settings.provider.models.download.startFailed') })
  }
}

function upsertTask(task: OmniInferModelDownloadTask): void {
  const index = tasks.value.findIndex((item) => item.id === task.id)
  if (index < 0) {
    tasks.value = [task, ...tasks.value]
    return
  }
  const next = [...tasks.value]
  next[index] = task
  tasks.value = next
}

function supportsVision(model: OmniInferCatalogModel): boolean {
  return (
    Boolean(model.vision) ||
    model.tags.some((tag) => ['vision', '视觉模型'].includes(tag.toLowerCase()))
  )
}

function supportsThinking(model: OmniInferCatalogModel): boolean {
  return model.tags.some((tag) => ['thinking', 'reasoning', '深度思考'].includes(tag.toLowerCase()))
}

function formatCount(value?: number): string {
  if (!value) return ''
  return new Intl.NumberFormat(undefined, { notation: 'compact' }).format(value)
}

function refreshCatalog(): void {
  void loadCatalog(activeSource.value, true)
}

function searchHuggingFace(): void {
  if (activeSource.value !== 'huggingface') return
  void loadCatalog('huggingface', true)
}

function openModelDetail(model: OmniInferCatalogModel): void {
  selectedModelId.value = model.id
}

function closeModelDetail(): void {
  selectedModelId.value = undefined
}

function handleSelectedModelAction(quantization: OmniInferCatalogQuantization): void {
  if (!selectedModel.value) return
  void handleModelAction(selectedModel.value, quantization)
}
</script>

<template>
  <Sheet v-model:open="open">
    <SheetContent
      side="right"
      class="w-full gap-0 p-0 sm:max-w-4xl"
      :show-close-button="false"
    >
      <SheetHeader class="flex-row items-start gap-3 px-5 py-4 text-left">
        <Button
          v-if="selectedModel"
          type="button"
          variant="ghost"
          size="icon"
          :aria-label="t('settings.provider.models.download.backToCatalog')"
          @click="closeModelDetail"
        >
          <ArrowLeftIcon />
        </Button>
        <div class="min-w-0 flex-1">
          <SheetTitle class="truncate">
            {{
              selectedModel?.name ||
              t('settings.provider.models.download.title')
            }}
          </SheetTitle>
          <SheetDescription class="truncate">
            {{
              selectedModel?.repoId ||
              selectedModel?.provider ||
              t('settings.provider.models.download.description')
            }}
          </SheetDescription>
        </div>
        <SheetClose as-child>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            :aria-label="t('settings.provider.models.download.close')"
          >
            <XIcon />
          </Button>
        </SheetClose>
      </SheetHeader>

      <Separator />

      <div
        v-if="!selectedModel"
        class="flex min-h-0 flex-1 flex-col"
      >
        <div class="flex flex-col gap-3 border-b px-5 py-4">
          <Tabs
            v-model="activeSource"
            activation-mode="manual"
          >
            <TabsList class="w-full">
              <TabsTrigger
                value="omnicore"
                class="flex-1"
              >
                {{ t('settings.provider.models.download.sources.omniCore') }}
              </TabsTrigger>
              <TabsTrigger
                value="huggingface"
                class="flex-1"
              >
                {{ t('settings.provider.models.download.sources.huggingFace') }}
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <InputGroup>
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              v-model="searchQuery"
              :placeholder="t('settings.provider.models.download.searchPlaceholder')"
              :aria-label="t('settings.provider.models.download.search')"
              @keyup.enter="searchHuggingFace"
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                v-if="activeSource === 'huggingface'"
                :aria-label="t('settings.provider.models.download.search')"
                @click="searchHuggingFace"
              >
                {{ t('settings.provider.models.download.search') }}
              </InputGroupButton>
              <InputGroupButton
                size="icon-xs"
                :aria-label="t('settings.provider.models.download.refresh')"
                @click="refreshCatalog"
              >
                <RefreshCwIcon
                  :class="{ 'animate-spin': activeSourceLoading }"
                />
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <div
            v-if="activeSourceLoading && !catalogs[activeSource].length"
            class="flex flex-col gap-3"
          >
            <Skeleton class="h-36 w-full" />
            <Skeleton class="h-36 w-full" />
            <Skeleton class="h-36 w-full" />
          </div>

          <Card
            v-else-if="catalogErrors[activeSource]"
            class="gap-3"
          >
            <CardHeader>
              <CardTitle>{{ t('settings.provider.models.download.catalogLoadFailed') }}</CardTitle>
              <CardDescription>{{ catalogErrors[activeSource] }}</CardDescription>
            </CardHeader>
            <CardFooter>
              <Button
                type="button"
                variant="outline"
                @click="refreshCatalog"
              >
                <RotateCcwIcon data-icon="inline-start" />
                {{ t('settings.provider.models.download.retry') }}
              </Button>
            </CardFooter>
          </Card>

          <Card
            v-else-if="!visibleModels.length"
            class="gap-3"
          >
            <CardHeader>
              <CardTitle>{{ t('settings.provider.models.download.emptyTitle') }}</CardTitle>
              <CardDescription>
                {{ t('settings.provider.models.download.emptyDescription') }}
              </CardDescription>
            </CardHeader>
          </Card>

          <div
            v-else
            class="flex flex-col gap-3"
          >
            <Card
              v-for="model in visibleModels"
              :key="model.id"
              class="gap-3 py-4"
            >
              <CardHeader class="gap-2 px-4">
                <div class="flex min-w-0 items-start justify-between gap-3">
                  <div class="min-w-0">
                    <CardTitle class="truncate text-sm">{{ model.name }}</CardTitle>
                    <CardDescription class="truncate">
                      {{ model.provider }}
                      <template v-if="model.downloads">
                        · {{ t('settings.provider.models.download.downloadCount', { count: formatCount(model.downloads) }) }}
                      </template>
                    </CardDescription>
                  </div>
                  <ProviderModelCapabilityBadges
                    :supports-reasoning="supportsThinking(model)"
                    :supports-vision="supportsVision(model)"
                  />
                </div>
              </CardHeader>

              <CardFooter class="justify-end px-4">
                <Button
                  type="button"
                  variant="outline"
                  @click="openModelDetail(model)"
                >
                  {{ t('settings.provider.models.download.viewDetails') }}
                  <ArrowRightIcon data-icon="inline-end" />
                </Button>
              </CardFooter>
            </Card>
          </div>
        </div>
      </div>

      <div
        v-else
        class="min-h-0 flex-1 overflow-y-auto"
      >
        <ProviderOmniInferModelDownloadDetail
          :model="selectedModel"
          :tasks="tasks"
          @action="handleSelectedModelAction"
        />
      </div>

      <Separator />
      <SheetFooter class="flex-row items-center justify-between gap-3 p-4">
        <span class="text-xs text-muted-foreground">
          {{
            selectedModel
              ? t('settings.provider.models.download.variantsFound', {
                  count: selectedModel.quantizations.length,
                })
              : t('settings.provider.models.download.modelsFound', {
                  count: visibleModels.length,
                })
          }}
        </span>
        <Button
          v-if="selectedModel"
          type="button"
          variant="outline"
          @click="closeModelDetail"
        >
          <ArrowLeftIcon data-icon="inline-start" />
          {{ t('settings.provider.models.download.backToCatalog') }}
        </Button>
        <SheetClose
          v-else
          as-child
        >
          <Button
            type="button"
            variant="outline"
          >
            {{ t('settings.provider.models.download.close') }}
          </Button>
        </SheetClose>
      </SheetFooter>
    </SheetContent>
  </Sheet>
</template>

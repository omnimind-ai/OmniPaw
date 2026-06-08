<script setup lang="ts">
import type {
  CompanionMemoryItem,
  CompanionMemoryKind,
  CompanionMemoryStatus,
} from '@shared/types/memory'
import {
  ArchiveIcon,
  BrainIcon,
  CheckIcon,
  FileTextIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
} from 'lucide-vue-next'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import type { BridgeDesktopSettingsConfig } from '@/bridge/app'
import SettingEntry from '@/components/settings/common/SettingEntry.vue'
import SettingsPanelHeader from '@/components/settings/common/SettingsPanelHeader.vue'
import SettingsPanelItem from '@/components/settings/common/SettingsPanelItem.vue'
import SettingsSearchBar from '@/components/settings/common/SettingsSearchBar.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
import { useMemoryStore } from '@/stores/memory'
import { errorToText, useToast } from '@/utils/toast'

const props = defineProps<{
  draft: BridgeDesktopSettingsConfig
}>()

const toast = useToast()
const memoryStore = useMemoryStore()
const { items, selected, loading, saving, total } = storeToRefs(memoryStore)

const searchQuery = ref('')
const includeInactive = ref(false)
const editText = ref('')
const createOpen = ref(false)
const createText = ref('')
const createKind = ref<CompanionMemoryKind>('fact')
const createImportance = ref(3)

const memorySettings = computed(() => props.draft.app.memory)
const extractionEnabled = computed({
  get: () => memorySettings.value.extractionEnabled,
  set: (value: boolean) => {
    memorySettings.value.extractionEnabled = value
  },
})
const retrievalEnabled = computed({
  get: () => memorySettings.value.retrievalEnabled,
  set: (value: boolean) => {
    memorySettings.value.retrievalEnabled = value
  },
})
const memoryEnabled = computed({
  get: () => memorySettings.value.enabled,
  set: (value: boolean) => {
    memorySettings.value.enabled = value
  },
})
const minConfidencePercent = computed({
  get: () => Math.round(memorySettings.value.minConfidence * 100),
  set: (value: string | number) => {
    memorySettings.value.minConfidence = clampInteger(value, 0, 100) / 100
  },
})
const maxContextItems = computed({
  get: () => memorySettings.value.maxContextItems,
  set: (value: string | number) => {
    memorySettings.value.maxContextItems = clampInteger(value, 0, 24)
  },
})
const maxContextTokens = computed({
  get: () => memorySettings.value.maxContextTokens,
  set: (value: string | number) => {
    memorySettings.value.maxContextTokens = clampInteger(value, 0, 4000)
  },
})

const selectedMemory = computed(() => selected.value?.memory)
const selectedSources = computed(() => selected.value?.sources ?? [])

onMounted(() => {
  void reload()
})

watch(selectedMemory, (memory) => {
  editText.value = memory?.content ?? ''
})

async function reload(): Promise<void> {
  try {
    const filters = {
      query: searchQuery.value.trim() || undefined,
      includeInactive: includeInactive.value,
      limit: 100,
    }
    if (filters.query) {
      await memoryStore.search(filters)
    } else {
      await memoryStore.load(filters)
    }
  } catch (error) {
    toast.error(errorToText(error, '记忆列表加载失败。'))
  }
}

async function inspect(memory: CompanionMemoryItem): Promise<void> {
  try {
    await memoryStore.inspect(memory.id)
  } catch (error) {
    toast.error(errorToText(error, '记忆详情加载失败。'))
  }
}

async function saveEdit(): Promise<void> {
  const memory = selectedMemory.value
  if (!memory) return
  try {
    const updated = await memoryStore.update({
      memoryId: memory.id,
      content: editText.value,
    })
    if (updated) {
      await memoryStore.inspect(updated.id)
      await reload()
      toast.success('记忆已保存。')
    }
  } catch (error) {
    toast.error(errorToText(error, '记忆保存失败。'))
  }
}

async function createMemory(): Promise<void> {
  const content = createText.value.trim()
  if (!content) return
  try {
    const memory = await memoryStore.create({
      kind: createKind.value,
      scope: 'user',
      content,
      importance: createImportance.value,
      confidence: 1,
    })
    createText.value = ''
    createOpen.value = false
    await reload()
    await memoryStore.inspect(memory.id)
    toast.success('记忆已创建。')
  } catch (error) {
    toast.error(errorToText(error, '记忆创建失败。'))
  }
}

async function archiveMemory(memory: CompanionMemoryItem): Promise<void> {
  try {
    await memoryStore.archive(memory.id)
    await reload()
    if (selectedMemory.value?.id === memory.id) {
      await memoryStore.inspect(memory.id)
    }
    toast.success('记忆已归档。')
  } catch (error) {
    toast.error(errorToText(error, '记忆归档失败。'))
  }
}

async function deleteMemory(memory: CompanionMemoryItem): Promise<void> {
  try {
    await memoryStore.deleteMemory(memory.id)
    if (selectedMemory.value?.id === memory.id) {
      selected.value = null
    }
    await reload()
    toast.success('记忆已删除。')
  } catch (error) {
    toast.error(errorToText(error, '记忆删除失败。'))
  }
}

async function setImportance(memory: CompanionMemoryItem, delta: number): Promise<void> {
  const importance = clampInteger(memory.importance + delta, 1, 5)
  try {
    const updated = await memoryStore.setImportance(memory.id, importance)
    await reload()
    if (updated && selectedMemory.value?.id === memory.id) {
      await memoryStore.inspect(memory.id)
    }
  } catch (error) {
    toast.error(errorToText(error, '重要度更新失败。'))
  }
}

function labelKind(kind: CompanionMemoryKind): string {
  const labels: Record<CompanionMemoryKind, string> = {
    profile: '画像',
    preference: '偏好',
    relationship: '关系',
    episode: '经历',
    plan: '计划',
    boundary: '边界',
    fact: '事实',
  }
  return labels[kind]
}

function labelStatus(status: CompanionMemoryStatus): string {
  const labels: Record<CompanionMemoryStatus, string> = {
    active: '活跃',
    archived: '归档',
    deleted: '删除',
    disabled: '停用',
  }
  return labels[status]
}

function formatDate(value?: number): string {
  return value ? new Date(value).toLocaleString() : '未知'
}

function clampInteger(value: string | number, min: number, max: number): number {
  const next = Math.round(Number(value))
  if (!Number.isFinite(next)) return min
  return Math.min(max, Math.max(min, next))
}
</script>

<template>
  <Card class="grid h-full min-h-0 flex-1 grid-rows-[auto_auto_auto_minmax(0,1fr)]">
    <SettingsPanelHeader
      title="伙伴记忆"
      description="管理普通聊天和桌面伙伴会话使用的长期记忆。酒馆、主动视觉和计划任务不会参与这条记忆流水线。"
      :icon="BrainIcon"
    >
      <template #action>
        <Button
          type="button"
          variant="outline"
          size="sm"
          @click="createOpen = !createOpen"
        >
          <PlusIcon data-icon="inline-start" />
          新建
        </Button>
      </template>
    </SettingsPanelHeader>

    <div class="border-b px-4 py-3 sm:px-5">
      <FieldGroup class="gap-0">
        <SettingEntry
          control-id="memory-enabled"
          title="启用伙伴记忆"
          description="关闭后停止自动提取和检索。"
        >
          <Switch
            id="memory-enabled"
            v-model="memoryEnabled"
            aria-label="启用伙伴记忆"
          />
        </SettingEntry>

        <SettingEntry
          control-id="memory-extraction"
          title="自动提取"
          description="成功回复后异步提取新记忆，不会自动覆盖或删除已有记忆。"
        >
          <Switch
            id="memory-extraction"
            v-model="extractionEnabled"
            :disabled="!memoryEnabled"
            aria-label="自动提取记忆"
          />
        </SettingEntry>

        <SettingEntry
          control-id="memory-retrieval"
          title="上下文检索"
          description="发送前检索相关记忆，并按预算作为独立上下文单元注入。"
        >
          <Switch
            id="memory-retrieval"
            v-model="retrievalEnabled"
            :disabled="!memoryEnabled"
            aria-label="上下文检索记忆"
          />
        </SettingEntry>

        <SettingEntry
          control-id="memory-budget"
          title="检索预算"
          description="限制每次请求可选记忆数量、token 预算和最低置信度。"
          control-class="flex-wrap"
        >
          <Input
            id="memory-budget"
            v-model="maxContextItems"
            type="number"
            min="0"
            max="24"
            class="h-8 w-20"
            aria-label="最大记忆条数"
          />
          <Input
            v-model="maxContextTokens"
            type="number"
            min="0"
            max="4000"
            class="h-8 w-24"
            aria-label="最大记忆 token"
          />
          <Input
            v-model="minConfidencePercent"
            type="number"
            min="0"
            max="100"
            class="h-8 w-20"
            aria-label="最低置信度百分比"
          />
        </SettingEntry>
      </FieldGroup>
    </div>

    <div
      v-if="createOpen"
      class="flex flex-col gap-3 border-b px-4 py-3 sm:px-5"
    >
      <div class="flex flex-wrap items-center gap-2">
        <Select v-model="createKind">
          <SelectTrigger class="h-8 w-32">
            <SelectValue placeholder="类型" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="fact">事实</SelectItem>
              <SelectItem value="preference">偏好</SelectItem>
              <SelectItem value="profile">画像</SelectItem>
              <SelectItem value="relationship">关系</SelectItem>
              <SelectItem value="episode">经历</SelectItem>
              <SelectItem value="plan">计划</SelectItem>
              <SelectItem value="boundary">边界</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
        <Input
          v-model="createImportance"
          type="number"
          min="1"
          max="5"
          class="h-8 w-24"
          aria-label="新记忆重要度"
        />
      </div>
      <Textarea
        v-model="createText"
        rows="3"
        placeholder="输入要保存的记忆内容"
      />
      <div class="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          @click="createOpen = false"
        >
          取消
        </Button>
        <Button
          type="button"
          size="sm"
          :disabled="saving || !createText.trim()"
          @click="createMemory"
        >
          <CheckIcon data-icon="inline-start" />
          保存
        </Button>
      </div>
    </div>

    <SettingsSearchBar
      v-model="searchQuery"
      placeholder="搜索记忆内容"
      :disabled="loading"
      @clear="reload"
      @keyup.enter="reload"
    >
      <template #summary>
        <Badge variant="secondary">{{ total }} 条</Badge>
        <Badge
          v-if="includeInactive"
          variant="outline"
        >
          包含非活跃
        </Badge>
      </template>
      <template #actions>
        <Button
          type="button"
          variant="outline"
          size="sm"
          @click="includeInactive = !includeInactive; reload()"
        >
          {{ includeInactive ? '仅活跃' : '含归档' }}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label="刷新记忆"
          :disabled="loading"
          @click="reload"
        >
          <RefreshCwIcon />
        </Button>
      </template>
    </SettingsSearchBar>

    <CardContent class="min-h-0 overflow-y-auto p-0">
      <div class="grid min-h-full gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)]">
        <div class="flex min-h-0 flex-col gap-3">
          <div
            v-if="loading"
            class="rounded-md border bg-background/40 px-4 py-8 text-sm text-muted-foreground"
          >
            正在加载记忆。
          </div>
          <div
            v-else-if="!items.length"
            class="flex min-h-64 flex-col items-center justify-center rounded-md border bg-background/40 px-4 py-8 text-sm text-muted-foreground"
          >
            没有匹配的记忆。
          </div>
          <SettingsPanelItem
            v-for="memory in items"
            :key="memory.id"
            :title="labelKind(memory.kind)"
            :description="memory.content"
            :icon="FileTextIcon"
            :pending="saving"
            :class="selectedMemory?.id === memory.id ? 'border-primary/60 bg-primary/5' : undefined"
            @click="inspect(memory)"
          >
            <template #badges>
              <Badge variant="secondary">{{ labelStatus(memory.status) }}</Badge>
              <Badge variant="outline">重要度 {{ memory.importance }}</Badge>
              <Badge variant="outline">{{ Math.round(memory.confidence * 100) }}%</Badge>
            </template>
            <template #meta>
              <div class="text-xs text-muted-foreground">
                更新于 {{ formatDate(memory.updatedAt) }}
              </div>
            </template>
            <template #actions>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="降低重要度"
                :disabled="saving || memory.importance <= 1"
                @click.stop="setImportance(memory, -1)"
              >
                -
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="提高重要度"
                :disabled="saving || memory.importance >= 5"
                @click.stop="setImportance(memory, 1)"
              >
                +
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="归档记忆"
                :disabled="saving || memory.status !== 'active'"
                @click.stop="archiveMemory(memory)"
              >
                <ArchiveIcon />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="删除记忆"
                :disabled="saving"
                @click.stop="deleteMemory(memory)"
              >
                <Trash2Icon />
              </Button>
            </template>
          </SettingsPanelItem>
        </div>

        <aside class="flex min-h-64 flex-col gap-3 rounded-md border bg-background/40 p-4">
          <template v-if="selectedMemory">
            <div class="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{{ labelKind(selectedMemory.kind) }}</Badge>
              <Badge variant="outline">{{ labelStatus(selectedMemory.status) }}</Badge>
              <Badge variant="outline">重要度 {{ selectedMemory.importance }}</Badge>
            </div>
            <Textarea
              v-model="editText"
              rows="8"
              aria-label="编辑记忆内容"
            />
            <Button
              type="button"
              size="sm"
              :disabled="saving || editText.trim() === selectedMemory.content"
              @click="saveEdit"
            >
              <CheckIcon data-icon="inline-start" />
              保存编辑
            </Button>
            <div class="space-y-2 text-xs text-muted-foreground">
              <div>创建于 {{ formatDate(selectedMemory.createdAt) }}</div>
              <div>最近更新 {{ formatDate(selectedMemory.updatedAt) }}</div>
              <div>来源 {{ selectedSources.length }} 条</div>
              <div
                v-for="source in selectedSources"
                :key="source.id"
                class="rounded-md bg-muted/50 px-3 py-2"
              >
                {{ source.sourceKind }} · {{ formatDate(source.sourceCreatedAt || source.createdAt) }}
              </div>
            </div>
          </template>
          <div
            v-else
            class="flex flex-1 items-center justify-center text-sm text-muted-foreground"
          >
            选择一条记忆查看详情。
          </div>
        </aside>
      </div>
    </CardContent>
  </Card>
</template>

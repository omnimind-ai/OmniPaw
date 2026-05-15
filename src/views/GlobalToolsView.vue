<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import { appBridge } from '@/bridge/app'
import { useModuleI18n } from '@/i18n/composables'

type ToolApi = {
  list: () => Promise<unknown[]>
  setEnabled?: (request: { name: string; enabled: boolean }) => Promise<unknown>
}

type ToolRecord = Record<string, unknown>

interface GlobalTool {
  name: string
  description: string
  source: string
  risk: string
  profiles: string[]
  enabled: boolean
  schema: unknown
  details: ToolRecord
}

const { tm } = useModuleI18n('features/global-tools')
const router = useRouter()

const tools = ref<GlobalTool[]>([])
const loading = ref(false)
const error = ref('')
const actionError = ref('')
const expanded = ref<Set<string>>(new Set())
const pendingByName = ref<Record<string, boolean>>({})

const enabledCount = computed(() => tools.value.filter((tool) => tool.enabled).length)

function asRecord(value: unknown): ToolRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as ToolRecord
    : {}
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value : fallback
}

function booleanValue(value: unknown): boolean {
  return value === true
}

function arrayValue(value: unknown): string[] {
  if (!Array.isArray(value)) return []

  return value
    .map((item) => String(item))
    .filter(Boolean)
}

function normalizeTool(rawTool: unknown): GlobalTool {
  const record = asRecord(rawTool)
  const name = stringValue(record.name, stringValue(record.id, tm('unknownName')))
  const schema = record.parameters ?? record.parameterSchema ?? record.inputSchema ?? record.schema ?? null
  const description = stringValue(record.description, tm('noDescription'))
  const source = stringValue(record.source, tm('unknownSource'))
  const risk = stringValue(record.risk, tm('unknownRisk'))
  const profiles = arrayValue(record.profiles ?? record.profileNames ?? record.allowedProfiles)

  return {
    name,
    description,
    source,
    risk,
    profiles,
    enabled: booleanValue(record.enabled),
    schema,
    details: record,
  }
}

function getToolsApi(): ToolApi | null {
  return appBridge.tools ?? null
}

function prettyJson(value: unknown): string {
  if (value == null) return tm('emptySchema')

  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function isExpanded(name: string): boolean {
  return expanded.value.has(name)
}

function toggleExpanded(name: string): void {
  const next = new Set(expanded.value)

  if (next.has(name)) {
    next.delete(name)
  } else {
    next.add(name)
  }

  expanded.value = next
}

async function loadTools(): Promise<void> {
  loading.value = true
  error.value = ''
  actionError.value = ''

  try {
    const api = getToolsApi()
    if (!api) {
      throw new Error(tm('errors.unavailable'))
    }

    const response = await api.list()
    const responseRecord = asRecord(response)
    const rawTools = Array.isArray(response)
      ? response
      : Array.isArray(responseRecord.tools)
        ? responseRecord.tools
        : []

    tools.value = rawTools.map(normalizeTool)
  } catch (err) {
    error.value = err instanceof Error ? err.message : tm('errors.loadFailed')
  } finally {
    loading.value = false
  }
}

async function setToolEnabled(tool: GlobalTool, enabled: boolean): Promise<void> {
  const api = getToolsApi()
  const previous = tool.enabled

  if (!api?.setEnabled) {
    actionError.value = tm('errors.setEnabledUnavailable')
    return
  }

  actionError.value = ''
  pendingByName.value = { ...pendingByName.value, [tool.name]: true }
  tool.enabled = enabled

  try {
    const response = await api.setEnabled({ name: tool.name, enabled })
    const responseRecord = asRecord(response)
    if (Array.isArray(responseRecord.tools)) {
      tools.value = responseRecord.tools.map(normalizeTool)
    } else if (responseRecord.tool) {
      const updated = normalizeTool(responseRecord.tool)
      tools.value = tools.value.map((item) => item.name === updated.name ? updated : item)
    }
  } catch (err) {
    tool.enabled = previous
    actionError.value = err instanceof Error ? err.message : tm('errors.saveFailed')
  } finally {
    const { [tool.name]: _finished, ...rest } = pendingByName.value
    pendingByName.value = rest
  }
}

async function goBack(): Promise<void> {
  if (window.history.length > 1) {
    router.back()
    return
  }
  await router.push('/chat')
}

async function closePage(): Promise<void> {
  await router.push('/chat')
}
</script>

<template>
  <main class="page-view global-tools-view">
    <header class="tools-topbar">
      <button class="icon-action" type="button" :aria-label="tm('actions.back')" @click="goBack">
        <span aria-hidden="true">‹</span>
      </button>
      <div class="topbar-title">
        <p class="eyebrow">{{ tm('eyebrow') }}</p>
        <h1>{{ tm('title') }}</h1>
      </div>
      <div class="topbar-actions">
        <button class="secondary-button" type="button" :disabled="loading" @click="loadTools">
          {{ loading ? tm('loading') : tm('refresh') }}
        </button>
        <button class="icon-action" type="button" :aria-label="tm('actions.close')" @click="closePage">
          <span aria-hidden="true">×</span>
        </button>
      </div>
    </header>

    <p class="page-subtitle">{{ tm('subtitle') }}</p>

    <section class="toolbar-row">
      <div class="summary-line">
        {{ tm('summary', { enabled: enabledCount, total: tools.length }) }}
      </div>
    </section>

    <p v-if="actionError" class="inline-error" role="alert">{{ actionError }}</p>

    <section v-if="loading" class="empty-state">
      <h2>{{ tm('loading') }}</h2>
      <p>{{ tm('loadingDescription') }}</p>
    </section>

    <section v-else-if="error" class="empty-state error-state" role="alert">
      <h2>{{ tm('errors.title') }}</h2>
      <p>{{ error }}</p>
      <button class="secondary-button" type="button" @click="loadTools">{{ tm('retry') }}</button>
    </section>

    <section v-else-if="!tools.length" class="empty-state">
      <h2>{{ tm('empty.title') }}</h2>
      <p>{{ tm('empty.description') }}</p>
    </section>

    <section v-else class="tools-list">
      <article v-for="tool in tools" :key="tool.name" class="tool-card">
        <div class="tool-card-main">
          <div class="tool-copy">
            <h2>{{ tool.name }}</h2>
            <p>{{ tool.description }}</p>
            <div class="tool-meta">
              <span>{{ tm('fields.source') }}: {{ tool.source }}</span>
              <span>{{ tm('fields.risk') }}: {{ tool.risk }}</span>
              <span>
                {{ tm('fields.profiles') }}:
                {{ tool.profiles.length ? tool.profiles.join(', ') : tm('noProfiles') }}
              </span>
            </div>
          </div>

          <label class="switch-control">
            <input
              type="checkbox"
              :checked="tool.enabled"
              :disabled="pendingByName[tool.name]"
              @change="setToolEnabled(tool, ($event.target as HTMLInputElement).checked)"
            >
            <span class="switch-track" aria-hidden="true" />
            <span>{{ tool.enabled ? tm('enabled') : tm('disabled') }}</span>
          </label>
        </div>

        <button class="details-toggle" type="button" @click="toggleExpanded(tool.name)">
          {{ isExpanded(tool.name) ? tm('details.hide') : tm('details.show') }}
        </button>

        <div v-if="isExpanded(tool.name)" class="tool-details">
          <div>
            <h3>{{ tm('details.schema') }}</h3>
            <pre>{{ prettyJson(tool.schema) }}</pre>
          </div>
          <div>
            <h3>{{ tm('details.raw') }}</h3>
            <pre>{{ prettyJson(tool.details) }}</pre>
          </div>
        </div>
      </article>
    </section>
  </main>
</template>

<style scoped>
.global-tools-view {
  width: min(100%, 1120px);
  min-height: 100vh;
  margin: 0 auto;
  padding: 28px 32px 48px;
  color: #f7f4ed;
}

.tools-topbar {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 16px;
  max-width: 960px;
}

.topbar-title {
  min-width: 0;
}

.topbar-title h1 {
  margin: 4px 0 0;
}

.topbar-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.icon-action {
  display: inline-grid;
  width: 40px;
  height: 40px;
  place-items: center;
  border: 1px solid #4b4740;
  border-radius: 8px;
  background: #221f1a;
  color: #f7f4ed;
  font-size: 28px;
  font-weight: 700;
  line-height: 1;
}

.icon-action:hover {
  border-color: #8b3f2b;
  background: #2c2721;
}

.page-subtitle {
  margin: 12px 0 0;
  max-width: 960px;
  color: #8f877b;
  line-height: 1.7;
}

.toolbar-row {
  display: flex;
  max-width: 960px;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-top: 34px;
  border-top: 1px solid #6b6256;
  padding-top: 18px;
}

.summary-line {
  color: #8f877b;
  font-size: 14px;
  font-weight: 700;
}

.secondary-button,
.details-toggle {
  min-height: 36px;
  border: 1px solid #cbbda8;
  border-radius: 6px;
  padding: 0 14px;
  background: #fffaf0;
  color: #221f1a;
  font-weight: 800;
}

.secondary-button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.inline-error {
  max-width: 960px;
  margin: 16px 0 0;
  border: 1px solid #d98773;
  border-radius: 6px;
  padding: 10px 12px;
  background: #fff2ee;
  color: #8b3f2b;
}

.error-state {
  border-color: #d98773;
}

.tools-list {
  display: grid;
  max-width: 960px;
  gap: 16px;
  margin-top: 22px;
}

.tool-card {
  border: 1px solid #d8ccbc;
  border-radius: 8px;
  padding: 18px;
  background: #fffdf8;
}

.tool-card-main {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}

.tool-copy {
  min-width: 0;
}

.tool-copy h2 {
  color: #221f1a;
  overflow-wrap: anywhere;
}

.tool-copy p {
  margin: 8px 0 0;
  color: #6c6358;
  line-height: 1.7;
}

.tool-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.tool-meta span {
  border: 1px solid #ded2bf;
  border-radius: 999px;
  padding: 5px 10px;
  background: #f7f4ed;
  color: #5f594f;
  font-size: 12px;
  font-weight: 700;
}

.switch-control {
  display: grid;
  min-width: 92px;
  justify-items: center;
  gap: 7px;
  color: #5f594f;
  font-size: 12px;
  font-weight: 800;
}

.switch-control input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.switch-track {
  position: relative;
  width: 46px;
  height: 26px;
  border: 1px solid #cbbda8;
  border-radius: 999px;
  background: #e9dfd0;
}

.switch-track::after {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  background: #fffdf8;
  box-shadow: 0 1px 2px rgb(34 31 26 / 20%);
  content: "";
  transition: transform 0.16s ease;
}

.switch-control input:checked + .switch-track {
  border-color: #8b3f2b;
  background: #8b3f2b;
}

.switch-control input:checked + .switch-track::after {
  transform: translateX(20px);
}

.switch-control input:disabled + .switch-track {
  opacity: 0.55;
}

.details-toggle {
  margin-top: 16px;
}

.tool-details {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin-top: 16px;
}

.tool-details h3 {
  margin: 0 0 8px;
  font-size: 13px;
}

.tool-details pre {
  max-height: 320px;
  overflow: auto;
  margin: 0;
  border: 1px solid #ded2bf;
  border-radius: 6px;
  padding: 12px;
  background: #221f1a;
  color: #f7f4ed;
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

@media (max-width: 760px) {
  .toolbar-row,
  .tools-topbar,
  .tool-card-main,
  .tool-details {
    display: grid;
    grid-template-columns: 1fr;
  }

  .topbar-actions {
    justify-content: space-between;
  }

  .switch-control {
    justify-items: start;
  }
}
</style>

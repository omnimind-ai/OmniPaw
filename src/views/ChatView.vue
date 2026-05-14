<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'

import { appBridge } from '@/bridge/app'
import { useChatStore } from '@/stores/chat'
import { useProviderStore } from '@/stores/provider'
import type { Unsubscribe } from '@shared/types/bridge'

const chat = useChatStore()
const providerStore = useProviderStore()

let unsubscribeToken: Unsubscribe | undefined
let unsubscribeDone: Unsubscribe | undefined

onMounted(async () => {
  await Promise.all([chat.loadSessions(), providerStore.loadProviders()])

  unsubscribeToken = appBridge.chat.onToken((token) => {
    chat.appendToken(token)
  })

  unsubscribeDone = appBridge.chat.onDone(() => {
    chat.finishStream()
  })
})

onUnmounted(() => {
  unsubscribeToken?.()
  unsubscribeDone?.()
})
</script>

<template>
  <main class="workspace">
    <section class="session-pane" aria-label="会话列表">
      <div class="pane-header">
        <div>
          <p class="eyebrow">Sessions</p>
          <h1>OpenOmniClaw</h1>
        </div>
        <button class="icon-button" type="button" aria-label="新建会话" @click="chat.createSession">
          +
        </button>
      </div>

      <button
        v-for="session in chat.sessions"
        :key="session.id"
        class="session-item"
        :class="{ active: session.id === chat.activeSessionId }"
        type="button"
        @click="chat.activeSessionId = session.id"
      >
        <span>{{ session.title }}</span>
        <small>{{ session.modelId }}</small>
      </button>
    </section>

    <section class="chat-pane" aria-label="对话">
      <header class="chat-header">
        <div>
          <p class="eyebrow">Current Chat</p>
          <h2>{{ chat.activeSession?.title ?? '未选择会话' }}</h2>
        </div>
        <div class="status-chip">IPC ready</div>
      </header>

      <div class="message-stream">
        <article class="message assistant">
          <p>工程骨架已就绪：Electron main 负责 Core 层，Vue renderer 通过 preload 暴露的安全 IPC 调用业务。</p>
        </article>
        <article v-if="chat.streamingText" class="message assistant streaming">
          <p>{{ chat.streamingText }}</p>
        </article>
      </div>

      <form class="composer" @submit.prevent="chat.sendDraft">
        <textarea
          v-model="chat.draft"
          rows="3"
          placeholder="输入一条消息以验证 IPC 流式推送..."
          :disabled="chat.isStreaming"
        />
        <button type="submit" :disabled="chat.isStreaming || !chat.draft.trim()">
          {{ chat.isStreaming ? '生成中' : '发送' }}
        </button>
      </form>
    </section>

    <aside class="inspector" aria-label="运行概览">
      <section class="inspector-block">
        <p class="eyebrow">Providers</p>
        <h2>模型入口</h2>
        <div v-for="provider in providerStore.providers" :key="provider.id" class="data-row">
          <span>{{ provider.name }}</span>
          <small>{{ provider.enabled ? 'enabled' : 'disabled' }}</small>
        </div>
      </section>

      <section class="inspector-block">
        <p class="eyebrow">MVP Scope</p>
        <h2>下一步模块</h2>
        <ul class="scope-list">
          <li>SQLite 会话持久化</li>
          <li>OpenAI 兼容流式 Provider</li>
          <li>Skill 注册与开关</li>
          <li>Cron 任务执行日志</li>
        </ul>
      </section>
    </aside>
  </main>
</template>

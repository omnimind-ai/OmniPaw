<script setup lang="ts">
import { onMounted, ref } from 'vue'

import { appBridge } from '@/bridge/app'
import type { CronTask } from '@shared/types/cron'

const tasks = ref<CronTask[]>([])

onMounted(async () => {
  tasks.value = (await appBridge.cron.list()) as CronTask[]
})
</script>

<template>
  <main class="page-view">
    <header class="page-heading">
      <p class="eyebrow">Automation</p>
      <h1>定时任务</h1>
    </header>

    <section class="empty-state">
      <h2>暂无任务</h2>
      <p>骨架已包含 Cron manager 与 IPC 通道，后续可接入 croner 和执行日志。</p>
    </section>
  </main>
</template>

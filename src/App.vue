<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink, RouterView } from 'vue-router'

import { appBridge } from '@/bridge/app'
import type { AppInfo } from '@shared/types/app'

const appInfo = ref<AppInfo>()

onMounted(async () => {
  appInfo.value = await appBridge.app.getInfo()
})
</script>

<template>
  <div class="app-shell">
    <aside class="rail" aria-label="主导航">
      <div class="brand-mark" aria-hidden="true">OC</div>
      <nav class="rail-nav">
        <RouterLink to="/">对话</RouterLink>
        <RouterLink to="/skills">Skills</RouterLink>
        <RouterLink to="/cron">定时</RouterLink>
        <RouterLink to="/settings">设置</RouterLink>
      </nav>
      <div class="runtime-pill">
        {{ appInfo?.version ? `v${appInfo.version}` : '...' }}
      </div>
    </aside>

    <RouterView />
  </div>
</template>

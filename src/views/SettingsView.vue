<script setup lang="ts">
import { useSettingsStore } from '@/stores/settings'

const settings = useSettingsStore()
</script>

<template>
  <main class="page-view">
    <header class="page-heading">
      <p class="eyebrow">Local First</p>
      <h1>设置</h1>
    </header>

    <section class="settings-grid">
      <label class="setting-field">
        <span>最近消息保留数</span>
        <input v-model.number="settings.maxRecentMessages" type="number" min="4" max="100" />
      </label>
      <label class="setting-field checkbox-field">
        <input v-model="settings.compactSkillDescriptions" type="checkbox" />
        <span>使用小模型友好的精简 Skill 描述</span>
      </label>
    </section>
  </main>
</template>

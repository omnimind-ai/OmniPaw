<script setup lang="ts">
import { RouterLink } from 'vue-router'

import { useModuleI18n } from '@/i18n/composables'
import { useSettingsStore } from '@/stores/settings'

const settings = useSettingsStore()
const { tm } = useModuleI18n('features/settings')
</script>

<template>
  <main class="page-view">
    <header class="page-heading">
      <p class="eyebrow">Local First</p>
      <h1>{{ tm('page.title') }}</h1>
    </header>

    <section class="settings-grid">
      <label class="setting-field">
        <span>{{ tm('local.maxRecentMessages') }}</span>
        <input v-model.number="settings.maxRecentMessages" type="number" min="4" max="100" />
      </label>
      <label class="setting-field checkbox-field">
        <input v-model="settings.compactSkillDescriptions" type="checkbox" />
        <span>{{ tm('local.compactSkillDescriptions') }}</span>
      </label>

      <RouterLink class="settings-link-card" to="/settings/tools">
        <span>
          <strong>{{ tm('globalTools.title') }}</strong>
          <small>{{ tm('globalTools.subtitle') }}</small>
        </span>
        <span aria-hidden="true">&gt;</span>
      </RouterLink>
    </section>
  </main>
</template>

<style scoped>
.settings-link-card {
  display: flex;
  max-width: 640px;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  border: 1px solid #d8ccbc;
  border-radius: 8px;
  padding: 16px;
  background: #fffdf8;
  color: #221f1a;
  text-decoration: none;
}

.settings-link-card span:first-child {
  display: grid;
  gap: 6px;
}

.settings-link-card small {
  color: #6c6358;
  line-height: 1.5;
}
</style>

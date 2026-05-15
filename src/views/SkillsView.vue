<script setup lang="ts">
import { onMounted, ref } from 'vue'

import { appBridge } from '@/bridge/app'
import type { SkillDefinition } from '@shared/types/skill'

const skills = ref<SkillDefinition[]>([])

onMounted(async () => {
  skills.value = (await appBridge.skill.list()) as SkillDefinition[]
})
</script>

<template>
  <main class="page-view">
    <header class="page-heading">
      <p class="eyebrow">Tool Use</p>
      <h1>Skill 管理</h1>
    </header>

    <section class="list-panel">
      <article v-for="skill in skills" :key="skill.name" class="list-item">
        <div>
          <h2>{{ skill.name }}</h2>
          <p>{{ skill.description }}</p>
        </div>
        <span class="status-chip">{{ skill.enabled ? 'enabled' : 'disabled' }}</span>
      </article>
    </section>
  </main>
</template>

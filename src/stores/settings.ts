import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useSettingsStore = defineStore('settings', () => {
  const compactSkillDescriptions = ref(true)
  const maxRecentMessages = ref(20)

  return {
    compactSkillDescriptions,
    maxRecentMessages,
  }
})

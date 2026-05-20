<script setup lang="ts">
import type { ToolProfile } from '@shared/types/chat'
import { computed } from 'vue'

import SettingsSection from '@/components/settings/SettingsSection.vue'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useSettingsStore } from '@/stores/settings'

const settingsStore = useSettingsStore()

const toolProfileOptions: Array<{
  value: ToolProfile
  label: string
  description: string
}> = [
  {
    value: 'minimal',
    label: '最小',
    description: '仅暴露基础安全与只读能力。',
  },
  {
    value: 'assistant',
    label: '助手',
    description: '默认等级，允许常用助手工具。',
  },
  {
    value: 'power',
    label: '高级',
    description: '暴露更完整的工具清单，高风险工具仍需要策略放行。',
  },
]

const agentToolProfile = computed<ToolProfile>({
  get: () => settingsStore.agentToolProfile,
  set: (value) => {
    settingsStore.updateToolProfile(value)
  },
})

const selectedProfile = computed(
  () =>
    toolProfileOptions.find((option) => option.value === agentToolProfile.value) ??
    toolProfileOptions[1]
)
</script>

<template>
  <SettingsSection
    title="Agent 设置"
    description="控制新一轮对话运行时可见的工具权限等级。"
  >
    <FieldGroup class="gap-0">
      <Field
        orientation="responsive"
        class="px-4 py-3"
      >
        <FieldContent>
          <FieldLabel for="agent-tool-profile">权限等级</FieldLabel>
          <FieldDescription>{{ selectedProfile.description }}</FieldDescription>
        </FieldContent>
        <ToggleGroup
          id="agent-tool-profile"
          v-model="agentToolProfile"
          type="single"
          variant="outline"
          class="w-full md:w-auto"
          aria-label="Agent 权限等级"
        >
          <ToggleGroupItem
            v-for="option in toolProfileOptions"
            :key="option.value"
            :value="option.value"
            class="flex-1 md:flex-none"
          >
            {{ option.label }}
          </ToggleGroupItem>
        </ToggleGroup>
      </Field>
    </FieldGroup>
  </SettingsSection>
</template>

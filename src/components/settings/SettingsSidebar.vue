<script setup lang="ts">
import {
  ArrowLeftIcon,
  BookOpenIcon,
  BotIcon,
  CalendarClockIcon,
  InfoIcon,
  KeyboardIcon,
  MonitorIcon,
  PlugIcon,
  SearchIcon,
  ServerIcon,
  SlidersHorizontalIcon,
  WrenchIcon,
} from 'lucide-vue-next'
import type { Component } from 'vue'

import { Button } from '@/components/ui/button'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  SidebarTrigger,
} from '@/components/ui/sidebar'

export type SettingsTab =
  | 'providers'
  | 'defaults'
  | 'general'
  | 'display'
  | 'data'
  | 'tools'
  | 'skills'
  | 'schedule'
  | 'about'

interface SettingsNavItem {
  value: SettingsTab
  label: string
  icon: Component
}

defineProps<{
  activeTab: SettingsTab
}>()

const emit = defineEmits<{
  select: [tab: SettingsTab]
  back: []
}>()

const primaryItems: SettingsNavItem[] = [
  { value: 'providers', label: '模型服务', icon: PlugIcon },
  { value: 'defaults', label: '默认模型', icon: BotIcon },
]

const settingsItems: SettingsNavItem[] = [
  { value: 'general', label: '常规设置', icon: SlidersHorizontalIcon },
]

const capabilityItems: SettingsNavItem[] = [
  { value: 'tools', label: '工具设置', icon: WrenchIcon },
  { value: 'skills', label: '技能', icon: BookOpenIcon },
  { value: 'schedule', label: '计划任务', icon: CalendarClockIcon },
]

const aboutItems: SettingsNavItem[] = [{ value: 'about', label: '关于我们', icon: InfoIcon }]

const placeholderItems = [
  { label: '网络搜索', icon: SearchIcon },
  { label: '快捷键', icon: KeyboardIcon },
  { label: 'API 服务器', icon: ServerIcon },
]
</script>

<template>
  <Sidebar
    collapsible="offcanvas"
    class="border-r"
  >
    <SidebarHeader>
      <div class="flex items-center gap-2">
        <SidebarTrigger class="md:hidden" />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="返回对话"
          @click="emit('back')"
        >
          <ArrowLeftIcon />
        </Button>
        <span class="truncate text-sm font-medium">设置</span>
      </div>
    </SidebarHeader>

    <SidebarSeparator />

    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem
              v-for="item in settingsItems"
              :key="item.value"
            >
              <SidebarMenuButton
                :is-active="item.value === activeTab"
                :tooltip="item.label"
                @click="emit('select', item.value)"
              >
                <component :is="item.icon" />
                <span>{{ item.label }}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <SidebarSeparator />

      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem
              v-for="item in primaryItems"
              :key="item.value"
            >
              <SidebarMenuButton
                :is-active="item.value === activeTab"
                :tooltip="item.label"
                @click="emit('select', item.value)"
              >
                <component :is="item.icon" />
                <span>{{ item.label }}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <SidebarSeparator />

      <SidebarGroup>
        <SidebarGroupLabel>能力</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem
              v-for="item in capabilityItems"
              :key="item.value"
            >
              <SidebarMenuButton
                :is-active="item.value === activeTab"
                :tooltip="item.label"
                @click="emit('select', item.value)"
              >
                <component :is="item.icon" />
                <span>{{ item.label }}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <SidebarSeparator />

      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem
              v-for="item in aboutItems"
              :key="item.value"
            >
              <SidebarMenuButton
                :is-active="item.value === activeTab"
                :tooltip="item.label"
                @click="emit('select', item.value)"
              >
                <component :is="item.icon" />
                <span>{{ item.label }}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>
  </Sidebar>
</template>

<script setup lang="ts">
import {
  ArrowLeftIcon,
  BookOpenIcon,
  BotIcon,
  BrainIcon,
  CalendarClockIcon,
  DramaIcon,
  EyeIcon,
  InfoIcon,
  KeyboardIcon,
  PlugIcon,
  SearchIcon,
  ServerIcon,
  SlidersHorizontalIcon,
  TerminalIcon,
  UserIcon,
  WrenchIcon,
} from 'lucide-vue-next'
import type { Component } from 'vue'
import { useI18n } from 'vue-i18n'

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
  | 'shortcuts'
  | 'agent'
  | 'display'
  | 'data'
  | 'tools'
  | 'tavern'
  | 'memory'
  | 'skills'
  | 'personas'
  | 'schedule'
  | 'observation'
  | 'about'

interface SettingsNavItem {
  value: SettingsTab
  labelKey: string
  icon: Component
}

defineProps<{
  activeTab: SettingsTab
}>()

const emit = defineEmits<{
  select: [tab: SettingsTab]
  back: []
}>()

const { t } = useI18n()

const primaryItems: SettingsNavItem[] = [
  { value: 'providers', labelKey: 'settings.sidebar.nav.providers', icon: PlugIcon },
  { value: 'defaults', labelKey: 'settings.sidebar.nav.defaults', icon: BotIcon },
]

const settingsItems: SettingsNavItem[] = [
  { value: 'general', labelKey: 'settings.sidebar.nav.general', icon: SlidersHorizontalIcon },
  { value: 'shortcuts', labelKey: 'settings.sidebar.nav.shortcuts', icon: KeyboardIcon },
  { value: 'agent', labelKey: 'settings.sidebar.nav.agent', icon: TerminalIcon },
]

const capabilityItems: SettingsNavItem[] = [
  { value: 'personas', labelKey: 'settings.sidebar.nav.personas', icon: UserIcon },
  { value: 'memory', labelKey: 'settings.sidebar.nav.memory', icon: BrainIcon },
  { value: 'tavern', labelKey: 'settings.sidebar.nav.tavern', icon: DramaIcon },
  { value: 'tools', labelKey: 'settings.sidebar.nav.tools', icon: WrenchIcon },
  { value: 'observation', labelKey: 'settings.sidebar.nav.observation', icon: EyeIcon },
  { value: 'skills', labelKey: 'settings.sidebar.nav.skills', icon: BookOpenIcon },
  { value: 'schedule', labelKey: 'settings.sidebar.nav.schedule', icon: CalendarClockIcon },
]

const aboutItems: SettingsNavItem[] = [
  { value: 'about', labelKey: 'settings.sidebar.nav.about', icon: InfoIcon },
]

const placeholderItems = [
  { label: t('settings.sidebar.upcoming.webSearch'), icon: SearchIcon },
  { label: t('settings.sidebar.upcoming.apiServer'), icon: ServerIcon },
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
          :aria-label="t('settings.sidebar.backToChat')"
          @click="emit('back')"
        >
          <ArrowLeftIcon />
        </Button>
        <span class="truncate text-sm font-medium">{{ t('settings.sidebar.title') }}</span>
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
                :tooltip="t(item.labelKey)"
                @click="emit('select', item.value)"
              >
                <component :is="item.icon" />
                <span>{{ t(item.labelKey) }}</span>
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
                :tooltip="t(item.labelKey)"
                @click="emit('select', item.value)"
              >
                <component :is="item.icon" />
                <span>{{ t(item.labelKey) }}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <SidebarSeparator />

      <SidebarGroup>
        <SidebarGroupLabel>{{ t('settings.sidebar.capabilities') }}</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem
              v-for="item in capabilityItems"
              :key="item.value"
            >
              <SidebarMenuButton
                :is-active="item.value === activeTab"
                :tooltip="t(item.labelKey)"
                @click="emit('select', item.value)"
              >
                <component :is="item.icon" />
                <span>{{ t(item.labelKey) }}</span>
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
                :tooltip="t(item.labelKey)"
                @click="emit('select', item.value)"
              >
                <component :is="item.icon" />
                <span>{{ t(item.labelKey) }}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>
  </Sidebar>
</template>

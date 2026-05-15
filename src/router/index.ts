import { createRouter, createWebHashHistory } from 'vue-router'

import ChatView from '@/views/ChatView.vue'
import CronView from '@/views/CronView.vue'
import SettingsView from '@/views/SettingsView.vue'
import SkillsView from '@/views/SkillsView.vue'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      redirect: '/chat',
    },
    {
      path: '/chat/:conversationId?',
      name: 'chat',
      component: ChatView,
    },
    {
      path: '/chatbox/:conversationId?',
      name: 'chatbox',
      component: ChatView,
    },
    {
      path: '/skills',
      name: 'skills',
      component: SkillsView,
    },
    {
      path: '/cron',
      name: 'cron',
      component: CronView,
    },
    {
      path: '/settings',
      name: 'settings',
      component: SettingsView,
    },
  ],
})

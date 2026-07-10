import { createRouter, createWebHashHistory } from 'vue-router'

import ChatWorkspace from '@/components/chat/ChatWorkspace.vue'
import ChatContentView from '@/views/ChatContentView.vue'
import ChatHomeView from '@/views/ChatHomeView.vue'
import SettingsView from '@/views/SettingsView.vue'
import VisionHistoryView from '@/views/VisionHistoryView.vue'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      component: ChatWorkspace,
      children: [
        {
          path: '',
          name: 'home',
          component: ChatHomeView,
        },
        {
          path: 'chat/:conversationId',
          name: 'chat',
          component: ChatContentView,
        },
      ],
    },
    {
      path: '/chat',
      redirect: '/',
    },
    {
      path: '/settings',
      name: 'settings',
      component: SettingsView,
    },
    {
      path: '/roles',
      name: 'roles',
      redirect: { name: 'settings', query: { tab: 'roles' } },
    },
    {
      path: '/vision',
      name: 'vision',
      component: VisionHistoryView,
    },
  ],
})

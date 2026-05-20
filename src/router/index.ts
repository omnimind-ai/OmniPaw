import { createRouter, createWebHashHistory } from 'vue-router'

import ChatWorkspace from '@/components/chat/ChatWorkspace.vue'
import ChatContentView from '@/views/ChatContentView.vue'
import ChatHomeView from '@/views/ChatHomeView.vue'
import RewritePlaceholderView from '@/views/RewritePlaceholderView.vue'
import SettingsView from '@/views/SettingsView.vue'

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
      path: '/chatbox/:conversationId?',
      name: 'chatbox',
      component: RewritePlaceholderView,
      meta: {
        rewriteTitle: 'Chatbox workspace',
        rewriteDescription:
          'The legacy AstrBot chatbox UI has been removed. Rebuild this route with the same chat core capabilities as the main chat workspace.',
      },
    },
    {
      path: '/cron',
      name: 'cron',
      component: RewritePlaceholderView,
      meta: {
        rewriteTitle: 'Cron',
        rewriteDescription:
          'The legacy cron page has been removed. Rebuild this page on top of appBridge.cron.list().',
      },
    },
    {
      path: '/settings',
      name: 'settings',
      component: SettingsView,
    },
  ],
})

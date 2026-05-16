import { createRouter, createWebHashHistory } from 'vue-router'

import ChatHomeView from '@/views/ChatHomeView.vue'
import RewritePlaceholderView from '@/views/RewritePlaceholderView.vue'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: ChatHomeView,
    },
    {
      path: '/chat/:conversationId?',
      name: 'chat',
      component: ChatHomeView,
    },
    {
      path: '/chatbox/:conversationId?',
      name: 'chatbox',
      component: RewritePlaceholderView,
      meta: {
        rewriteTitle: 'Chatbox workspace',
        rewriteDescription: 'The legacy AstrBot chatbox UI has been removed. Rebuild this route with the same chat core capabilities as the main chat workspace.',
      },
    },
    {
      path: '/skills',
      name: 'skills',
      component: RewritePlaceholderView,
      meta: {
        rewriteTitle: 'Skills',
        rewriteDescription: 'The legacy skills page has been removed. Rebuild this page on top of appBridge.skill.list().',
      },
    },
    {
      path: '/cron',
      name: 'cron',
      component: RewritePlaceholderView,
      meta: {
        rewriteTitle: 'Cron',
        rewriteDescription: 'The legacy cron page has been removed. Rebuild this page on top of appBridge.cron.list().',
      },
    },
    {
      path: '/settings',
      name: 'settings',
      component: RewritePlaceholderView,
      meta: {
        rewriteTitle: 'Settings',
        rewriteDescription: 'The legacy settings page has been removed. Rebuild local settings on top of useSettingsStore and link out to provider/tools settings.',
      },
    },
    {
      path: '/settings/tools',
      name: 'settings-tools',
      component: RewritePlaceholderView,
      meta: {
        rewriteTitle: 'Global tools',
        rewriteDescription: 'The legacy global tools page has been removed. Rebuild this page on top of appBridge.tools.list() and appBridge.tools.setEnabled().',
      },
    },
  ],
})

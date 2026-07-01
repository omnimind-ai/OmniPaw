<script setup lang="ts">
import { SidebarTrigger } from '@/components/ui/sidebar'
</script>

<template>
  <main
    data-chat-surface
    class="flex h-full min-h-0 flex-1 flex-col bg-background/80 backdrop-blur-[1px]"
  >
    <header class="flex h-12 shrink-0 items-center border-b px-3 md:hidden">
      <SidebarTrigger />
    </header>

    <RouterView />
  </main>
</template>

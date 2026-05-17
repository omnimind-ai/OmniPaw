<script setup lang="ts">
import { Toaster } from '@/components/ui/sonner'
import { useAppTheme } from '@/composables/useAppTheme'

useAppTheme()
</script>

<template>
  <RouterView />
  <Toaster
    close-button
    rich-colors
    position="top-right"
  />
</template>

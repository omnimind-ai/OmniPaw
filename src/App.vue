<script setup lang="ts">
import { Toaster } from '@/components/ui/sonner'
</script>

<template>
  <RouterView />
  <Toaster
    close-button
    rich-colors
    position="top-right"
  />
</template>

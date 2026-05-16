<script setup lang="ts">
defineProps<{
  title: string
  description: string
}>()
</script>

<template>
  <section class="max-w-[860px] border-t border-[#ded2bf] pt-6">
    <h2 class="m-0 text-xl">{{ title }}</h2>
    <p class="mb-0 mt-0 leading-[1.7] text-[#6c6358]">{{ description }}</p>
  </section>
</template>

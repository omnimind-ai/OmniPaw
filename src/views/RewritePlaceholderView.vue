<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()

const title = computed(() => String(route.meta.rewriteTitle || 'Frontend rewrite'))
const description = computed(() =>
  String(route.meta.rewriteDescription || 'This route is waiting for the new UI implementation.'),
)
</script>

<template>
  <main class="flex min-h-screen items-center justify-center bg-[#f7f4ed] p-6 text-[#221f1a]">
    <section class="w-full max-w-[720px] border-t border-[#ded2bf] pt-6">
      <p class="mb-2 text-xs font-bold uppercase tracking-[0.08em] text-[#8b3f2b]">
        Rewrite placeholder
      </p>
      <h1 class="m-0 text-3xl font-bold leading-tight">{{ title }}</h1>
      <p class="mt-3 max-w-[560px] leading-7 text-[#6c6358]">
        {{ description }}
      </p>
    </section>
  </main>
</template>

<template>
  <div class="provider-panel">
    <div class="provider-panel__header">
      <p class="provider-panel__eyebrow">Provider</p>
      <h2>模型配置</h2>
      <p>这里预留 OpenAI 兼容接口、OmniInfer 本地接口和模型列表配置。</p>
    </div>

    <v-row>
      <v-col cols="12" md="6">
        <v-text-field label="Base URL" model-value="http://localhost:11434/v1" variant="outlined" />
      </v-col>
      <v-col cols="12" md="6">
        <v-text-field label="Model" model-value="local-small-model" variant="outlined" />
      </v-col>
      <v-col cols="12">
        <v-text-field label="API Key" model-value="" placeholder="可选" variant="outlined" />
      </v-col>
    </v-row>
  </div>
</template>

<script setup lang="ts">
defineProps<{ showBorder?: boolean }>()
</script>

<style scoped>
.provider-panel {
  width: min(920px, 100%);
  margin: 0 auto;
  padding: 36px 24px;
}

.provider-panel__header {
  margin-bottom: 28px;
}

.provider-panel__header h2 {
  margin: 0 0 8px;
  font-size: 28px;
  font-weight: 700;
}

.provider-panel__header p {
  margin: 0;
  color: rgba(var(--v-theme-on-surface), 0.62);
}

.provider-panel__eyebrow {
  margin: 0 0 8px !important;
  color: rgb(var(--v-theme-primary)) !important;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
</style>

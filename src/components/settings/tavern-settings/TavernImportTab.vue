<script setup lang="ts">
import { DownloadIcon, FileJsonIcon } from 'lucide-vue-next'
import { ref } from 'vue'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'

defineProps<{
  importDisabled: boolean
  importFromText: () => void
  importFromFile: (event: Event) => void
}>()

const importText = defineModel<string>('importText', { required: true })
const fileInput = ref<HTMLInputElement | null>(null)
</script>

<template>
  <div class="flex flex-col gap-4">
    <FieldGroup>
      <Field>
        <FieldLabel for="tavern-import-json">角色卡 JSON</FieldLabel>
        <Textarea
          id="tavern-import-json"
          v-model="importText"
          class="min-h-56 font-mono text-xs"
          placeholder="{ &quot;spec&quot;: &quot;chara_card_v2&quot;, &quot;data&quot;: { ... } }"
        />
        <FieldDescription>支持 SillyTavern V1/V2 JSON、PNG 和 WebP 角色卡。</FieldDescription>
      </Field>
    </FieldGroup>
    <div class="flex flex-wrap gap-2">
      <Button
        type="button"
        :disabled="importDisabled"
        @click="importFromText"
      >
        <FileJsonIcon data-icon="inline-start" />
        导入文本
      </Button>
      <Button
        type="button"
        variant="outline"
        @click="fileInput?.click()"
      >
        <DownloadIcon data-icon="inline-start" />
        选择文件
      </Button>
      <input
        ref="fileInput"
        class="sr-only"
        type="file"
        accept="application/json,image/png,image/webp,.json,.png,.webp"
        @change="importFromFile"
      >
    </div>
  </div>
</template>

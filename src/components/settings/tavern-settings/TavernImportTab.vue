<script setup lang="ts">
import { DownloadIcon, FileJsonIcon } from 'lucide-vue-next'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
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
const { t } = useI18n()
</script>

<template>
  <div class="flex flex-col gap-4">
    <FieldGroup>
      <Field>
        <FieldLabel for="tavern-import-json">{{ t('settings.tavern.importTab.cardJsonLabel') }}</FieldLabel>
        <Textarea
          id="tavern-import-json"
          v-model="importText"
          class="min-h-56 font-mono text-xs"
          placeholder="{ &quot;spec&quot;: &quot;chara_card_v2&quot;, &quot;data&quot;: { ... } }"
        />
        <FieldDescription>{{ t('settings.tavern.importTab.supportDescription') }}</FieldDescription>
      </Field>
    </FieldGroup>
    <div class="flex flex-wrap gap-2">
      <Button
        type="button"
        :disabled="importDisabled"
        @click="importFromText"
      >
        <FileJsonIcon data-icon="inline-start" />
        {{ t('settings.tavern.importTab.importTextButton') }}
      </Button>
      <Button
        type="button"
        variant="outline"
        @click="fileInput?.click()"
      >
        <DownloadIcon data-icon="inline-start" />
        {{ t('settings.tavern.importTab.selectFileButton') }}
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

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { BridgeDesktopSettingsConfig } from '@/bridge/app'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'

const { t } = useI18n()
const open = defineModel<boolean>('open', { required: true })

const props = defineProps<{
  draft: BridgeDesktopSettingsConfig
}>()

const misfireGraceMinutes = computed({
  get: () => Math.round(props.draft.scheduledTasks.misfireGraceMs / 60_000),
  set: (value: string | number) => {
    const minutes = Math.max(0, Math.round(Number(value) || 0))
    props.draft.scheduledTasks.misfireGraceMs = minutes * 60_000
  },
})

const misfireStartupLimit = computed({
  get: () => props.draft.scheduledTasks.misfireStartupLimit,
  set: (value: string | number) => {
    props.draft.scheduledTasks.misfireStartupLimit = Math.max(0, Math.round(Number(value) || 0))
  },
})
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>{{ t('settings.scheduledTask.policyModal.title') }}</DialogTitle>
        <DialogDescription>
          {{ t('settings.scheduledTask.policyModal.description') }}
        </DialogDescription>
      </DialogHeader>

      <FieldGroup class="gap-0 rounded-md border">
        <Field
          orientation="responsive"
          class="border-b px-4 py-3"
        >
          <FieldContent>
            <FieldLabel for="scheduled-enabled">{{ t('settings.scheduledTask.policyModal.enabled') }}</FieldLabel>
            <FieldDescription>{{ t('settings.scheduledTask.policyModal.enabledDescription') }}</FieldDescription>
          </FieldContent>
          <Switch
            id="scheduled-enabled"
            v-model="draft.scheduledTasks.enabled"
            :aria-label="t('settings.scheduledTask.policyModal.enabled')"
          />
        </Field>

        <Field
          orientation="responsive"
          class="border-b px-4 py-3"
        >
          <FieldContent>
            <FieldLabel for="scheduled-misfire-policy">{{ t('settings.scheduledTask.policyModal.misfirePolicy') }}</FieldLabel>
            <FieldDescription>{{ t('settings.scheduledTask.policyModal.misfirePolicyDescription') }}</FieldDescription>
          </FieldContent>
          <Select
            v-model="draft.scheduledTasks.misfirePolicy"
            class="w-full md:w-48"
          >
            <SelectTrigger
              id="scheduled-misfire-policy"
              class="w-full md:w-48"
            >
              <SelectValue :placeholder="t('settings.scheduledTask.policyModal.misfirePolicyPlaceholder')" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="run_once">{{ t('settings.scheduledTask.policyModal.runOnce') }}</SelectItem>
                <SelectItem value="skip">{{ t('settings.scheduledTask.policyModal.runNow') }}</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>

        <Field
          orientation="responsive"
          class="border-b px-4 py-3"
        >
          <FieldContent>
            <FieldLabel for="scheduled-grace">{{ t('settings.scheduledTask.policyModal.graceMinutes') }}</FieldLabel>
            <FieldDescription>{{ t('settings.scheduledTask.policyModal.graceMinutesDescription') }}</FieldDescription>
          </FieldContent>
          <Input
            id="scheduled-grace"
            v-model="misfireGraceMinutes"
            class="w-full md:w-48"
            type="number"
            min="0"
            step="1"
          />
        </Field>

        <Field
          orientation="responsive"
          class="px-4 py-3"
        >
          <FieldContent>
            <FieldLabel for="scheduled-limit">{{ t('settings.scheduledTask.policyModal.startupLimit') }}</FieldLabel>
            <FieldDescription>{{ t('settings.scheduledTask.policyModal.startupLimitDescription') }}</FieldDescription>
          </FieldContent>
          <Input
            id="scheduled-limit"
            v-model="misfireStartupLimit"
            class="w-full md:w-48"
            type="number"
            min="0"
            step="1"
          />
        </Field>
      </FieldGroup>

      <DialogFooter>
        <DialogClose as-child>
          <Button type="button">{{ t('settings.scheduledTask.policyModal.done') }}</Button>
        </DialogClose>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

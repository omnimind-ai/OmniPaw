<script setup lang="ts">
import type { PersonaProfile } from '@shared/types/persona'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import { Textarea } from '@/components/ui/textarea'
import type { TavernUserProfileDraftState } from './types'

defineProps<{
  draft: TavernUserProfileDraftState
  personaProfiles: PersonaProfile[]
  savingUserProfile: boolean
  disabled?: boolean
  copyPersonaToUserProfile: () => void
}>()
</script>

<template>
  <FieldGroup>
    <FieldDescription>
      酒馆用户 profile 是独立快照，不自动同步普通 Persona，也不回写普通 Persona。
    </FieldDescription>
    <Field orientation="horizontal">
      <FieldContent>
        <FieldLabel for="tavern-profile-enabled">启用 profile</FieldLabel>
      </FieldContent>
      <Checkbox
        id="tavern-profile-enabled"
        v-model:checked="draft.enabled"
        :disabled="disabled"
      />
    </Field>
    <Field>
      <FieldLabel for="tavern-profile-name">名称</FieldLabel>
      <Input
        id="tavern-profile-name"
        v-model="draft.name"
        :disabled="disabled"
      />
    </Field>
    <Field>
      <FieldLabel for="tavern-profile-description">描述</FieldLabel>
      <Textarea
        id="tavern-profile-description"
        v-model="draft.description"
        class="min-h-40"
        placeholder="{{persona}} 会使用这里的文本"
        :disabled="disabled"
      />
    </Field>
    <Field>
      <FieldLabel for="tavern-profile-copy">从普通 Persona 复制</FieldLabel>
      <div class="flex gap-2">
        <Select
          v-model="draft.copyPersonaId"
          :disabled="disabled"
        >
          <SelectTrigger
            id="tavern-profile-copy"
            class="min-w-0 flex-1"
          >
            <SelectValue placeholder="选择 Persona" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem
                v-for="profile in personaProfiles"
                :key="profile.id"
                :value="profile.id"
              >
                {{ profile.name }}
              </SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          :disabled="disabled || !draft.copyPersonaId || savingUserProfile"
          @click="copyPersonaToUserProfile"
        >
          复制
        </Button>
      </div>
    </Field>
  </FieldGroup>
</template>

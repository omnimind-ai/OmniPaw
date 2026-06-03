<script setup lang="ts">
import type { PersonaProfile } from '@shared/types/persona'
import type { TavernUserProfile } from '@shared/types/tavern'
import { PlusIcon } from 'lucide-vue-next'
import { Badge } from '@/components/ui/badge'
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
import { cn } from '@/lib/utils'
import type { TavernUserProfileDraftState } from './types'

defineProps<{
  userProfiles: TavernUserProfile[]
  personaProfiles: PersonaProfile[]
  selectedUserProfileId: string
  draft: TavernUserProfileDraftState
  savingUserProfile: boolean
  newUserProfileDraft: () => void
  selectUserProfile: (profileId: string) => void
  copyPersonaToUserProfile: () => void
}>()
</script>

<template>
  <div class="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
    <div class="flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        @click="newUserProfileDraft"
      >
        <PlusIcon data-icon="inline-start" />
        新建用户
      </Button>
      <button
        v-for="profile in userProfiles"
        :key="profile.id"
        type="button"
        :class="cn(
          'flex min-h-10 items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm',
          selectedUserProfileId === profile.id ? 'border-primary bg-muted' : 'border-border',
        )"
        @click="selectUserProfile(profile.id)"
      >
        <span class="truncate">{{ profile.name }}</span>
        <Badge variant="outline">快照</Badge>
      </button>
    </div>

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
        />
      </Field>
      <Field>
        <FieldLabel for="tavern-profile-name">名称</FieldLabel>
        <Input
          id="tavern-profile-name"
          v-model="draft.name"
        />
      </Field>
      <Field>
        <FieldLabel for="tavern-profile-description">描述</FieldLabel>
        <Textarea
          id="tavern-profile-description"
          v-model="draft.description"
          class="min-h-40"
          placeholder="{{persona}} 会使用这里的文本"
        />
      </Field>
      <Field>
        <FieldLabel for="tavern-profile-copy">从普通 Persona 复制</FieldLabel>
        <div class="flex gap-2">
          <Select v-model="draft.copyPersonaId">
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
            :disabled="!draft.copyPersonaId || savingUserProfile"
            @click="copyPersonaToUserProfile"
          >
            复制
          </Button>
        </div>
      </Field>
    </FieldGroup>
  </div>
</template>

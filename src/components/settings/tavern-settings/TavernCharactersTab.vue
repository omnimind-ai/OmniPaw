<script setup lang="ts">
import type { TavernCharacter, TavernLorebook } from '@shared/types/tavern'
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
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { TavernCharacterDraftState } from './types'

defineProps<{
  characters: TavernCharacter[]
  lorebooks: TavernLorebook[]
  selectedCharacterId: string
  selectedSessionLorebookSet: Set<string>
  draft: TavernCharacterDraftState
  newCharacterDraft: () => void
  selectCharacter: (characterId: string) => void
  toggleSessionLorebook: (lorebookId: string, checked: boolean | 'indeterminate') => void
}>()
</script>

<template>
  <div class="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
    <div class="flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        @click="newCharacterDraft"
      >
        <PlusIcon data-icon="inline-start" />
        新建角色
      </Button>
      <button
        v-for="character in characters"
        :key="character.id"
        type="button"
        :class="cn(
          'flex min-h-10 items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm',
          selectedCharacterId === character.id ? 'border-primary bg-muted' : 'border-border',
        )"
        @click="selectCharacter(character.id)"
      >
        <span class="truncate">{{ character.name }}</span>
        <Badge
          v-if="!character.enabled"
          variant="secondary"
        >
          禁用
        </Badge>
      </button>
      <p
        v-if="!characters.length"
        class="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground"
      >
        暂无角色
      </p>
    </div>

    <div class="flex min-w-0 flex-col gap-4">
      <FieldGroup>
        <Field orientation="horizontal">
          <Checkbox
            id="tavern-character-enabled"
            v-model:checked="draft.enabled"
          />
          <FieldContent>
            <FieldLabel for="tavern-character-enabled">启用角色</FieldLabel>
            <FieldDescription>禁用后不能用于新的酒馆上下文。</FieldDescription>
          </FieldContent>
        </Field>
        <Field>
          <FieldLabel for="tavern-character-name">名称</FieldLabel>
          <Input
            id="tavern-character-name"
            v-model="draft.name"
            placeholder="角色名称"
          />
        </Field>
        <Field>
          <FieldLabel for="tavern-character-desc">描述</FieldLabel>
          <Textarea
            id="tavern-character-desc"
            v-model="draft.description"
            class="min-h-20"
          />
        </Field>
        <Field>
          <FieldLabel for="tavern-character-personality">人格</FieldLabel>
          <Textarea
            id="tavern-character-personality"
            v-model="draft.personality"
            class="min-h-20"
          />
        </Field>
        <Field>
          <FieldLabel for="tavern-character-scenario">场景</FieldLabel>
          <Textarea
            id="tavern-character-scenario"
            v-model="draft.scenario"
            class="min-h-20"
          />
        </Field>
        <Field>
          <FieldLabel for="tavern-character-system">System prompt</FieldLabel>
          <Textarea
            id="tavern-character-system"
            v-model="draft.systemPrompt"
            class="min-h-20"
          />
        </Field>
        <Field>
          <FieldLabel for="tavern-character-post-history">Post-history instructions</FieldLabel>
          <Textarea
            id="tavern-character-post-history"
            v-model="draft.postHistoryInstructions"
            class="min-h-20"
          />
        </Field>
        <Field>
          <FieldLabel for="tavern-character-first-message">首条开场白</FieldLabel>
          <Textarea
            id="tavern-character-first-message"
            v-model="draft.firstMessage"
            class="min-h-20"
          />
        </Field>
        <Field>
          <FieldLabel for="tavern-character-alt">Alternate greetings</FieldLabel>
          <Textarea
            id="tavern-character-alt"
            v-model="draft.alternateGreetingsText"
            class="min-h-24"
            placeholder="每段之间空一行"
          />
        </Field>
        <Field>
          <FieldLabel for="tavern-character-examples">Message examples</FieldLabel>
          <Textarea
            id="tavern-character-examples"
            v-model="draft.messageExamplesText"
            class="min-h-24"
            placeholder="每段之间空一行"
          />
        </Field>
        <Field>
          <FieldLabel for="tavern-character-tags">标签</FieldLabel>
          <Input
            id="tavern-character-tags"
            v-model="draft.tagsText"
            placeholder="tag-a, tag-b"
          />
        </Field>
      </FieldGroup>

      <div class="flex flex-col gap-2 rounded-md border p-3">
        <p class="text-sm font-medium">默认绑定世界书</p>
        <label
          v-for="lorebook in lorebooks"
          :key="lorebook.id"
          class="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
        >
          <Checkbox
            :checked="selectedSessionLorebookSet.has(lorebook.id)"
            @update:checked="toggleSessionLorebook(lorebook.id, $event)"
          />
          <span class="truncate">{{ lorebook.name }}</span>
        </label>
        <p
          v-if="!lorebooks.length"
          class="text-sm text-muted-foreground"
        >
          暂无世界书。
        </p>
      </div>
    </div>
  </div>
</template>

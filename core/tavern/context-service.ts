import type { ChatMessage, ChatSession } from '@shared/types/chat'
import type {
  TavernCharacter,
  TavernContextUnitAccountingItem,
  TavernLorebook,
  TavernLorebookEntry,
  TavernRequestSnapshotMetadata,
  TavernSessionMetadata,
} from '@shared/types/tavern'
import type { TavernManager } from './manager'
import { estimateTextTokens, hashSensitiveText, renderTavernTemplate } from './template'

export type TavernContextUnitKind = 'character' | 'lore' | 'example' | 'post-history'

export interface TavernContextUnitPlan {
  id: string
  kind: TavernContextUnitKind
  text: string
  refId?: string
  lorebookId?: string
  priority: number
  required: boolean
  estimatedTokens: number
  hash: string
  position?: 'after-character' | 'before-history'
  droppedReason?: string
}

export interface TavernContextPlan {
  session: TavernSessionMetadata
  character?: TavernCharacter
  selectedUnits: TavernContextUnitPlan[]
  droppedUnits: TavernContextUnitPlan[]
  missingLorebookIds: string[]
  snapshot: TavernRequestSnapshotMetadata
}

export interface TavernContextServiceOptions {
  tavernManager: TavernManager
  recentMessageCount?: number
  loreTokenBudget?: number
}

export class TavernContextService {
  private readonly tavernManager: TavernManager
  private readonly recentMessageCount: number
  private readonly loreTokenBudget: number

  constructor(options: TavernContextServiceOptions) {
    this.tavernManager = options.tavernManager
    this.recentMessageCount = options.recentMessageCount ?? 12
    this.loreTokenBudget = options.loreTokenBudget ?? 800
  }

  buildPlan(input: {
    session: ChatSession
    messages: ChatMessage[]
    currentUserMessageId: string
  }): TavernContextPlan | undefined {
    const metadata = input.session.metadata?.tavern
    if (!metadata?.enabled) {
      return undefined
    }

    const character = this.tavernManager.getCharacter(metadata.characterId)
    if (!character || character.enabled === false) {
      return {
        session: metadata,
        character,
        selectedUnits: [],
        droppedUnits: [],
        missingLorebookIds: metadata.lorebookIds,
        snapshot: {
          enabled: true,
          characterId: metadata.characterId,
          characterName: metadata.characterName,
          lorebookIds: metadata.lorebookIds,
          missingLorebookIds: metadata.lorebookIds,
          selectedGreetingIndex: metadata.selectedGreetingIndex,
          contextPreset: metadata.contextPreset,
          runProfile: 'low-noise',
          selectedLoreCount: 0,
          droppedLoreCount: 0,
          error: {
            code: 'not_found',
            recoverable: true,
          },
        },
      }
    }

    const variables = {
      char: character.name,
      user: metadata.userName || 'User',
    }
    const selectedUnits: TavernContextUnitPlan[] = []
    const droppedUnits: TavernContextUnitPlan[] = []
    const characterText = compileCharacterText(character, variables)
    if (characterText) {
      selectedUnits.push(
        unitPlan('character', {
          id: `tavern-character:${character.id}`,
          refId: character.id,
          text: characterText,
          priority: 965,
          required: true,
        })
      )
    }

    if (metadata.contextPreset !== 'compact') {
      character.messageExamples.forEach((example, index) => {
        const text = renderTavernTemplate(example, variables).trim()
        if (!text) return
        selectedUnits.push(
          unitPlan('example', {
            id: `tavern-example:${character.id}:${index}`,
            refId: character.id,
            text: `Example dialogue:\n${text}`,
            priority: 735,
            required: false,
          })
        )
      })
    }

    const postHistoryText = renderTavernTemplate(
      character.postHistoryInstructions,
      variables
    ).trim()
    if (postHistoryText) {
      selectedUnits.push(
        unitPlan('post-history', {
          id: `tavern-post-history:${character.id}`,
          refId: character.id,
          text: `Post-history instructions:\n${postHistoryText}`,
          priority: 925,
          required: true,
        })
      )
    }

    const lorebookIds = metadata.lorebookIds.length
      ? metadata.lorebookIds
      : character.defaultLorebookIds
    const lorebooks = this.tavernManager.getLorebooks(lorebookIds)
    const existingLorebookIds = new Set(lorebooks.map((lorebook) => lorebook.id))
    const missingLorebookIds = lorebookIds.filter((id) => !existingLorebookIds.has(id))
    const loreSelection = selectLoreUnits({
      lorebooks,
      candidateText: candidateText(
        input.messages,
        input.currentUserMessageId,
        this.recentMessageCount
      ),
      variables,
      budget: this.loreTokenBudget,
    })
    selectedUnits.push(...loreSelection.selected)
    droppedUnits.push(...loreSelection.dropped)

    const snapshot = tavernSnapshot({
      metadata,
      character,
      missingLorebookIds,
      selectedUnits,
      droppedUnits,
    })
    return {
      session: metadata,
      character,
      selectedUnits,
      droppedUnits,
      missingLorebookIds,
      snapshot,
    }
  }
}

function selectLoreUnits(input: {
  lorebooks: TavernLorebook[]
  candidateText: string
  variables: { char: string; user: string }
  budget: number
}): { selected: TavernContextUnitPlan[]; dropped: TavernContextUnitPlan[] } {
  const candidates: Array<{
    book: TavernLorebook
    entry: TavernLorebookEntry
    hitPosition: number
    trigger: 'constant' | 'keyword'
  }> = []
  const lower = input.candidateText.toLocaleLowerCase()
  for (const book of input.lorebooks) {
    if (book.enabled === false) continue
    for (const entry of book.entries) {
      if (entry.enabled === false) continue
      const hit = loreEntryHit(entry, lower)
      if (entry.constant) {
        candidates.push({ book, entry, hitPosition: hit.position, trigger: 'constant' })
        continue
      }
      if (hit.matched) {
        candidates.push({ book, entry, hitPosition: hit.position, trigger: 'keyword' })
      }
    }
  }

  const ordered = candidates.sort(
    (left, right) =>
      right.entry.priority - left.entry.priority ||
      left.entry.order - right.entry.order ||
      left.hitPosition - right.hitPosition ||
      left.entry.id.localeCompare(right.entry.id)
  )
  const selected: TavernContextUnitPlan[] = []
  const dropped: TavernContextUnitPlan[] = []
  let used = 0
  for (const candidate of ordered) {
    const text = renderTavernTemplate(candidate.entry.content, input.variables).trim()
    if (!text) continue
    const unit = unitPlan('lore', {
      id: `tavern-lore:${candidate.book.id}:${candidate.entry.id}`,
      refId: candidate.entry.id,
      lorebookId: candidate.book.id,
      text,
      priority: 785 + candidate.entry.priority,
      required: false,
      position: candidate.entry.position,
    })
    if (used + unit.estimatedTokens > input.budget) {
      dropped.push({ ...unit, droppedReason: 'tavern_lore_budget' })
      continue
    }
    used += unit.estimatedTokens
    selected.push(unit)
  }
  return { selected, dropped }
}

function loreEntryHit(
  entry: TavernLorebookEntry,
  lowerCandidateText: string
): { matched: boolean; position: number } {
  const primary = firstKeywordPosition(entry.keys, lowerCandidateText)
  if (primary < 0) {
    return { matched: false, position: Number.MAX_SAFE_INTEGER }
  }
  if (entry.selective && entry.secondaryKeys.length) {
    const secondary = firstKeywordPosition(entry.secondaryKeys, lowerCandidateText)
    if (secondary < 0) {
      return { matched: false, position: Number.MAX_SAFE_INTEGER }
    }
    return { matched: true, position: Math.min(primary, secondary) }
  }
  return { matched: true, position: primary }
}

function firstKeywordPosition(keys: readonly string[], lowerCandidateText: string): number {
  let position = Number.MAX_SAFE_INTEGER
  for (const key of keys) {
    const index = lowerCandidateText.indexOf(key.toLocaleLowerCase())
    if (index >= 0 && index < position) {
      position = index
    }
  }
  return position === Number.MAX_SAFE_INTEGER ? -1 : position
}

function compileCharacterText(
  character: TavernCharacter,
  variables: { char: string; user: string }
): string {
  const sections: string[] = []
  pushRenderedSection(sections, 'Character', character.name, variables)
  pushRenderedSection(sections, 'Description', character.description, variables)
  pushRenderedSection(sections, 'Personality', character.personality, variables)
  pushRenderedSection(sections, 'Scenario', character.scenario, variables)
  pushRenderedSection(sections, 'System prompt', character.systemPrompt, variables)
  return sections.join('\n\n')
}

function pushRenderedSection(
  sections: string[],
  label: string,
  value: string | undefined,
  variables: { char: string; user: string }
): void {
  const text = renderTavernTemplate(value, variables).trim()
  if (text) {
    sections.push(`${label}:\n${text}`)
  }
}

function candidateText(
  messages: ChatMessage[],
  currentUserMessageId: string,
  recentMessageCount: number
): string {
  const visible = messages
    .filter((message) => ['complete', 'streaming'].includes(message.status))
    .filter((message) => message.role === 'user' || message.role === 'assistant')
  const current = visible.find((message) => message.id === currentUserMessageId)
  const recent = visible.slice(-recentMessageCount)
  return [current, ...recent]
    .filter((message): message is ChatMessage => Boolean(message))
    .map(messageText)
    .filter(Boolean)
    .join('\n')
}

function messageText(message: ChatMessage): string {
  return message.parts
    .map((part) => {
      if (part.type === 'plain' && typeof part.text === 'string') return part.text
      if (part.type === 'reply' && typeof part.selectedText === 'string') return part.selectedText
      if (part.type === 'reply' && typeof part.selected_text === 'string') return part.selected_text
      return ''
    })
    .filter(Boolean)
    .join('\n')
}

function unitPlan(
  kind: TavernContextUnitKind,
  input: {
    id: string
    text: string
    priority: number
    required: boolean
    refId?: string
    lorebookId?: string
    position?: 'after-character' | 'before-history'
  }
): TavernContextUnitPlan {
  return {
    id: input.id,
    kind,
    text: input.text,
    refId: input.refId,
    lorebookId: input.lorebookId,
    priority: input.priority,
    required: input.required,
    estimatedTokens: estimateTextTokens(input.text),
    hash: hashSensitiveText(input.text),
    position: input.position,
  }
}

function tavernSnapshot(input: {
  metadata: TavernSessionMetadata
  character: TavernCharacter
  missingLorebookIds: string[]
  selectedUnits: TavernContextUnitPlan[]
  droppedUnits: TavernContextUnitPlan[]
}): TavernRequestSnapshotMetadata {
  const selected = groupAccounting(input.selectedUnits)
  const dropped = groupAccounting(input.droppedUnits)
  return {
    enabled: true,
    characterId: input.character.id,
    characterName: input.character.name,
    lorebookIds: input.metadata.lorebookIds,
    missingLorebookIds: input.missingLorebookIds,
    selectedGreetingIndex: input.metadata.selectedGreetingIndex,
    contextPreset: input.metadata.contextPreset,
    runProfile: 'low-noise',
    omittedInventoryReasons: [
      'tavern_run_profile_no_tool_inventory',
      'tavern_run_profile_no_skill_inventory',
    ],
    selectedLoreCount: selected.lore?.length ?? 0,
    droppedLoreCount: dropped.lore?.length ?? 0,
    selected,
    dropped,
  }
}

function groupAccounting(
  units: TavernContextUnitPlan[]
): NonNullable<TavernRequestSnapshotMetadata['selected']> {
  const output: NonNullable<TavernRequestSnapshotMetadata['selected']> = {}
  for (const unit of units) {
    const item: TavernContextUnitAccountingItem = {
      id: unit.refId ?? unit.id,
      lorebookId: unit.lorebookId,
      hash: unit.hash,
      estimatedTokens: unit.estimatedTokens,
      droppedReason: unit.droppedReason,
    }
    if (unit.kind === 'character') {
      output.character = [...(output.character ?? []), item]
    } else if (unit.kind === 'lore') {
      output.lore = [...(output.lore ?? []), item]
    } else if (unit.kind === 'example') {
      output.example = [...(output.example ?? []), item]
    } else if (unit.kind === 'post-history') {
      output.postHistory = [...(output.postHistory ?? []), item]
    }
  }
  return output
}

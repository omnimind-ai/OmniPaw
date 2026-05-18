import { join } from 'node:path'

import type {
  LocalSkillSummary,
  SetSkillEnabledRequest,
  SkillChangedEvent,
  SkillListResponse,
  SkillPromptContext,
  SkillReadResult,
} from '@shared/types/skill'
import {
  MAX_COMPACT_SKILL_DESCRIPTION_CHARS,
  MAX_SKILL_READ_CHARS,
  SKILL_ROOT_DIRECTORY_NAME,
  normalizeSkillId,
  skillError,
  SkillValidationError,
  truncateText,
} from './schema'
import { SkillLoader, type LoadedLocalSkill, type SkillRoot } from './loader'
import { SkillStateStore } from './store'

export interface SkillManagerOptions {
  userDataPath: string
  store?: SkillStateStore
  loader?: SkillLoader
  roots?: SkillRoot[]
  onChanged?: (event: SkillChangedEvent) => void
}

export interface BuildSkillPromptOptions {
  compact: boolean
  supportsSystemRole: boolean
}

export class SkillManager {
  private readonly store: SkillStateStore
  private readonly loader: SkillLoader
  private readonly roots: SkillRoot[]
  private discovered: LoadedLocalSkill[] = []
  private loaded = false
  private readSkillIds = new Set<string>()

  constructor(private readonly options: SkillManagerOptions) {
    this.store = options.store ?? new SkillStateStore({ userDataPath: options.userDataPath })
    this.loader = options.loader ?? new SkillLoader()
    this.roots = options.roots ?? [{
      name: 'local',
      path: join(options.userDataPath, SKILL_ROOT_DIRECTORY_NAME),
    }]
  }

  load(): SkillListResponse {
    this.store.load()
    this.discovered = this.loader.loadFromRoots(this.roots)
    this.loaded = true
    const response = this.list()
    this.emitChanged('load')
    return response
  }

  list(): SkillListResponse {
    this.ensureLoaded()
    return {
      skills: this.discovered.map((skill) => this.toSummary(skill)),
      status: this.store.status(),
      rootPath: this.roots[0]?.path,
    }
  }

  refresh(): SkillListResponse {
    this.store.get()
    this.discovered = this.loader.loadFromRoots(this.roots)
    this.loaded = true
    const response = this.list()
    this.emitChanged('refresh')
    return response
  }

  setEnabled(request: SetSkillEnabledRequest | string, enabled?: boolean): LocalSkillSummary {
    const skillId = typeof request === 'string' ? request : request.skillId
    const nextEnabled = typeof request === 'string' ? enabled : request.enabled
    if (typeof nextEnabled !== 'boolean') {
      throw new SkillValidationError(skillError('validation_failed', 'Enabled state must be boolean.', {
        issues: [{ path: 'enabled', message: 'Enabled state must be boolean.', code: 'invalid_type' }],
      }))
    }

    const id = normalizeSkillId(skillId)
    const skill = this.findDiscoveredSkill(id)
    if (!skill) {
      throw new SkillValidationError(skillError('not_found', `Skill was not found: ${id}`, {
        path: this.store.status().path,
        recoverable: false,
      }))
    }

    this.store.setEnabled(id, nextEnabled)
    const summary = this.toSummary(skill)
    this.emitChanged('enable')
    return summary
  }

  getActiveSkills(): LocalSkillSummary[] {
    this.ensureLoaded()
    return this.discovered
      .map((skill) => this.toSummary(skill))
      .filter((skill) => skill.enabled && skill.status === 'available')
  }

  buildPromptInventory(options: BuildSkillPromptOptions): SkillPromptContext {
    const activeSkills = this.getActiveSkills()
    if (!activeSkills.length) {
      return { enabledSkillIds: [], injected: false, omittedReason: 'no_enabled_skills' }
    }

    if (!options.supportsSystemRole) {
      return {
        enabledSkillIds: activeSkills.map((skill) => skill.id),
        injected: false,
        omittedReason: 'model_does_not_support_system_role',
      }
    }

    const maxDescription = options.compact ? MAX_COMPACT_SKILL_DESCRIPTION_CHARS : 240
    const lines = activeSkills.map((skill) => {
      const description = truncateText(skill.description || 'No description provided.', maxDescription)
      return options.compact
        ? `- ${skill.id}: ${description}`
        : `- ${skill.id} (${skill.name}): ${description}`
    })

    return {
      enabledSkillIds: activeSkills.map((skill) => skill.id),
      injected: true,
      content: [
        'Available local skills are listed below.',
        'Use the skill_read tool with a skillId before following a skill. Skills are instructions only and do not grant new tools or permissions.',
        ...lines,
      ].join('\n'),
    }
  }

  readEnabledSkillContent(skillId: string): SkillReadResult {
    const id = normalizeSkillId(skillId)
    const skill = this.findDiscoveredSkill(id)
    if (!skill) {
      throw new SkillValidationError(skillError('not_found', `Skill was not found: ${id}`, {
        recoverable: false,
      }))
    }
    const summary = this.toSummary(skill)
    if (!summary.enabled) {
      throw new SkillValidationError(skillError('validation_failed', `Skill is disabled: ${id}`, {
        recoverable: false,
      }))
    }
    if (summary.status !== 'available') {
      throw new SkillValidationError(skillError('read_failed', `Skill is not available: ${id}`, {
        recoverable: true,
      }))
    }

    const { content } = this.loader.readSkillFile(skill)
    this.readSkillIds.add(id)
    return {
      skillId: id,
      name: summary.name,
      content: truncateText(content, MAX_SKILL_READ_CHARS),
    }
  }

  drainReadSkillIds(): string[] {
    const ids = [...this.readSkillIds].sort()
    this.readSkillIds.clear()
    return ids
  }

  status(): ReturnType<SkillStateStore['status']> {
    return this.store.status()
  }

  private ensureLoaded(): void {
    if (!this.loaded) {
      this.load()
    }
  }

  private findDiscoveredSkill(skillId: string): LoadedLocalSkill | undefined {
    this.ensureLoaded()
    return this.discovered.find((skill) => skill.id === skillId)
  }

  private toSummary(skill: LoadedLocalSkill): LocalSkillSummary {
    const state = this.store.get()
    const enabled = state.enabledById[skill.id] ?? true
    return {
      id: skill.id,
      name: skill.name,
      description: skill.description,
      source: 'local',
      status: skill.status,
      enabled,
      rootName: skill.rootName,
      relativePath: skill.relativePath,
      metadata: { ...skill.metadata },
      compatibility: skill.metadata.compatibility,
      error: skill.error,
      updatedAt: skill.updatedAt,
    }
  }

  private emitChanged(reason: SkillChangedEvent['reason']): void {
    this.options.onChanged?.({
      reason,
      skills: this.list().skills,
      status: this.store.status(),
    })
  }
}

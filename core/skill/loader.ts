import type { SkillDefinition } from '@shared/types/skill'

export class SkillLoader {
  async loadFromDirectory(_directory: string): Promise<SkillDefinition[]> {
    return []
  }
}

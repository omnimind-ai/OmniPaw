import type { SkillDefinition } from '@shared/types/skill'

export class SkillManager {
  private readonly skills: SkillDefinition[] = [
    {
      name: 'system_time',
      description: '查询当前系统时间',
      enabled: true,
      parameters: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'clipboard_read',
      description: '读取剪贴板文本',
      enabled: false,
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  ]

  list(): SkillDefinition[] {
    return this.skills
  }
}

export type JsonSchema = Record<string, unknown>

export interface SkillDefinition {
  name: string
  description: string
  parameters: JsonSchema
  enabled: boolean
}

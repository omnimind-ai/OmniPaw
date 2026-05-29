import { createHash } from 'node:crypto'

export interface TavernTemplateVariables {
  char: string
  user: string
}

export function renderTavernTemplate(
  text: string | undefined,
  variables: TavernTemplateVariables
): string {
  if (!text) {
    return ''
  }
  return text
    .replace(/\{\{\s*char\s*\}\}/gi, variables.char)
    .replace(/\{\{\s*user\s*\}\}/gi, variables.user)
}

export function hashSensitiveText(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 16)
}

export function estimateTextTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4))
}

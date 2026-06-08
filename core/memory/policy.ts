import type { ChatSession, ChatSessionKind } from '@shared/types/chat'
import type { DesktopMemorySettings } from '@shared/types/memory'

const eligibleSessionKinds = new Set<ChatSessionKind>(['chat', 'cat'])

export class CompanionMemoryPolicyService {
  constructor(private readonly settings: () => DesktopMemorySettings | undefined) {}

  settingsSnapshot(): DesktopMemorySettings {
    return (
      this.settings() ?? {
        enabled: true,
        extractionEnabled: true,
        retrievalEnabled: true,
        minConfidence: 0.55,
        maxContextItems: 8,
        maxContextTokens: 900,
      }
    )
  }

  isEligibleSession(session: Pick<ChatSession, 'kind'> | undefined): boolean {
    return eligibleSessionKinds.has(session?.kind ?? 'chat')
  }

  canExtract(session: Pick<ChatSession, 'kind'> | undefined): boolean {
    const settings = this.settingsSnapshot()
    return settings.enabled && settings.extractionEnabled && this.isEligibleSession(session)
  }

  canRetrieve(session: Pick<ChatSession, 'kind'> | undefined): boolean {
    const settings = this.settingsSnapshot()
    return settings.enabled && settings.retrievalEnabled && this.isEligibleSession(session)
  }
}

import type { Session } from '@shared/types/chat'

export interface SessionRepo {
  list: () => Promise<Session[]>
  save: (session: Session) => Promise<void>
}

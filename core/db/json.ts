export function encodeJson(value: unknown): string | null {
  return value === undefined ? null : JSON.stringify(value)
}

export function decodeJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) {
    return fallback
  }

  return JSON.parse(value) as T
}

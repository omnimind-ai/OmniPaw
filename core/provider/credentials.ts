import { createRequire } from 'node:module'

export interface ProviderCredentialRecord {
  id: string
  providerId: string
  type: 'api-key' | 'bearer-token' | 'env'
  label?: string
  encryptedValue?: string
  value?: string
  envVar?: string
  createdAt?: number
  updatedAt?: number
}

export interface CredentialResolutionInput {
  providerId: string
  credentialRef?: string
  credentials?: ProviderCredentialRecord[]
  envVar?: string
  apiKey?: string
}

export interface ResolvedCredential {
  value: string
  source: 'safeStorage' | 'env' | 'inline'
  type: 'api-key' | 'bearer-token' | 'env'
}

export function encryptCredentialValue(value: string): string {
  const safeStorage = getSafeStorage()
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(value).toString('base64')
  }

  return `plain:${Buffer.from(value, 'utf8').toString('base64')}`
}

export function decryptCredentialValue(encryptedValue: string): string | undefined {
  if (encryptedValue.startsWith('plain:')) {
    return Buffer.from(encryptedValue.slice('plain:'.length), 'base64').toString('utf8')
  }

  const safeStorage = getSafeStorage()
  if (!safeStorage.isEncryptionAvailable()) {
    return undefined
  }

  return safeStorage.decryptString(Buffer.from(encryptedValue, 'base64'))
}

interface SafeStorageLike {
  isEncryptionAvailable(): boolean
  encryptString(value: string): Buffer
  decryptString(value: Buffer): string
}

const fallbackSafeStorage: SafeStorageLike = {
  isEncryptionAvailable: () => false,
  encryptString: (value) => Buffer.from(value, 'utf8'),
  decryptString: (value) => value.toString('utf8'),
}

function getSafeStorage(): SafeStorageLike {
  if (!process.versions.electron || process.env.ELECTRON_RUN_AS_NODE === '1') {
    return fallbackSafeStorage
  }

  try {
    const require = createRequire(import.meta.url)
    const electron = require('electron') as { safeStorage?: SafeStorageLike }
    return electron.safeStorage ?? fallbackSafeStorage
  } catch {
    return fallbackSafeStorage
  }
}

export function resolveCredential(input: CredentialResolutionInput): ResolvedCredential | undefined {
  const credential = selectCredential(input)

  if (credential?.type === 'env' && credential.envVar) {
    const value = process.env[credential.envVar]
    return value ? { value, source: 'env', type: 'env' } : undefined
  }

  if (credential?.encryptedValue) {
    const value = decryptCredentialValue(credential.encryptedValue)
    if (value) {
      return {
        value,
        source: credential.encryptedValue.startsWith('plain:') ? 'inline' : 'safeStorage',
        type: credential.type,
      }
    }
  }

  if (credential?.value) {
    return {
      value: credential.value,
      source: 'inline',
      type: credential.type,
    }
  }

  if (input.envVar) {
    const value = process.env[input.envVar]
    if (value) {
      return { value, source: 'env', type: 'env' }
    }
  }

  if (input.apiKey) {
    return { value: input.apiKey, source: 'inline', type: 'api-key' }
  }

  return undefined
}

function selectCredential(input: CredentialResolutionInput): ProviderCredentialRecord | undefined {
  if (!input.credentials?.length) {
    return undefined
  }

  if (input.credentialRef) {
    return input.credentials.find((credential) => credential.id === input.credentialRef)
  }

  return input.credentials.find((credential) => credential.providerId === input.providerId)
}

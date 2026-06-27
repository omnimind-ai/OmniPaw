import type { StagedFileInfo } from '@/composables/useMediaHandling'

export interface AttachmentPreset {
  labelKey: string
  promptKey: string
}

const BASE = 'chat.composer.attachmentPresets'

function preset(category: string, name: string): AttachmentPreset {
  return {
    labelKey: `${BASE}.${category}.${name}.label`,
    promptKey: `${BASE}.${category}.${name}.prompt`,
  }
}

const IMAGE_PRESETS: AttachmentPreset[] = [
  preset('image', 'describe'),
  preset('image', 'extractText'),
]

const CODE_PRESETS: AttachmentPreset[] = [preset('code', 'explain'), preset('code', 'complete')]

const DATA_PRESETS: AttachmentPreset[] = [preset('data', 'analyze'), preset('data', 'extract')]

const DOCUMENT_PRESETS: AttachmentPreset[] = [
  preset('document', 'summarize'),
  preset('document', 'complete'),
]

const DEFAULT_PRESETS: AttachmentPreset[] = [
  preset('default', 'summarize'),
  preset('default', 'extract'),
]

export function presetsForAttachment(file: StagedFileInfo): AttachmentPreset[] {
  const extension = fileExtension(file.filename || file.original_name)
  const mimeType = file.mimeType || ''

  if (file.type === 'image' || mimeType.startsWith('image/')) {
    return IMAGE_PRESETS
  }

  if (isCodeExtension(extension)) {
    return CODE_PRESETS
  }

  if (isDataExtension(extension) || isDataMimeType(mimeType)) {
    return DATA_PRESETS
  }

  if (isDocumentExtension(extension) || mimeType.startsWith('text/')) {
    return DOCUMENT_PRESETS
  }

  return DEFAULT_PRESETS
}

function fileExtension(filename?: string) {
  const name = filename?.trim() || ''
  const lastDot = name.lastIndexOf('.')
  if (lastDot <= 0 || lastDot === name.length - 1) return ''
  return name.slice(lastDot + 1).toLowerCase()
}

function isCodeExtension(extension: string) {
  return [
    'c',
    'cc',
    'cpp',
    'cs',
    'css',
    'go',
    'h',
    'hpp',
    'html',
    'java',
    'js',
    'jsx',
    'kt',
    'lua',
    'mjs',
    'php',
    'py',
    'rb',
    'rs',
    'scss',
    'sh',
    'svelte',
    'swift',
    'ts',
    'tsx',
    'vue',
  ].includes(extension)
}

function isDataExtension(extension: string) {
  return ['csv', 'json', 'jsonl', 'ndjson', 'toml', 'tsv', 'xml', 'yaml', 'yml'].includes(extension)
}

function isDataMimeType(mimeType: string) {
  return [
    'application/json',
    'application/jsonl',
    'application/x-ndjson',
    'application/xml',
    'text/csv',
    'text/tab-separated-values',
    'text/xml',
    'text/yaml',
  ].includes(mimeType)
}

function isDocumentExtension(extension: string) {
  return ['conf', 'ini', 'log', 'md', 'mdx', 'rst', 'text', 'txt'].includes(extension)
}

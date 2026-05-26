const COMPLEX_DOCUMENT_EXTENSIONS = new Set(['.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'])

const COMPLEX_DOCUMENT_MIME_TYPES = new Set([
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
])

export function isComplexDocumentAttachment(input: {
  name?: string
  filename?: string
  originalName?: string
  mimeType?: string
  type?: string
}): boolean {
  const mimeType = normalizeMimeType(input.mimeType ?? input.type)
  if (mimeType && COMPLEX_DOCUMENT_MIME_TYPES.has(mimeType)) {
    return true
  }

  const name = input.originalName ?? input.filename ?? input.name ?? ''
  return COMPLEX_DOCUMENT_EXTENSIONS.has(extensionOf(name))
}

export function inferComplexDocumentMimeType(name: string): string | undefined {
  switch (extensionOf(name)) {
    case '.doc':
      return 'application/msword'
    case '.docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    case '.xls':
      return 'application/vnd.ms-excel'
    case '.xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    case '.ppt':
      return 'application/vnd.ms-powerpoint'
    case '.pptx':
      return 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    default:
      return undefined
  }
}

function normalizeMimeType(value: string | undefined): string {
  return String(value ?? '')
    .split(';', 1)[0]
    .trim()
    .toLowerCase()
}

function extensionOf(name: string): string {
  const match = String(name)
    .toLowerCase()
    .match(/\.[^.\\/]+$/)
  return match?.[0] ?? ''
}

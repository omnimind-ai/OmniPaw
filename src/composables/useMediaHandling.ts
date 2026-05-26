import { computed, ref } from 'vue'

import { appBridge } from '@/bridge/app'
import { logger } from '@/utils/logger'
import { errorToText, useToast } from '@/utils/toast'

export const ATTACHMENT_LIMITS = {
  maxFileBytes: 25 * 1024 * 1024,
  maxFilesPerMessage: 12,
} as const

export type StagedAttachmentType = 'image' | 'record' | 'file' | 'video'
export type StagedUploadStatus = 'pending' | 'uploaded' | 'failed'

export interface StagedFileInfo {
  attachmentId: string
  attachment_id?: string
  filename: string
  original_name: string
  url: string
  type: StagedAttachmentType
  signature?: string
  size?: number
  mimeType?: string
  status?: 'uploaded'
}

export interface StagedUploadItem {
  id: string
  attachmentId?: string
  attachment_id?: string
  filename: string
  original_name: string
  url: string
  type: StagedAttachmentType
  signature?: string
  size: number
  mimeType: string
  status: StagedUploadStatus
  error?: string
}

const mediaLogger = logger.child('chat.media')

export function useMediaHandling() {
  const toast = useToast()
  const stagedAudioUrl = ref<string>('')
  const stagedFiles = ref<StagedFileInfo[]>([])
  const stagedUploadItems = ref<StagedUploadItem[]>([])
  const mediaCache = ref<Record<string, string>>({})
  const pendingFileSignatures = new Set<string>()

  async function getFileSignature(file: File): Promise<string> {
    if (crypto?.subtle) {
      const buffer = await file.arrayBuffer()
      const digest = await crypto.subtle.digest('SHA-256', buffer)
      const hash = Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('')
      return `sha256:${hash}`
    }

    return `meta:${file.name}:${file.size}:${file.type}:${file.lastModified}`
  }

  function isDuplicateFile(signature: string) {
    return (
      pendingFileSignatures.has(signature) ||
      stagedFiles.value.some((file) => file.signature === signature) ||
      stagedUploadItems.value.some(
        (item) => item.signature === signature && item.status !== 'failed'
      )
    )
  }

  async function getMediaFile(filename: string): Promise<string> {
    if (mediaCache.value[filename]) {
      return mediaCache.value[filename]
    }

    try {
      const preview = await appBridge.attachment?.getPreviewUrl(filename)
      const url = typeof preview === 'string' ? preview : preview?.url || ''
      mediaCache.value[filename] = url
      return url
    } catch (error) {
      mediaLogger.error('Failed to fetch media preview.', { filename, error })
      toast.error(error, { description: '媒体预览加载失败' })
      return ''
    }
  }

  async function uploadFiles(files: Iterable<File>) {
    for (const file of files) {
      await uploadStagedFile(file)
    }
  }

  // TODO: 这个函数目前和 processAndUploadImage 没有区别，后续可以根据需要添加针对非图片文件的特殊处理逻辑
  async function uploadStagedFile(file: File) {
    if (isPdfFile(file.name, file.type)) {
      addFailedUploadItem(file, '当前暂不支持 PDF 附件。')
      return
    }

    const unsupportedMediaType = unsupportedAudioVideoType(file.name, file.type)
    if (unsupportedMediaType) {
      addFailedUploadItem(file, `当前暂不支持${unsupportedMediaType}附件。`)
      return
    }

    if (file.size > ATTACHMENT_LIMITS.maxFileBytes) {
      addFailedUploadItem(file, `单个附件不能超过 ${formatBytes(ATTACHMENT_LIMITS.maxFileBytes)}。`)
      return
    }

    if (activeAttachmentCount() >= ATTACHMENT_LIMITS.maxFilesPerMessage) {
      addFailedUploadItem(file, `每条消息最多添加 ${ATTACHMENT_LIMITS.maxFilesPerMessage} 个附件。`)
      return
    }

    const signature = await getFileSignature(file)
    if (isDuplicateFile(signature)) {
      addFailedUploadItem(file, '已添加相同附件。', signature)
      return
    }

    pendingFileSignatures.add(signature)
    const localUrl = createPreviewUrl(file)
    const uploadItem = createUploadItem(file, {
      signature,
      status: 'pending',
      url: localUrl,
    })
    stagedUploadItems.value.push(uploadItem)

    try {
      const attachment = await appBridge.attachment?.upload({
        name: file.name,
        type: file.type || 'application/octet-stream',
        size: file.size,
        bytes: await file.arrayBuffer(),
      })
      if (!attachment) {
        throw new Error('Attachment upload is not available.')
      }

      const attachmentId = attachment.id
      const filename = attachment.originalName || attachment.filename || file.name
      const type = mapAttachmentKind(attachment.kind, attachment.mimeType || file.type)
      const stagedFile: StagedFileInfo = {
        attachmentId,
        attachment_id: attachmentId,
        filename,
        original_name: file.name,
        url: attachment.previewUrl || attachment.url || localUrl,
        type,
        signature,
        size: attachment.sizeBytes || file.size,
        mimeType: attachment.mimeType || file.type || 'application/octet-stream',
        status: 'uploaded',
      }

      stagedFiles.value.push(stagedFile)
      Object.assign(uploadItem, stagedFile, {
        id: uploadItem.id,
        size: stagedFile.size || file.size,
        mimeType: stagedFile.mimeType || file.type || 'application/octet-stream',
        status: 'uploaded' as const,
        error: undefined,
      })
      if (stagedFile.url !== localUrl) {
        revokeUrl(localUrl)
      }
    } catch (err) {
      mediaLogger.error('Failed to upload attachment.', {
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        error: err,
      })
      uploadItem.status = 'failed'
      uploadItem.error = errorToText(err)
      removeStagedFileBySignature(signature, false)
      toast.error(err, { description: '附件上传失败' })
    } finally {
      pendingFileSignatures.delete(signature)
    }
  }

  async function processAndUploadImage(file: File) {
    await uploadStagedFile(file)
  }

  async function processAndUploadFile(file: File) {
    await uploadStagedFile(file)
  }

  async function handlePaste(event: ClipboardEvent) {
    const items = event.clipboardData?.items
    if (!items) return

    for (let i = 0; i < items.length; i++) {
      const file = items[i].getAsFile()
      if (file) {
        await uploadStagedFile(file)
      }
    }
  }

  function removeImage(index: number) {
    // 找到第 index 个图片类型的文件
    let imageCount = 0
    for (let i = 0; i < stagedFiles.value.length; i++) {
      if (stagedFiles.value[i].type === 'image') {
        if (imageCount === index) {
          removeStagedFileAt(i)
          return
        }
        imageCount++
      }
    }
  }

  function removeAudio() {
    stagedAudioUrl.value = ''
  }

  function removeFile(index: number) {
    // 找到第 index 个非图片类型的文件
    let fileCount = 0
    for (let i = 0; i < stagedFiles.value.length; i++) {
      if (stagedFiles.value[i].type !== 'image') {
        if (fileCount === index) {
          removeStagedFileAt(i)
          return
        }
        fileCount++
      }
    }
  }

  function removeStagedFile(index: number) {
    removeStagedFileAt(index)
  }

  function removeUploadItem(index: number) {
    const [item] = stagedUploadItems.value.splice(index, 1)
    if (!item) return

    if (item.status === 'failed') {
      revokeUrl(item.url)
    } else if (item.signature) {
      removeStagedFileBySignature(item.signature, true)
    } else if (item.attachmentId) {
      removeStagedFileByAttachmentId(item.attachmentId, true)
    } else {
      revokeUrl(item.url)
    }
  }

  function clearStaged(options: { revokeUrls?: boolean } = {}) {
    const { revokeUrls = true } = options
    stagedAudioUrl.value = ''
    if (revokeUrls) {
      const urls = new Set<string>()
      stagedFiles.value.forEach((file) => urls.add(file.url))
      stagedUploadItems.value.forEach((item) => urls.add(item.url))
      urls.forEach(revokeUrl)
    }
    stagedFiles.value = []
    stagedUploadItems.value = []
    pendingFileSignatures.clear()
  }

  function cleanupMediaCache() {
    Object.values(mediaCache.value).forEach((url) => {
      revokeUrl(url)
    })
    mediaCache.value = {}
  }

  // 计算属性：获取图片的 URL 列表（用于预览）
  const stagedImagesUrl = computed(() =>
    stagedFiles.value.filter((f) => f.type === 'image').map((f) => f.url)
  )

  // 计算属性：获取非图片文件列表
  const stagedNonImageFiles = computed(() => stagedFiles.value.filter((f) => f.type !== 'image'))

  const uploadPending = computed(() =>
    stagedUploadItems.value.some((item) => item.status === 'pending')
  )

  const uploadFailures = computed(() =>
    stagedUploadItems.value.filter((item) => item.status === 'failed')
  )

  return {
    ATTACHMENT_LIMITS,
    stagedImagesUrl,
    stagedAudioUrl,
    stagedFiles,
    stagedUploadItems,
    stagedNonImageFiles,
    uploadPending,
    uploadFailures,
    getMediaFile,
    uploadFiles,
    uploadStagedFile,
    processAndUploadImage,
    processAndUploadFile,
    handlePaste,
    removeImage,
    removeAudio,
    removeFile,
    removeStagedFile,
    removeUploadItem,
    clearStaged,
    cleanupMediaCache,
  }

  function activeAttachmentCount() {
    return (
      stagedFiles.value.length +
      stagedUploadItems.value.filter((item) => item.status === 'pending').length
    )
  }

  function createUploadItem(
    file: File,
    options: { signature?: string; status: StagedUploadStatus; url?: string; error?: string }
  ): StagedUploadItem {
    return {
      id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
      filename: file.name || 'attachment',
      original_name: file.name || 'attachment',
      url: options.url || createPreviewUrl(file),
      type: mapAttachmentKind(undefined, file.type),
      signature: options.signature,
      size: file.size,
      mimeType: file.type || 'application/octet-stream',
      status: options.status,
      error: options.error,
    }
  }

  function addFailedUploadItem(file: File, error: string, signature?: string) {
    stagedUploadItems.value.push(
      createUploadItem(file, {
        signature,
        status: 'failed',
        error,
      })
    )
    toast.error(error, { description: file.name || '附件上传失败' })
  }

  function removeStagedFileAt(index: number) {
    const [fileToRemove] = stagedFiles.value.splice(index, 1)
    if (!fileToRemove) return

    const uploadIndex = stagedUploadItems.value.findIndex(
      (item) =>
        (fileToRemove.signature && item.signature === fileToRemove.signature) ||
        item.attachmentId === fileToRemove.attachmentId ||
        item.attachment_id === fileToRemove.attachmentId
    )
    if (uploadIndex !== -1) {
      const [item] = stagedUploadItems.value.splice(uploadIndex, 1)
      revokeUrl(item?.url)
    }
    revokeUrl(fileToRemove.url)
  }

  function removeStagedFileBySignature(signature: string, revokeUrls: boolean) {
    const index = stagedFiles.value.findIndex((file) => file.signature === signature)
    if (index === -1) return
    const [file] = stagedFiles.value.splice(index, 1)
    if (revokeUrls) revokeUrl(file?.url)
  }

  function removeStagedFileByAttachmentId(attachmentId: string, revokeUrls: boolean) {
    const index = stagedFiles.value.findIndex(
      (file) => file.attachmentId === attachmentId || file.attachment_id === attachmentId
    )
    if (index === -1) return
    const [file] = stagedFiles.value.splice(index, 1)
    if (revokeUrls) revokeUrl(file?.url)
  }
}

function mapAttachmentKind(kind?: string, mimeType?: string): StagedAttachmentType {
  if (kind === 'audio') return 'record'
  if (kind === 'image' || kind === 'video' || kind === 'file') return kind
  if (mimeType?.startsWith('image/')) return 'image'
  if (mimeType?.startsWith('audio/')) return 'record'
  if (mimeType?.startsWith('video/')) return 'video'
  return 'file'
}

function isPdfFile(name?: string, mimeType?: string): boolean {
  return mimeType === 'application/pdf' || /\.pdf$/i.test(name || '')
}

function unsupportedAudioVideoType(name?: string, mimeType?: string): '音频' | '视频' | '' {
  if (
    mimeType?.startsWith('audio/') ||
    /\.(aac|flac|m4a|mp3|oga|ogg|opus|wav)$/i.test(name || '')
  ) {
    return '音频'
  }
  if (
    mimeType?.startsWith('video/') ||
    /\.(avi|m4v|mkv|mov|mp4|mpeg|mpg|webm|wmv)$/i.test(name || '')
  ) {
    return '视频'
  }
  return ''
}

function createPreviewUrl(file: File) {
  if (
    file.type.startsWith('image/') ||
    file.type.startsWith('audio/') ||
    file.type.startsWith('video/')
  ) {
    return URL.createObjectURL(file)
  }
  return ''
}

function revokeUrl(url?: string) {
  if (url?.startsWith('blob:')) {
    URL.revokeObjectURL(url)
  }
}

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`
}

import { toast as sonnerToast, type ExternalToast } from 'vue-sonner'

export type ToastLevel = 'success' | 'error' | 'info' | 'warning'
export type ToastMessage = string | Error | unknown
export type ToastOptions = ExternalToast

export interface ToastApi {
  toast: (message: ToastMessage, level?: ToastLevel, options?: ToastOptions) => string | number
  success: (message: ToastMessage, options?: ToastOptions) => string | number
  error: (message: ToastMessage, options?: ToastOptions) => string | number
  info: (message: ToastMessage, options?: ToastOptions) => string | number
  warning: (message: ToastMessage, options?: ToastOptions) => string | number
}

export function useToast(): ToastApi {
  const notify = (
    message: ToastMessage,
    level: ToastLevel = 'info',
    options?: ToastOptions,
  ) => {
    const text = errorToText(message)
    if (level === 'success') return sonnerToast.success(text, options)
    if (level === 'error') return sonnerToast.error(text, options)
    if (level === 'warning') return sonnerToast.warning(text, options)
    return sonnerToast.info(text, options)
  }

  return {
    toast: notify,
    success: (message, options) => notify(message, 'success', options),
    error: (message, options) => notify(message, 'error', options),
    info: (message, options) => notify(message, 'info', options),
    warning: (message, options) => notify(message, 'warning', options),
  }
}

export function errorToText(error: ToastMessage, fallback = '操作失败。') {
  if (!error) return fallback
  if (error instanceof Error) return error.message || fallback
  if (typeof error === 'string') return error || fallback
  if (typeof error === 'object' && error && 'message' in error) {
    return String((error as { message?: unknown }).message || fallback)
  }
  return String(error)
}

export type ToastLevel = "success" | "error" | "info" | "warning";

export interface ToastApi {
  toast: (message: string, level?: ToastLevel) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  warning: (message: string) => void;
}

export function useToast(): ToastApi;
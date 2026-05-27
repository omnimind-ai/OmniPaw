import type {
  ObservationCapturedFrame,
  ObservationCaptureRequest,
  ObservationPermissionStatus,
} from '@shared/types/observation'

export interface DesktopCaptureAdapter {
  permissionStatus: () => Promise<ObservationPermissionStatus> | ObservationPermissionStatus
  capture: (request: ObservationCaptureRequest) => Promise<ObservationCapturedFrame>
  cleanupCapture?: (captureId: string) => Promise<void> | void
  cleanupAll?: () => Promise<void> | void
}

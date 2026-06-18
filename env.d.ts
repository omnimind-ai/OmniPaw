/// <reference types="vite/client" />

declare const __APP_VERSION__: string
declare const __BUILD_TIME__: string
declare const __GIT_COMMIT__: string
declare const __OMNIINFER_PACKAGED__: boolean

declare module '*.vue' {
  import type { DefineComponent } from 'vue'

  const component: DefineComponent<object, object, unknown>
  export default component
}

declare module '*.mjs' {
  const value: unknown
  export const isComposingEnter: (
    event: KeyboardEvent,
    compositionActive?: boolean,
    lastCompositionEndAt?: number | null
  ) => boolean
  export default value
}

/// <reference types="vite/client" />

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
    lastCompositionEndAt?: number | null,
  ) => boolean
  export default value
}

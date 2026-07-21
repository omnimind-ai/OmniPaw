import type { InjectionKey, Ref } from 'vue'

export const APP_FLOATING_COLLISION_PADDING = 8

export const appFloatingBoundaryKey: InjectionKey<Readonly<Ref<Element | null>>> =
  Symbol('appFloatingBoundary')

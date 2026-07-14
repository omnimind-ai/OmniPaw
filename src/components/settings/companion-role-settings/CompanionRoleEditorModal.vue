<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import CompanionRoleEditor from '@/components/settings/companion-role-settings/CompanionRoleEditor.vue'
import type { CompanionRole } from '@/components/settings/companion-role-settings/types'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const open = defineModel<boolean>('open', { required: true })

defineProps<{
  role?: CompanionRole
  isActiveRole: boolean
  canDeleteRole: boolean
}>()

const emit = defineEmits<{
  deleteRole: [role: CompanionRole]
  exportRole: []
}>()

const { t } = useI18n()
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent
      :show-close-button="false"
      class="h-[calc(100svh-var(--app-window-content-top)-2rem)] max-h-[52rem] w-[calc(100%-2rem)] max-w-6xl gap-0 overflow-hidden p-0 sm:max-w-6xl"
    >
      <DialogHeader class="sr-only">
        <DialogTitle>
          {{ role?.name || t('settings.catAppearance.role.unnamed') }}
        </DialogTitle>
        <DialogDescription>
          {{ t('settings.catAppearance.role.overview.modalDescription') }}
        </DialogDescription>
      </DialogHeader>

      <CompanionRoleEditor
        v-if="role"
        :role="role"
        :is-active-role="isActiveRole"
        :can-delete-role="canDeleteRole"
        :show-close-action="true"
        class="rounded-none border-0 shadow-none"
        @close="open = false"
        @export-role="emit('exportRole')"
        @delete-role="emit('deleteRole', $event)"
      />
    </DialogContent>
  </Dialog>
</template>

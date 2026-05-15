import 'vuetify/styles'

import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

import '@/assets/mdi-subset/materialdesignicons-subset.css'
import { PurpleThemeDark } from '@/theme/DarkTheme'
import { PurpleTheme } from '@/theme/LightTheme'

export default createVuetify({
  components,
  directives,
  theme: {
    defaultTheme: 'PurpleTheme',
    themes: {
      PurpleTheme,
      PurpleThemeDark,
    },
  },
  defaults: {
    VCard: {
      rounded: 'lg',
    },
    VTextField: {
      rounded: 'lg',
    },
    VTooltip: {
      location: 'top',
    },
  },
})

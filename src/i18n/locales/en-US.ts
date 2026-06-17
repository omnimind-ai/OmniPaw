export default {
  settings: {
    sidebar: {
      title: 'Settings',
      backToChat: 'Back to chat',
      capabilities: 'Capabilities',
      nav: {
        providers: 'Model services',
        defaults: 'Default models',
        general: 'General',
        shortcuts: 'Shortcuts',
        agent: 'Agent capabilities',
        personas: 'Personas',
        memory: 'Memory',
        tavern: 'Tavern',
        tools: 'Tools',
        observation: 'Vision observation',
        skills: 'Skills',
        schedule: 'Scheduled tasks',
        about: 'About',
      },
    },
    general: {
      title: 'General',
      description: 'Adjust interface display and window behavior.',
      language: {
        title: 'Language',
        description: 'Switch the desktop interface language.',
        placeholder: 'Select language',
        system: 'System default',
        zhCN: 'Chinese',
        enUS: 'English',
      },
      theme: {
        title: 'Theme',
        description: 'Follow the system theme or use a fixed light or dark theme.',
        placeholder: 'Select theme',
        system: 'System default',
        light: 'Light',
        dark: 'Dark',
      },
      zoom: {
        title: 'Zoom',
        description: 'Current range: {min} - {max}.',
      },
      minimizeToTray: {
        title: 'Close/minimize to tray',
        description: 'Keep the app available in the background after closing or minimizing.',
      },
      showReasoning: {
        title: 'Show model reasoning',
        description: 'Hide model reasoning and thinking blocks in conversations when disabled.',
      },
      chat: {
        title: 'Chat',
        description: 'Control context, attachments, and compaction behavior.',
        maxRecent: {
          title: 'Recent context messages',
          description: 'Number of recent messages kept before sending to the model.',
        },
        inputBudget: {
          title: 'Input budget limit',
          description: 'Maximum input ratio retained against the model context window.',
        },
        attachments: {
          title: 'Attachment policy',
          description: 'Choose which attachments enter context by default.',
          placeholder: 'Select attachment policy',
          currentOnly: 'Current message only',
          recent: 'Recent messages',
          never: 'Never include attachments',
        },
        autoCompact: {
          title: 'Auto compact context',
          description: 'Automatically maintain conversation context summaries after the threshold.',
        },
        compactThreshold: {
          title: 'Compaction threshold',
          description: 'Trigger auto compaction by input budget percentage.',
        },
        compactSkills: {
          title: 'Compact tool descriptions',
          description: 'Reduce context used by tool descriptions.',
        },
      },
    },
  },
}

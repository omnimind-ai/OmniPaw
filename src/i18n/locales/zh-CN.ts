export default {
  settings: {
    sidebar: {
      title: '设置',
      backToChat: '返回对话',
      capabilities: '能力',
      nav: {
        providers: '模型服务',
        defaults: '默认模型',
        general: '常规设置',
        shortcuts: '快捷键',
        agent: 'Agent 能力',
        personas: '人格',
        memory: '记忆',
        tavern: '酒馆',
        tools: '工具',
        observation: '视觉观察',
        skills: '技能',
        schedule: '计划任务',
        about: '关于我们',
      },
    },
    general: {
      title: '常规设置',
      description: '调整界面显示和窗口行为。',
      language: {
        title: '语言',
        description: '切换桌面端界面语言。',
        placeholder: '选择语言',
        system: '系统默认',
        zhCN: '中文',
        enUS: 'English',
      },
      theme: {
        title: '主题',
        description: '跟随系统或固定为亮色、深色。',
        placeholder: '选择主题',
        system: '系统默认',
        light: '亮色',
        dark: '深色',
      },
      zoom: {
        title: '缩放比例',
        description: '当前范围 {min} - {max}。',
      },
      minimizeToTray: {
        title: '关闭/最小化到托盘',
        description: '关闭或最小化主窗口后保持后台可用。',
      },
      showReasoning: {
        title: '显示模型思考内容',
        description: '关闭后对话中隐藏模型推理和思考内容块。',
      },
      chat: {
        title: '对话设置',
        description: '控制上下文、附件和压缩策略。',
        maxRecent: {
          title: '上下文最近消息数',
          description: '发送给模型前保留的最近消息数量。',
        },
        inputBudget: {
          title: '输入预算上限',
          description: '按模型上下文窗口保留的最大输入比例。',
        },
        attachments: {
          title: '附件策略',
          description: '选择默认进入上下文的附件范围。',
          placeholder: '选择附件策略',
          currentOnly: '仅当前消息',
          recent: '最近消息',
          never: '不包含附件',
        },
        autoCompact: {
          title: '自动压缩上下文',
          description: '达到阈值后自动维护会话上下文摘要。',
        },
        compactThreshold: {
          title: '压缩阈值',
          description: '按输入预算百分比触发自动压缩。',
        },
        compactSkills: {
          title: '压缩工具描述',
          description: '减少工具描述占用的上下文长度。',
        },
      },
    },
  },
}

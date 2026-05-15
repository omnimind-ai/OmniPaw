import { computed, onBeforeUnmount, reactive, ref, type Ref } from "vue";
import { appBridge, type BridgeChatMessage, type BridgeChatMessagePart, type BridgeStreamEvent } from "@/bridge/app";

export type TransportMode = "sse" | "websocket";

export interface MessagePart {
  type: string;
  text?: string;
  think?: string;
  message_id?: string | number;
  selected_text?: string;
  embedded_url?: string;
  embedded_file?: { url?: string; filename?: string; attachment_id?: string };
  attachment_id?: string;
  filename?: string;
  tool_calls?: ToolCall[];
  [key: string]: unknown;
}

export interface ToolCall {
  id?: string;
  name?: string;
  arguments?: unknown;
  result?: unknown;
  ts?: number;
  finished_ts?: number;
  [key: string]: unknown;
}

export interface ChatContent {
  type: "user" | "bot" | string;
  message: MessagePart[];
  reasoning?: string;
  isLoading?: boolean;
  agentStats?: any;
  refs?: any;
}

export interface MessageDisplayBlock {
  kind: "thinking" | "content";
  parts: MessagePart[];
}

export interface ChatRecord {
  id?: string | number;
  content: ChatContent;
  created_at?: string;
  sender_id?: string;
  sender_name?: string;
  llm_checkpoint_id?: string | null;
  threads?: ChatThread[];
}

export interface ChatThread {
  thread_id: string;
  parent_session_id: string;
  parent_message_id: number;
  base_checkpoint_id: string;
  selected_text: string;
  created_at?: string;
  updated_at?: string;
}

export interface ChatSessionProject {
  project_id: string;
  title: string;
  emoji?: string;
}

interface ActiveConnection {
  sessionId: string;
  messageId: string;
  transport: TransportMode;
  runId?: string;
  unsubscribe?: () => void;
}

interface SendMessageStreamOptions {
  sessionId: string;
  messageId: string;
  parts: MessagePart[];
  transport: TransportMode;
  enableStreaming?: boolean;
  selectedProvider?: string;
  selectedModel?: string;
  userRecord?: ChatRecord;
  botRecord: ChatRecord;
  skipUserHistory?: boolean;
  llmCheckpointId?: string | null;
}

interface ContinueEditedMessageOptions {
  sessionId: string;
  sourceRecord: ChatRecord;
  enableStreaming?: boolean;
  selectedProvider?: string;
  selectedModel?: string;
}

interface CreateLocalExchangeOptions {
  sessionId: string;
  messageId: string;
  parts: MessagePart[];
}

interface UseMessagesOptions {
  currentSessionId: Ref<string>;
  onSessionsChanged?: () => Promise<void> | void;
  onStreamUpdate?: (sessionId: string) => void;
}

export function useMessages(options: UseMessagesOptions) {
  const loadingMessages = ref(false);
  const sending = ref(false);
  const messagesBySession = reactive<Record<string, ChatRecord[]>>({});
  const loadedSessions = reactive<Record<string, boolean>>({});
  const activeConnections = reactive<Record<string, ActiveConnection>>({});
  const attachmentBlobCache = new Map<string, Promise<string>>();
  const sessionProjects = reactive<Record<string, ChatSessionProject | null>>(
    {},
  );

  const activeMessages = computed(() =>
    options.currentSessionId.value
      ? messagesBySession[options.currentSessionId.value] || []
      : [],
  );

  onBeforeUnmount(() => {
    cleanupConnections();
    for (const promise of attachmentBlobCache.values()) {
      promise.then((url) => URL.revokeObjectURL(url)).catch(() => {});
    }
    attachmentBlobCache.clear();
  });

  function isSessionRunning(sessionId: string) {
    return Boolean(activeConnections[sessionId]);
  }

  function isUserMessage(msg: ChatRecord) {
    return messageContent(msg).type === "user";
  }

  function messageContent(msg: ChatRecord): ChatContent {
    return msg.content || { type: "bot", message: [] };
  }

  function messageParts(msg: ChatRecord): MessagePart[] {
    const parts = messageContent(msg).message;
    if (Array.isArray(parts)) return parts;
    if (typeof parts === "string") return [{ type: "plain", text: parts }];
    return [];
  }

  function isMessageStreaming(msg: ChatRecord, msgIndex: number) {
    if (
      !options.currentSessionId.value ||
      !isSessionRunning(options.currentSessionId.value)
    ) {
      return false;
    }
    return !isUserMessage(msg) && msgIndex === activeMessages.value.length - 1;
  }

  async function resolvePartMedia(part: MessagePart): Promise<void> {
    if (part.embedded_url) return;
    if (part.attachment_id) {
      const cacheKey = `att:${part.attachment_id}`;
      const promise = attachmentBlobCache.get(cacheKey) || resolveAttachmentPreview(part.attachment_id);
      attachmentBlobCache.set(cacheKey, promise);
      try {
        part.embedded_url = await promise;
      } catch (e) {
        attachmentBlobCache.delete(cacheKey);
        console.error("Failed to resolve media:", cacheKey, e);
      }
      return;
    }
  }

  async function resolveRecordMedia(records: ChatRecord[]) {
    const mediaTypes = ["image", "record", "video"];
    const tasks: Promise<void>[] = [];
    for (const record of records) {
      for (const part of record.content?.message || []) {
        if (mediaTypes.includes(part.type) && !part.embedded_url && (part.attachment_id || part.filename)) {
          tasks.push(resolvePartMedia(part));
        }
      }
    }
    await Promise.all(tasks);
  }

  async function loadSessionMessages(sessionId: string) {
    if (!sessionId) return;
    loadingMessages.value = true;
    try {
      const history = await appBridge.chat.listMessages?.(sessionId);
      const records = (history || []).map(mapBridgeMessageToRecord);
      await resolveRecordMedia(records);
      messagesBySession[sessionId] = records;
      sessionProjects[sessionId] = null;
      loadedSessions[sessionId] = true;
    } catch (error) {
      console.error("Failed to load session messages:", error);
      messagesBySession[sessionId] = messagesBySession[sessionId] || [];
    } finally {
      loadingMessages.value = false;
    }
  }

  function createLocalExchange({
    sessionId,
    messageId,
    parts,
  }: CreateLocalExchangeOptions) {
    loadedSessions[sessionId] = true;
    messagesBySession[sessionId] = messagesBySession[sessionId] || [];

    const userRecord: ChatRecord = {
      id: `local-user-${messageId}`,
      created_at: new Date().toISOString(),
      content: {
        type: "user",
        message: parts.map(stripUploadOnlyFields),
      },
    };

    const botRecord: ChatRecord = {
      id: `local-bot-${messageId}`,
      created_at: new Date().toISOString(),
      content: {
        type: "bot",
        message: [],
        reasoning: "",
        isLoading: true,
      },
    };

    messagesBySession[sessionId].push(userRecord, botRecord);

    const sessionMessages = messagesBySession[sessionId];
    return {
      userRecord: sessionMessages[sessionMessages.length - 2],
      botRecord: sessionMessages[sessionMessages.length - 1],
    };
  }

  async function sendMessageStream({
    sessionId,
    messageId,
    parts,
    transport: _transport,
    enableStreaming = true,
    selectedProvider = "",
    selectedModel = "",
    botRecord,
    userRecord,
    skipUserHistory = false,
    llmCheckpointId = null,
  }: SendMessageStreamOptions) {
    await startBridgeStream(
      sessionId,
      messageId,
      parts,
      botRecord,
      userRecord,
      enableStreaming,
      selectedProvider,
      selectedModel,
      skipUserHistory,
      llmCheckpointId,
    );
  }

  async function editMessage(
    sessionId: string,
    record: ChatRecord,
    editedText: string,
  ) {
    if (!sessionId || record.id == null) return { needsRegenerate: false };
    const content = cloneContentWithEditedText(record, editedText);
    const payload = await appBridge.chat.editMessage?.(
      sessionId,
      String(record.id),
      content.message.map(partToBridgePart),
    );
    const updated = payload?.message ? mapBridgeMessageToRecord(payload.message) : null;
    if (updated) {
      Object.assign(record, updated);
      await resolveRecordMedia([record]);
    }
    if (payload?.truncatedAfterMessage) {
      truncateMessagesAfter(sessionId, record);
    }
    return {
      needsRegenerate: Boolean(payload?.needsRegenerate),
      truncatedAfterMessage: Boolean(payload?.truncatedAfterMessage),
    };
  }

  function truncateMessagesAfter(sessionId: string, record: ChatRecord) {
    const records = messagesBySession[sessionId];
    if (!records?.length || record.id == null) return;
    const index = records.findIndex(
      (message) => String(message.id) === String(record.id),
    );
    if (index < 0) return;
    messagesBySession[sessionId] = records.slice(0, index + 1);
  }

  async function continueEditedMessage({
    sessionId,
    sourceRecord,
    enableStreaming = true,
    selectedProvider = "",
    selectedModel = "",
  }: ContinueEditedMessageOptions) {
    if (!sessionId) return;
    const parts = messageParts(sourceRecord).map(stripUploadOnlyFields);
    const messageId = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    messagesBySession[sessionId] = messagesBySession[sessionId] || [];

    const botRecord: ChatRecord = {
      id: `local-edited-bot-${messageId}`,
      created_at: new Date().toISOString(),
      content: {
        type: "bot",
        message: [],
        reasoning: "",
        isLoading: true,
      },
    };
    messagesBySession[sessionId].push(botRecord);

    await startBridgeStream(
      sessionId,
      messageId,
      parts,
      botRecord,
      undefined,
      enableStreaming,
      selectedProvider,
      selectedModel,
      true,
      sourceRecord.llm_checkpoint_id || null,
    );
  }

  async function regenerateMessage(
    sessionId: string,
    botRecord: ChatRecord,
    selectedProvider = "",
    selectedModel = "",
  ) {
    if (!sessionId || botRecord.id == null) return;
    const targetMessageId = botRecord.id;

    botRecord.id = `local-regenerate-${Date.now()}`;
    botRecord.created_at = new Date().toISOString();
    botRecord.content = {
      type: "bot",
      message: [],
      reasoning: "",
      isLoading: true,
    };

    try {
      const response = await appBridge.chat.regenerateMessage?.(
        sessionId,
        String(targetMessageId),
        selectedProvider || undefined,
        selectedModel || undefined,
      );
      if (!response) throw new Error("Regenerate is not available.");
      botRecord.id = response.assistantMessageId || response.messageId || botRecord.id;
      const unsubscribe = appBridge.chat.onStreamEvent?.((event) => {
        if (event.sessionId !== sessionId || event.runId !== response.runId) return;
        processBridgeStreamEvent(botRecord, event);
        options.onStreamUpdate?.(sessionId);
        if (event.type === "final" || event.type === "error" || event.type === "aborted") {
          activeConnections[sessionId]?.unsubscribe?.();
          delete activeConnections[sessionId];
          options.onSessionsChanged?.();
        }
      });
      activeConnections[sessionId] = {
        sessionId,
        messageId: String(botRecord.id),
        runId: response.runId,
        transport: "sse",
        unsubscribe,
      };
    } catch (error) {
      delete activeConnections[sessionId];
      appendPlain(botRecord, `\n\n${String((error as Error)?.message || error)}`);
      console.error("Regenerate failed:", error);
    } finally {
      await options.onSessionsChanged?.();
    }
  }

  async function stopSession(sessionId: string) {
    if (!sessionId) return;
    const runId = activeConnections[sessionId]?.runId;
    if (runId) {
      await appBridge.chat.abortRun?.(runId, "user");
    }
  }

  function cleanupConnections() {
    Object.values(activeConnections).forEach((connection) => {
      connection.unsubscribe?.();
    });
  }

  async function startBridgeStream(
    sessionId: string,
    messageId: string,
    parts: MessagePart[],
    botRecord: ChatRecord,
    userRecord: ChatRecord | undefined,
    enableStreaming: boolean,
    selectedProvider: string,
    selectedModel: string,
    skipUserHistory = false,
    llmCheckpointId: string | null = null,
  ) {
    let runId: string | undefined;
    const unsubscribe = appBridge.chat.onStreamEvent?.((event) => {
      if (event.sessionId !== sessionId) return;
      if (runId && event.runId !== runId) return;
      if (event.assistantMessageId !== String(botRecord.id) && event.runId !== runId) return;
      processBridgeStreamEvent(botRecord, event);
      options.onStreamUpdate?.(sessionId);
      if (event.type === "final" || event.type === "error" || event.type === "aborted") {
        const active = activeConnections[sessionId];
        if (active?.runId === event.runId) {
          active.unsubscribe?.();
          delete activeConnections[sessionId];
          options.onSessionsChanged?.();
        }
      }
    });

    activeConnections[sessionId] = {
      sessionId,
      messageId,
      transport: "sse",
      unsubscribe,
    };

    try {
      const response = await appBridge.chat.sendMessage({
        sessionId,
        parts: parts.map(partToBridgePart),
        enableStreaming,
        providerId: selectedProvider || undefined,
        modelId: selectedModel || undefined,
        idempotencyKey: messageId,
        checkpointId: llmCheckpointId,
        ...(skipUserHistory ? { metadata: { skipUserHistory: true } } : {}),
      } as any);

      runId = response.runId;
      activeConnections[sessionId].runId = runId;
      botRecord.id = response.assistantMessageId || response.messageId || botRecord.id;
      if (userRecord && response.userMessageId) {
        userRecord.id = response.userMessageId;
      }
      if (response.userMessage && userRecord) {
        Object.assign(userRecord, mapBridgeMessageToRecord(response.userMessage));
      }
      if (response.assistantMessage) {
        Object.assign(botRecord, mapBridgeMessageToRecord(response.assistantMessage));
      }
    } catch (error) {
      unsubscribe?.();
      delete activeConnections[sessionId];
      appendPlain(botRecord, `\n\n${String((error as Error)?.message || error)}`);
      console.error("Bridge chat failed:", error);
      await options.onSessionsChanged?.();
    }
  }

  function processBridgeStreamEvent(botRecord: ChatRecord, event: BridgeStreamEvent) {
    if (event.type === "started") {
      markMessageStarted(botRecord);
      botRecord.id = event.assistantMessageId || botRecord.id;
      return;
    }
    if (event.type === "delta") {
      markMessageStarted(botRecord);
      const text = event.delta ?? event.text ?? "";
      if (event.channel === "reasoning") {
        appendReasoningPart(botRecord, text);
      } else {
        appendPlain(botRecord, text);
      }
      return;
    }
    if (event.type === "final" && event.message) {
      Object.assign(botRecord, mapBridgeMessageToRecord(event.message));
      markMessageStarted(botRecord);
      return;
    }
    if (event.type === "error" || event.type === "aborted") {
      markMessageStarted(botRecord);
      const message = event.error?.message || (event.type === "aborted" ? "Request aborted." : "Request failed.");
      appendPlain(botRecord, `\n\n${message}`);
    }
  }

  return {
    loadingMessages,
    sending,
    messagesBySession,
    loadedSessions,
    sessionProjects,
    activeMessages,
    isSessionRunning,
    isUserMessage,
    isMessageStreaming,
    messageContent,
    messageParts,
    loadSessionMessages,
    createLocalExchange,
    sendMessageStream,
    editMessage,
    continueEditedMessage,
    regenerateMessage,
    stopSession,
    cleanupConnections,
  };
}

function cloneContentWithEditedText(
  record: ChatRecord,
  editedText: string,
): ChatContent {
  const content = record.content || { type: "bot", message: [] };
  const message = Array.isArray(content.message)
    ? content.message.map((part) => ({ ...part }))
    : [];
  let replaced = false;
  for (const part of message) {
    if (part.type === "plain") {
      part.text = editedText;
      replaced = true;
      break;
    }
  }
  if (!replaced && editedText) {
    message.push({ type: "plain", text: editedText });
  }
  return {
    ...content,
    message,
  };
}

function stripUploadOnlyFields(part: MessagePart): MessagePart {
  const copied = { ...part };
  delete copied.path;
  return copied;
}

export function normalizeMessageParts(
  parts: unknown,
  legacyReasoning = "",
): MessagePart[] {
  const normalizedParts = normalizePartsInternal(parts);
  if (legacyReasoning && !normalizedParts.some((part) => part.type === "think")) {
    normalizedParts.unshift({ type: "think", think: legacyReasoning });
  }
  return normalizedParts;
}

export function extractReasoningText(
  parts: MessagePart[] | unknown,
  legacyReasoning = "",
) {
  const normalizedParts = Array.isArray(parts)
    ? parts
    : normalizeMessageParts(parts, legacyReasoning);
  const text = normalizedParts
    .filter((part) => part.type === "think")
    .map((part) => String(part.think || ""))
    .join("");
  return text || legacyReasoning;
}

export function thinkingParts(content: ChatContent): MessagePart[] {
  const firstThinkingBlock = messageBlocks(content).find(
    (block) => block.kind === "thinking",
  );
  if (firstThinkingBlock) return firstThinkingBlock.parts;

  const fallbackReasoning = String(content.reasoning || "");
  return fallbackReasoning ? [{ type: "think", think: fallbackReasoning }] : [];
}

export function displayParts(content: ChatContent): MessagePart[] {
  return messageBlocks(content)
    .filter((block) => block.kind === "content")
    .flatMap((block) => block.parts);
}

export function messageBlocks(content: ChatContent): MessageDisplayBlock[] {
  const parts = Array.isArray(content.message)
    ? content.message
    : normalizeMessageParts(content.message, content.reasoning || "");

  const blocks: MessageDisplayBlock[] = [];
  let currentKind: MessageDisplayBlock["kind"] | null = null;
  let currentParts: MessagePart[] = [];

  for (const part of parts) {
    if (isEmptyPlainPart(part)) continue;

    const nextKind: MessageDisplayBlock["kind"] = isThinkingPart(part)
      ? "thinking"
      : "content";

    if (currentKind !== nextKind) {
      if (currentKind && currentParts.length) {
        blocks.push({ kind: currentKind, parts: currentParts });
      }
      currentKind = nextKind;
      currentParts = [{ ...part }];
      continue;
    }

    currentParts.push({ ...part });
  }

  if (currentKind && currentParts.length) {
    blocks.push({ kind: currentKind, parts: currentParts });
  }

  if (!blocks.length && content.reasoning) {
    return [
      {
        kind: "thinking",
        parts: [{ type: "think", think: String(content.reasoning) }],
      },
    ];
  }

  return blocks;
}

function partToBridgePart(part: MessagePart): BridgeChatMessagePart {
  if (part.type === "plain") return { type: "plain", text: part.text || "" };
  if (part.type === "think") return { type: "think", think: part.think || "" };
  if (part.type === "reply") {
    return {
      type: "reply",
      messageId: part.message_id,
      message_id: part.message_id,
      selectedText: part.selected_text || "",
      selected_text: part.selected_text || "",
    };
  }
  return {
    ...part,
    type: part.type,
    attachmentId: part.attachment_id,
    attachment_id: part.attachment_id,
    filename: part.filename,
  };
}

function normalizePartsInternal(parts: unknown): MessagePart[] {
  if (typeof parts === "string") {
    return parts ? [{ type: "plain", text: parts }] : [];
  }
  if (!Array.isArray(parts)) return [];
  return parts.map((part: any) => {
    if (!part || typeof part !== "object") {
      return { type: "plain", text: String(part ?? "") };
    }
    if (part.type === "reasoning") {
      return {
        ...part,
        type: "think",
        think: String(part.think ?? part.text ?? ""),
      };
    }
    const normalized = { ...part };
    if (typeof normalized.attachmentId === "string" && !normalized.attachment_id) {
      normalized.attachment_id = normalized.attachmentId;
    }
    if (normalized.messageId != null && normalized.message_id == null) {
      normalized.message_id = normalized.messageId;
    }
    if (typeof normalized.selectedText === "string" && !normalized.selected_text) {
      normalized.selected_text = normalized.selectedText;
    }
    if (Array.isArray(normalized.toolCalls) && !normalized.tool_calls) {
      normalized.tool_calls = normalized.toolCalls;
    }
    return normalized;
  });
}

function isEmptyPlainPart(part: MessagePart) {
  return part.type === "plain" && !String(part.text || "");
}

function isThinkingPart(part: MessagePart) {
  return part.type === "think" || part.type === "tool_call";
}

export function appendPlain(record: ChatRecord, text: string, append = true) {
  markMessageStarted(record);
  const content = record.content;
  let last = content.message[content.message.length - 1];
  if (!last || last.type !== "plain") {
    last = { type: "plain", text: "" };
    content.message.push(last);
  }
  last.text = append ? `${last.text || ""}${text}` : text;
}

export function appendReasoningPart(record: ChatRecord, text: string) {
  markMessageStarted(record);
  if (!text) return;
  const content = record.content;
  const last = content.message[content.message.length - 1];
  if (last?.type === "think") {
    last.think = `${String(last.think || "")}${text}`;
  } else {
    content.message.push({ type: "think", think: text });
  }
  content.reasoning = extractReasoningText(content.message);
}

export function upsertToolCall(record: ChatRecord, toolCall: any) {
  markMessageStarted(record);
  if (!toolCall || typeof toolCall !== "object") return;
  const targetId = toolCall.id;
  if (targetId != null) {
    for (const part of record.content.message) {
      if (part.type !== "tool_call" || !Array.isArray(part.tool_calls)) continue;
      const matched = part.tool_calls.find((item) => item.id === targetId);
      if (matched) {
        Object.assign(matched, toolCall);
        return;
      }
    }
  }
  record.content.message.push({ type: "tool_call", tool_calls: [{ ...toolCall }] });
}

export function finishToolCall(record: ChatRecord, result: any) {
  markMessageStarted(record);
  if (!result || typeof result !== "object") return;
  const targetId = result.id;
  for (const part of record.content.message) {
    if (part.type !== "tool_call" || !Array.isArray(part.tool_calls)) continue;
    const tool = part.tool_calls.find((item) => item.id === targetId);
    if (tool) {
      tool.result = result.result;
      tool.finished_ts = result.ts || Date.now() / 1000;
      return;
    }
  }
  record.content.message.push({
    type: "tool_call",
    tool_calls: [
      {
        id: targetId,
        result: result.result,
        finished_ts: result.ts || Date.now() / 1000,
      },
    ],
  });
}

export function markMessageStarted(record: ChatRecord) {
  record.content.isLoading = false;
}

export function hasPlainText(record: ChatRecord) {
  return record.content.message.some(
    (part) =>
      part.type === "plain" && typeof part.text === "string" && part.text,
  );
}

export function payloadText(value: unknown) {
  if (typeof value === "string") return value;
  if (value == null) return "";
  if (typeof value === "object") {
    const payload = value as Record<string, unknown>;
    if (typeof payload.text === "string") return payload.text;
    if (typeof payload.content === "string") return payload.content;
    if (typeof payload.message === "string") return payload.message;
  }
  return String(value);
}

export function parseJsonSafe(value: unknown) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function mapBridgeMessageToRecord(message: BridgeChatMessage): ChatRecord {
  const parts = normalizeMessageParts(message.parts || []);
  const roleType = message.role === "user" ? "user" : "bot";
  const metadata = message.metadata || {};

  return {
    id: message.id,
    created_at: new Date(message.createdAt || Date.now()).toISOString(),
    sender_id: roleType === "bot" ? "bot" : "user",
    sender_name: roleType === "bot" ? "Assistant" : "User",
    llm_checkpoint_id: message.checkpointId || null,
    content: {
      type: roleType,
      message: parts,
      reasoning: extractReasoningText(parts),
      isLoading: message.status === "pending" || message.status === "streaming",
      agentStats: metadata.agentStats || metadata.agent_stats,
      refs: metadata.refs,
    },
    threads: [],
  };
}

async function resolveAttachmentPreview(attachmentId: string): Promise<string> {
  const preview = await appBridge.attachment?.getPreviewUrl(attachmentId);
  if (!preview) return "";
  if (typeof preview === "string") return preview;
  return preview.url;
}

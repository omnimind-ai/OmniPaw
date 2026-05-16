import { computed, onBeforeUnmount, reactive, ref, type Ref } from "vue";
import { appBridge, type BridgeChatMessage, type BridgeChatMessagePart, type BridgeStreamEvent } from "@/bridge/app";

export type TransportMode = "sse" | "websocket";

export interface MessagePart {
  type: string;
  text?: string;
  think?: string;
  messageId?: string | number;
  message_id?: string | number;
  selectedText?: string;
  selected_text?: string;
  embedded_url?: string;
  embedded_file?: { url?: string; filename?: string; attachmentId?: string; attachment_id?: string };
  attachmentId?: string;
  attachment_id?: string;
  filename?: string;
  tool_calls?: ToolCall[];
  [key: string]: unknown;
}

export type ToolCallStatus =
  | "pending"
  | "running"
  | "complete"
  | "error"
  | "denied"
  | "aborted"
  | string;

export interface ToolCall {
  id?: string;
  index?: number;
  toolCallId?: string;
  tool_call_id?: string;
  name?: string;
  toolName?: string;
  tool_name?: string;
  args?: unknown;
  arguments?: unknown;
  argumentsDelta?: string;
  arguments_delta?: string;
  result?: unknown;
  error?: unknown;
  status?: ToolCallStatus;
  state?: ToolCallStatus;
  toolStatus?: ToolCallStatus;
  tool_status?: ToolCallStatus;
  startedAt?: number;
  started_at?: number;
  startTime?: number;
  start_time?: number;
  ts?: number;
  finishedAt?: number;
  finished_at?: number;
  finishedTs?: number;
  finished_ts?: number;
  endTime?: number;
  end_time?: number;
  durationMs?: number;
  duration_ms?: number;
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
  checkpointId?: string | null;
  llm_checkpoint_id?: string | null;
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
  mode?: string;
  toolProfile?: string;
  maxSteps?: number;
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
  mode?: string;
  toolProfile?: string;
  maxSteps?: number;
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
    const attachmentId = partAttachmentId(part);
    if (attachmentId) {
      const cacheKey = `att:${attachmentId}`;
      const promise = attachmentBlobCache.get(cacheKey) || resolveAttachmentPreview(attachmentId);
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
        if (mediaTypes.includes(part.type) && !part.embedded_url && (partAttachmentId(part) || part.filename)) {
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
    mode,
    toolProfile,
    maxSteps,
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
      mode,
      toolProfile,
      maxSteps,
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
    mode,
    toolProfile,
    maxSteps,
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
      mode,
      toolProfile,
      maxSteps,
      true,
      sourceRecord.checkpointId || sourceRecord.llm_checkpoint_id || null,
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
    mode?: string,
    toolProfile?: string,
    maxSteps?: number,
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
        mode: mode || undefined,
        toolProfile: toolProfile || undefined,
        maxSteps,
        idempotencyKey: messageId,
        checkpointId: llmCheckpointId,
        ...(skipUserHistory ? { metadata: { skipUserHistory: true } } : {}),
      });

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
      if (event.channel === "tool_call") {
        mergeToolEvent(botRecord, event);
        return;
      }
      markMessageStarted(botRecord);
      const text = event.delta ?? event.text ?? "";
      if (event.channel === "reasoning") {
        appendReasoningPart(botRecord, text);
      } else {
        appendPlain(botRecord, text);
      }
      return;
    }
    if (mergeToolEvent(botRecord, event)) {
      return;
    }
    if (event.type === "final" && event.message) {
      Object.assign(botRecord, mapBridgeMessageToRecord(event.message));
      markMessageStarted(botRecord);
      return;
    }
    if (event.type === "error" || event.type === "aborted") {
      markMessageStarted(botRecord);
      const message = errorMessage(event.error) || (event.type === "aborted" ? "Request aborted." : "Request failed.");
      appendPlain(botRecord, `\n\n${message}`);
    }
  }

  return {
    loadingMessages,
    sending,
    messagesBySession,
    loadedSessions,
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
      messageId: part.messageId ?? part.message_id,
      message_id: part.messageId ?? part.message_id,
      selectedText: part.selectedText ?? part.selected_text ?? "",
      selected_text: part.selectedText ?? part.selected_text ?? "",
    };
  }
  const attachmentId = partAttachmentId(part);
  return {
    ...part,
    type: part.type,
    attachmentId,
    attachment_id: attachmentId,
    filename: part.filename,
  };
}

function partAttachmentId(part: MessagePart): string {
  return part.attachmentId || part.attachment_id || "";
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
    if (typeof normalized.attachment_id === "string" && !normalized.attachmentId) {
      normalized.attachmentId = normalized.attachment_id;
    }
    if (normalized.messageId != null && normalized.message_id == null) {
      normalized.message_id = normalized.messageId;
    }
    if (normalized.message_id != null && normalized.messageId == null) {
      normalized.messageId = normalized.message_id;
    }
    if (typeof normalized.selectedText === "string" && !normalized.selected_text) {
      normalized.selected_text = normalized.selectedText;
    }
    if (typeof normalized.selected_text === "string" && !normalized.selectedText) {
      normalized.selectedText = normalized.selected_text;
    }
    if (Array.isArray(normalized.toolCalls) && !normalized.tool_calls) {
      normalized.tool_calls = normalized.toolCalls;
    }
    if (normalized.type === "tool_call") {
      normalized.tool_calls = normalizeToolCalls(
        normalized.tool_calls ?? normalized.toolCalls ?? normalized.toolCall ?? normalized.tool_call,
      );
      normalized.toolCalls = normalized.tool_calls;
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

function mergeToolEvent(record: ChatRecord, event: BridgeStreamEvent) {
  const eventRecord = event as Record<string, unknown>;

  if (event.type === "part") {
    const part = normalizeToolPart(event.part);
    if (!part) return false;
    mergeToolPart(record, part);
    return true;
  }

  if (event.type === "tool_call" || event.type === "tool_result") {
    const calls = toolCallsFromEvent(event);
    if (!calls.length) return false;
    for (const call of calls) {
      upsertToolCall(record, call);
    }
    return true;
  }

  if (event.channel === "tool_call") {
    const calls = toolCallsFromEvent(event);
    if (!calls.length) return false;
    for (const call of calls) {
      upsertToolCall(record, call);
    }
    return true;
  }

  if (event.type === "tool_call_started") {
    const call = normalizeToolCall({
      ...(objectRecord(eventRecord.toolCall ?? eventRecord.tool_call) || {}),
      id: eventRecord.toolCallId ?? eventRecord.tool_call_id,
      index: eventRecord.index,
      name: eventRecord.name ?? eventRecord.toolName ?? eventRecord.tool_name,
      args: eventRecord.args,
      arguments: eventRecord.arguments,
      argumentsDelta: eventRecord.argumentsDelta ?? eventRecord.arguments_delta,
      status: "running",
    });
    upsertToolCall(record, call);
    return true;
  }

  if (event.type === "tool_call_delta") {
    const call = normalizeToolCall({
      ...(objectRecord(eventRecord.toolCall ?? eventRecord.tool_call) || {}),
      id: eventRecord.toolCallId ?? eventRecord.tool_call_id,
      index: eventRecord.index,
      name: eventRecord.name ?? eventRecord.toolName ?? eventRecord.tool_name,
      args: eventRecord.args,
      arguments: eventRecord.arguments,
      argumentsDelta: eventRecord.argumentsDelta ?? eventRecord.arguments_delta,
      status: "running",
    });
    upsertToolCall(record, call);
    return true;
  }

  if (event.type === "tool_call_finished") {
    const call = normalizeToolCall({
      ...(objectRecord(eventRecord.toolCall ?? eventRecord.tool_call) || {}),
      id: eventRecord.toolCallId ?? eventRecord.tool_call_id,
      index: eventRecord.index,
      result: eventRecord.result,
      status: eventRecord.status ?? "complete",
      finishedAt: eventRecord.finishedAt ?? eventRecord.finished_at ?? Date.now(),
      finished_ts: eventRecord.finished_ts ?? eventRecord.ts,
    });
    upsertToolCall(record, call);
    return true;
  }

  return false;
}

function toolCallsFromEvent(event: BridgeStreamEvent): ToolCall[] {
  const eventRecord = event as Record<string, unknown>;
  const direct =
    eventRecord.toolCall ??
    eventRecord.tool_call ??
    eventRecord.toolCalls ??
    eventRecord.tool_calls;
  const directCalls = normalizeToolCalls(direct);
  if (directCalls.length) return directCalls;

  if (hasToolEventPayload(eventRecord)) {
    return [normalizeToolCall(eventRecord)];
  }

  return [];
}

function hasToolEventPayload(event: Record<string, unknown>) {
  return [
    "id",
    "index",
    "toolCallId",
    "tool_call_id",
    "name",
    "toolName",
    "tool_name",
    "args",
    "arguments",
    "argumentsDelta",
    "arguments_delta",
    "result",
    "error",
    "status",
    "state",
  ].some((key) => event[key] != null);
}

function normalizeToolPart(part: unknown): MessagePart | null {
  if (!part || typeof part !== "object") return null;
  const normalized = normalizePartsInternal([part])[0];
  if (normalized?.type === "tool_call") return normalized;
  return null;
}

function mergeToolPart(record: ChatRecord, part: MessagePart) {
  markMessageStarted(record);
  if (!Array.isArray(part.tool_calls) || !part.tool_calls.length) return;
  for (const toolCall of part.tool_calls) {
    upsertToolCall(record, toolCall);
  }
}

export function upsertToolCall(record: ChatRecord, toolCall: any) {
  markMessageStarted(record);
  if (!toolCall || typeof toolCall !== "object") return;
  const normalized = normalizeToolCall(toolCall);
  for (const part of record.content.message) {
    if (part.type !== "tool_call" || !Array.isArray(part.tool_calls)) continue;
    const matched = part.tool_calls.find((item) => isSameToolCall(item, normalized));
    if (matched) {
      Object.assign(matched, mergeToolCallValues(matched, normalized));
      return;
    }
  }
  record.content.message.push({
    type: "tool_call",
    tool_calls: [normalized],
    toolCalls: [normalized],
  });
}

export function finishToolCall(record: ChatRecord, result: any) {
  markMessageStarted(record);
  if (!result || typeof result !== "object") return;
  upsertToolCall(record, {
    ...result,
    id: result.id ?? result.toolCallId ?? result.tool_call_id,
    result: result.result,
    status: result.status ?? "complete",
    finished_ts: result.finished_ts ?? result.ts ?? Date.now() / 1000,
  });
}

function normalizeToolCalls(value: unknown): ToolCall[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeToolCall(item))
      .filter((item) => hasToolCallIdentity(item));
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.tool_calls) || Array.isArray(record.toolCalls)) {
      return normalizeToolCalls(record.tool_calls ?? record.toolCalls);
    }
    return [normalizeToolCall(record)].filter((item) => hasToolCallIdentity(item));
  }
  return [];
}

function normalizeToolCall(value: unknown): ToolCall {
  const source = objectRecord(value) || {};
  const index = normalizeIndex(readFirst(source, ["index"]));
  const id = readFirst(source, ["id", "toolCallId", "tool_call_id", "callId", "call_id"]);
  const name = readFirst(source, ["name", "toolName", "tool_name"]);
  const args = readFirst(source, ["args", "arguments", "input"]);
  const argumentsDelta = readFirst(source, ["argumentsDelta", "arguments_delta"]);
  const result = readFirst(source, ["result", "output", "content"]);
  const error = normalizeToolError(readFirst(source, ["error", "failure"]));
  const started = normalizeTimestamp(
    readFirst(source, ["ts", "startedAt", "started_at", "startTime", "start_time"]),
  );
  const finished = normalizeTimestamp(
    readFirst(source, [
      "finished_ts",
      "finishedTs",
      "finishedAt",
      "finished_at",
      "endTime",
      "end_time",
    ]),
  );
  const durationMs = normalizeDurationMs(readFirst(source, ["durationMs", "duration_ms"]));
  const status = normalizeToolStatus(
    readFirst(source, ["status", "state", "toolStatus", "tool_status"]),
    { error, result, finished },
  );

  return removeUndefined({
    ...source,
    index,
    id: id == null ? undefined : String(id),
    name: name == null ? undefined : String(name),
    args: parseJsonSafe(args ?? argumentsDelta ?? {}),
    arguments: parseJsonSafe(args ?? argumentsDelta ?? {}),
    argumentsDelta,
    arguments_delta: argumentsDelta,
    result: parseJsonSafe(result),
    error,
    status,
    ts: started,
    startedAt: started == null ? undefined : timestampSecondsToMs(started),
    finished_ts: finished,
    finishedAt: finished == null ? undefined : timestampSecondsToMs(finished),
    durationMs,
  }) as ToolCall;
}

function isSameToolCall(existing: ToolCall, incoming: ToolCall) {
  if (existing.id != null && incoming.id != null) {
    return String(existing.id) === String(incoming.id);
  }
  if (existing.index != null && incoming.index != null) {
    return Number(existing.index) === Number(incoming.index);
  }
  if (existing.name && incoming.name && existing.status === "running") {
    return existing.name === incoming.name;
  }
  return false;
}

function mergeToolCallValues(existing: ToolCall, incoming: ToolCall): ToolCall {
  const merged = { ...existing };
  const argumentsDelta = incoming.argumentsDelta ?? incoming.arguments_delta;
  const shouldAppendArguments =
    typeof argumentsDelta === "string" &&
    incoming.args === argumentsDelta &&
    incoming.arguments === argumentsDelta;
  for (const [key, value] of Object.entries(incoming)) {
    if (value !== undefined) {
      (merged as Record<string, unknown>)[key] = value;
    }
  }
  if (shouldAppendArguments) {
    const previousArgs =
      typeof existing.arguments === "string"
        ? existing.arguments
        : typeof existing.args === "string"
          ? existing.args
          : "";
    const nextArgs = `${previousArgs}${argumentsDelta}`;
    merged.args = nextArgs;
    merged.arguments = nextArgs;
    delete merged.argumentsDelta;
    delete merged.arguments_delta;
    return merged;
  }
  if (incoming.args !== undefined || incoming.arguments !== undefined) {
    const args = incoming.args ?? incoming.arguments;
    merged.args = args;
    merged.arguments = args;
  }
  if (incoming.result !== undefined) {
    merged.result = incoming.result;
  }
  if (incoming.error !== undefined) {
    merged.error = incoming.error;
  }
  merged.status = incoming.status ?? existing.status ?? normalizeToolStatus(undefined, merged);
  return merged;
}

function normalizeToolStatus(
  value: unknown,
  context: { error?: unknown; result?: unknown; finished?: number } = {},
): ToolCallStatus {
  const status = String(value || "").toLowerCase();
  if (["running", "pending", "complete", "error", "denied", "aborted"].includes(status)) {
    return status;
  }
  if (["success", "succeeded", "done", "finished"].includes(status)) return "complete";
  if (["failed", "failure"].includes(status)) return "error";
  if (["rejected", "blocked", "refused"].includes(status)) return "denied";
  if (["cancelled", "canceled"].includes(status)) return "aborted";
  if (context.error) return "error";
  if (context.result !== undefined || context.finished !== undefined) return "complete";
  return "running";
}

function normalizeToolError(value: unknown) {
  if (value == null) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const message = record.message ?? record.reason ?? record.error;
    if (typeof message === "string") return { ...record, message };
  }
  return value;
}

function normalizeTimestamp(value: unknown): number | undefined {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue <= 0) return undefined;
  return numberValue > 10_000_000_000 ? numberValue / 1000 : numberValue;
}

function timestampSecondsToMs(value: number) {
  return value > 10_000_000_000 ? value : value * 1000;
}

function normalizeDurationMs(value: unknown): number | undefined {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : undefined;
}

function normalizeIndex(value: unknown): number | undefined {
  const numberValue = Number(value);
  return Number.isInteger(numberValue) && numberValue >= 0 ? numberValue : undefined;
}

function readFirst(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) {
      return source[key];
    }
  }
  return undefined;
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function hasToolCallIdentity(toolCall: ToolCall) {
  return Boolean(
    toolCall.id ||
      toolCall.name ||
      toolCall.index != null ||
      toolCall.args !== undefined ||
      toolCall.result !== undefined ||
      toolCall.error !== undefined,
  );
}

function removeUndefined(value: Record<string, unknown>) {
  for (const key of Object.keys(value)) {
    if (value[key] === undefined) {
      delete value[key];
    }
  }
  return value;
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

function errorMessage(value: unknown) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  if (typeof record.message === "string") return record.message;
  if (typeof record.error === "string") return record.error;
  return "";
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
    checkpointId: message.checkpointId || null,
    llm_checkpoint_id: message.checkpointId || null,
    content: {
      type: roleType,
      message: parts,
      reasoning: extractReasoningText(parts),
      isLoading: message.status === "pending" || message.status === "streaming",
      agentStats: metadata.agentStats || metadata.agent_stats,
      refs: metadata.refs,
    },
  };
}

async function resolveAttachmentPreview(attachmentId: string): Promise<string> {
  const preview = await appBridge.attachment?.getPreviewUrl(attachmentId);
  if (!preview) return "";
  if (typeof preview === "string") return preview;
  return preview.url;
}

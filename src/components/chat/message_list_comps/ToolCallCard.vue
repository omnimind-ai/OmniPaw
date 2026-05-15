<template>
  <div class="tool-call-card" :class="{ expanded: isExpanded }">
    <button class="tool-call-header" type="button" @click="toggleExpanded">
      <v-icon size="16" class="tool-call-icon">{{ toolCallIcon }}</v-icon>
      <span class="tool-call-title">
        {{ tm("actions.toolCallUsed", { name: displayToolName }) }}
      </span>
      <span
        class="tool-call-status"
        :class="`status-${displayStatus}`"
      >
        {{ statusText }}
      </span>
      <span class="tool-call-duration">{{ toolCallDuration }}</span>
      <v-icon
        size="22"
        class="tool-call-expand-icon"
        :class="{ expanded: isExpanded }"
      >
        mdi-chevron-right
      </v-icon>
    </button>

    <div v-if="isExpanded" class="tool-call-details">
      <div v-if="normalizedToolCall.id" class="tool-call-detail-row">
        <span class="detail-label">ID:</span>
        <code class="detail-value">
          {{ normalizedToolCall.id }}
        </code>
      </div>

      <div class="tool-call-detail-row">
        <span class="detail-label">Arguments:</span>
        <pre class="detail-value detail-json">{{
          formattedArgs
        }}</pre>
      </div>

      <div v-if="hasResult" class="tool-call-detail-row">
        <span class="detail-label">Result:</span>
        <pre class="detail-value detail-json detail-result">{{
          formattedResult
        }}</pre>
      </div>

      <div v-if="hasError" class="tool-call-detail-row">
        <span class="detail-label">Error:</span>
        <pre class="detail-value detail-json detail-error">{{
          formattedError
        }}</pre>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useModuleI18n } from "@/i18n/composables";

const props = defineProps({
  toolCall: {
    type: Object,
    required: true,
  },
  isDark: {
    type: Boolean,
    default: false,
  },
  initialExpanded: {
    type: Boolean,
    default: false,
  },
});

const { tm } = useModuleI18n("features/chat");
const isExpanded = ref(props.initialExpanded);
const currentTime = ref(Date.now() / 1000);
let timer = null;

const normalizedToolCall = computed(() => normalizeToolCall(props.toolCall));

const elapsedTime = computed(() => {
  if (normalizedToolCall.value.finished_ts) return "";
  const startTime = Number(normalizedToolCall.value.ts);
  if (!Number.isFinite(startTime) || startTime <= 0) return "";
  return formatDuration(currentTime.value - startTime);
});

const displayToolName = computed(() => normalizedToolCall.value.name || "tool");

const toolCallIcon = computed(() => {
  const name = String(normalizedToolCall.value.name || "");
  if (name === "omniclaw_execute_ipython" || name === "omniclaw_execute_python") {
    return "mdi-code-json";
  }
  if (name.includes("web_search") || name.includes("tavily")) {
    return "mdi-web";
  }
  if (name === "omniclaw_execute_shell") {
    return "mdi-console-line";
  }
  return "mdi-wrench";
});

const toolCallDuration = computed(() => {
  const durationMs = Number(normalizedToolCall.value.durationMs);
  if (Number.isFinite(durationMs) && durationMs >= 0) {
    return formatDuration(durationMs / 1000);
  }

  const startTime = Number(normalizedToolCall.value.ts);
  if (!Number.isFinite(startTime) || startTime <= 0) return "";
  if (normalizedToolCall.value.finished_ts) {
    return formatDuration(Number(normalizedToolCall.value.finished_ts) - startTime);
  }
  return elapsedTime.value;
});

const displayStatus = computed(() => normalizedToolCall.value.status);

const statusText = computed(() => {
  const status = displayStatus.value;
  return status.charAt(0).toUpperCase() + status.slice(1);
});

const formattedArgs = computed(() => formatPayload(normalizedToolCall.value.args ?? {}));

const hasResult = computed(() => normalizedToolCall.value.result !== undefined);

const formattedResult = computed(() => {
  if (!hasResult.value) return "";
  return formatPayload(normalizedToolCall.value.result);
});

const hasError = computed(() => normalizedToolCall.value.error !== undefined);

const formattedError = computed(() => {
  if (!hasError.value) return "";
  return formatPayload(normalizedToolCall.value.error);
});

const normalizeToolCall = (toolCall) => {
  const args = parsePayload(toolCall.args ?? toolCall.arguments ?? {});
  const result =
    toolCall.result !== undefined
      ? parsePayload(toolCall.result)
      : undefined;
  const error =
    toolCall.error !== undefined
      ? parsePayload(toolCall.error)
      : undefined;
  const ts = normalizeTimestamp(
    toolCall.ts ?? toolCall.startedAt ?? toolCall.started_at ?? toolCall.startTime ?? toolCall.start_time,
  );
  const finishedTs = normalizeTimestamp(
    toolCall.finished_ts ??
      toolCall.finishedTs ??
      toolCall.finishedAt ??
      toolCall.finished_at ??
      toolCall.endTime ??
      toolCall.end_time,
  );

  return {
    ...toolCall,
    id: toolCall.id ?? toolCall.toolCallId ?? toolCall.tool_call_id,
    name: toolCall.name ?? toolCall.toolName ?? toolCall.tool_name,
    args,
    result,
    error,
    ts,
    finished_ts: finishedTs,
    durationMs: toolCall.durationMs ?? toolCall.duration_ms,
    status: normalizeStatus(toolCall.status ?? toolCall.state ?? toolCall.toolStatus ?? toolCall.tool_status, {
      error,
      result,
      finishedTs,
    }),
  };
};

const normalizeStatus = (value, context) => {
  const status = String(value || "").toLowerCase();
  if (["pending", "running", "complete", "error", "denied", "aborted"].includes(status)) {
    return status;
  }
  if (["success", "succeeded", "done", "finished"].includes(status)) return "complete";
  if (["failed", "failure"].includes(status)) return "error";
  if (["rejected", "blocked", "refused"].includes(status)) return "denied";
  if (["cancelled", "canceled"].includes(status)) return "aborted";
  if (context.error !== undefined) return "error";
  if (context.result !== undefined || context.finishedTs !== undefined) return "complete";
  return "running";
};

const normalizeTimestamp = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return undefined;
  return numeric > 10000000000 ? numeric / 1000 : numeric;
};

const parsePayload = (value) => {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const formatPayload = (value) => {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value ?? "");
  }
};

const formatDuration = (seconds) => {
  if (!Number.isFinite(seconds) || seconds < 0) return "";
  if (seconds < 1) {
    return `${Math.round(seconds * 1000)}ms`;
  } else if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  } else {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${minutes}m ${secs}s`;
  }
};

const toggleExpanded = () => {
  isExpanded.value = !isExpanded.value;
};

const updateTime = () => {
  currentTime.value = Date.now() / 1000;
};

onMounted(() => {
  if (!normalizedToolCall.value.finished_ts) {
    timer = setInterval(updateTime, 100);
  }
});

onUnmounted(() => {
  if (timer) {
    clearInterval(timer);
  }
});
</script>

<style scoped>
.tool-call-card {
  margin: 6px 0;
  max-width: 100%;
  color: rgba(var(--v-theme-on-surface), 0.7);
  font-size: inherit;
  line-height: inherit;
}

.tool-call-card.expanded {
  width: 100%;
}

.tool-call-header {
  max-width: 100%;
  border: 0;
  padding: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  user-select: none;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font: inherit;
  text-align: left;
}

.tool-call-header:hover {
  color: rgba(var(--v-theme-on-surface), 0.88);
}

.tool-call-expand-icon {
  color: currentcolor;
  transition: transform 0.2s ease;
  flex-shrink: 0;
}

.tool-call-expand-icon.expanded {
  transform: rotate(90deg);
}

.tool-call-icon {
  color: currentcolor;
  flex-shrink: 0;
}

.tool-call-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tool-call-duration {
  flex-shrink: 0;
  color: rgba(var(--v-theme-on-surface), 0.48);
}

.tool-call-status {
  flex-shrink: 0;
  color: rgba(var(--v-theme-on-surface), 0.5);
  font-size: 12px;
  line-height: 1;
}

.tool-call-status.status-error,
.tool-call-status.status-denied,
.tool-call-status.status-aborted {
  color: rgb(var(--v-theme-error));
}

.tool-call-status.status-complete {
  color: rgba(var(--v-theme-on-surface), 0.58);
}

.tool-call-details {
  margin-top: 8px;
  padding-left: 26px;
  animation: fadeIn 0.2s ease-in-out;
}

.tool-call-detail-row {
  display: flex;
  flex-direction: column;
  margin-bottom: 8px;
}

.tool-call-detail-row:last-child {
  margin-bottom: 0;
}

.detail-label {
  font-size: 11px;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.55);
  text-transform: uppercase;
  margin-bottom: 4px;
}

.detail-value {
  font-size: 12px;
  color: rgba(var(--v-theme-on-surface), 0.8);
  background-color: transparent;
  padding: 0;
  border-radius: 4px;
  word-break: break-all;
}

.detail-json {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  white-space: pre-wrap;
  max-height: 200px;
  overflow-y: auto;
  margin: 0;
}

.detail-result {
  max-height: 300px;
  background-color: transparent;
}

.detail-error {
  max-height: 300px;
  color: rgb(var(--v-theme-error));
}

.animate-fade-in {
  animation: fadeIn 0.2s ease-in-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}
</style>

<template>
  <!--
    ═══════════════════════════════════════════════════════
    InputBar — 消息输入框组件
    ═══════════════════════════════════════════════════════
    功能：
      ① 多行文本输入（el-input textarea）
      ② 图片上传与预览（📷 拍照识别食材）
      ③ 发送按钮（loading 状态、禁用状态联动）
      ④ 键盘快捷键支持
      ⑤ Agent 离线警告提示

    快捷键：
      - Enter       → 发送消息
      - Shift + Enter → 换行（不发送）
  -->
  <div class="input-area">
    <div class="input-wrapper">
      <input
        ref="fileInputRef"
        type="file"
        accept="image/*"
        class="file-input-hidden"
        @change="handleFileChange"
      />

      <div class="input-main">
        <div v-if="selectedImage" class="image-preview-row">
          <div class="image-preview">
            <img :src="selectedImage" alt="上传预览" />
            <button class="image-remove-btn" @click="removeImage" title="移除图片">
              <span>✕</span>
            </button>
          </div>
        </div>

        <el-input
          ref="inputRef"
          v-model="inputText"
          type="textarea"
          :autosize="{ minRows: 1, maxRows: 5 }"
          :placeholder="placeholder"
          resize="none"
          class="message-input"
          @keydown="handleKeydown"
        />
      </div>

      <div class="input-actions">
        <button
          class="camera-btn"
          :disabled="chatStore.loading || !chatStore.agentOnline"
          title="拍照识别食材"
          @click="triggerFileInput"
        >
          📷
        </button>

        <el-button
          type="primary"
          :icon="Promotion"
          :disabled="!canSend"
          :loading="chatStore.loading"
          class="send-btn"
          @click="handleSend"
        />
      </div>
    </div>

    <p class="input-hint">
      {{ DISCLAIMER }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { Promotion } from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";
import { useChatStore } from "@/stores/chat"
import { useConversation } from "@/hooks"
import { AGENT_OFFLINE_TIP, AGENT_ONLINE_PLACEHOLDER, DISCLAIMER } from "@/constants"

const chatStore = useChatStore()
const { sendMessage, sendVisionMessage } = useConversation()

const inputText = ref("");
const inputRef = ref();
const fileInputRef = ref<HTMLInputElement>();
const selectedImage = ref<string>("");

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

const placeholder = computed(() =>
  chatStore.agentOnline
    ? selectedImage.value
      ? '描述一下图片内容，或直接发送…'
      : AGENT_ONLINE_PLACEHOLDER
    : AGENT_OFFLINE_TIP,
);

const hasContent = computed(() =>
  inputText.value.trim().length > 0 || !!selectedImage.value
);

const canSend = computed(
  () => hasContent.value && !chatStore.loading && chatStore.agentOnline,
);

function triggerFileInput() {
  fileInputRef.value?.click()
}

function handleFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  if (!file.type.startsWith('image/')) {
    ElMessage.warning('请选择图片文件')
    return
  }

  if (file.size > MAX_IMAGE_SIZE) {
    ElMessage.warning('图片大小不能超过 10MB')
    return
  }

  const reader = new FileReader()
  reader.onload = () => {
    selectedImage.value = reader.result as string
  }
  reader.readAsDataURL(file)

  input.value = ''
}

function removeImage() {
  selectedImage.value = ""
}

function getImageBase64(): string | null {
  if (!selectedImage.value) return null
  const parts = selectedImage.value.split(',')
  if (parts.length === 2) return parts[1]
  return selectedImage.value
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
}

async function handleSend() {
  if (!canSend.value) return;

  const text = inputText.value.trim();
  const imageBase64 = getImageBase64();

  inputText.value = "";
  selectedImage.value = "";

  if (imageBase64) {
    await sendVisionMessage(imageBase64, text || undefined)
  } else {
    await sendMessage(text)
  }
}
</script>

<style scoped>
/* ══════════════════════════════════════════════════════════
   InputBar — 清爽输入区 + 图片上传
   暖白磨砂 · 柔和焦点光环 · 精致按钮 · 图片预览
   ══════════════════════════════════════════════════════════ */

.input-area {
  padding: 16px 24px 18px;
  border-block-start: 1px solid var(--border);
  background: var(--bg-glass-heavy);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  flex-shrink: 0;
}

.input-wrapper {
  display: flex;
  gap: 12px;
  align-items: flex-end;
}

.file-input-hidden {
  display: none;
}

.input-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.image-preview-row {
  display: flex;
  justify-content: flex-start;
}

.image-preview {
  position: relative;
  width: 80px;
  height: 80px;
  border-radius: var(--radius-sm);
  overflow: hidden;
  border: 2px solid var(--border-accent);
  box-shadow: var(--shadow-xs);
  animation: fadeIn 0.2s var(--ease-out-expo);
}

@keyframes fadeIn {
  from { opacity: 0; transform: scale(0.9); }
  to { opacity: 1; transform: scale(1); }
}

.image-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.image-remove-btn {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: rgba(0,0,0,0.55);
  border: none;
  cursor: pointer;
  display: grid;
  place-items: center;
  padding: 0;
  transition: background var(--duration-fast) var(--ease-out-expo);
}

.image-remove-btn span {
  color: #fff;
  font-size: 11px;
  line-height: 1;
}

.image-remove-btn:hover {
  background: rgba(0,0,0,0.75);
}

.message-input {
  flex: 1;
  min-width: 0;
}

.message-input :deep(.el-textarea__inner) {
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--text-primary);
  border-radius: var(--radius-md);
  padding: 12px 16px;
  font-size: 14px;
  font-family: var(--font-sans);
  line-height: 1.6;
  transition: border-color var(--duration-fast) var(--ease-out-expo),
              box-shadow var(--duration-fast) var(--ease-out-expo);
  resize: none;
  box-shadow: var(--shadow-xs);
}

.message-input :deep(.el-textarea__inner:hover) {
  border-color: var(--border-light);
}

.message-input :deep(.el-textarea__inner:focus),
.message-input :deep(.el-textarea__inner.is-focus) {
  border-color: var(--accent);
  box-shadow: var(--shadow-glow);
}

.message-input :deep(.el-textarea__inner::placeholder) {
  color: var(--text-muted);
  opacity: 0.6;
}

.input-actions {
  display: flex;
  gap: 8px;
  align-items: flex-end;
}

.camera-btn {
  width: 44px;
  height: 44px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--bg-card);
  cursor: pointer;
  font-size: 20px;
  display: grid;
  place-items: center;
  padding: 0;
  transition: all var(--duration-fast) var(--ease-out-expo);
  box-shadow: var(--shadow-xs);
  flex-shrink: 0;
}

.camera-btn:hover:not(:disabled) {
  border-color: var(--border-accent);
  background: var(--bg-card-hover);
  box-shadow: var(--shadow-sm);
  transform: translateY(-1px);
}

.camera-btn:active:not(:disabled) {
  transform: scale(0.94);
}

.camera-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.send-btn {
  width: 44px;
  height: 44px;
  border-radius: var(--radius-sm);
  flex-shrink: 0;
  padding: 0;
  font-size: 19px;
  background: var(--accent-gradient-soft) !important;
  border: none !important;
  box-shadow: 0 2px 12px rgba(232,138,26,0.22);
  transition: transform var(--duration-fast) var(--ease-out-back),
              box-shadow var(--duration-fast) var(--ease-out-expo);
}

.send-btn:not(:disabled):hover {
  box-shadow: 0 4px 20px rgba(232,138,26,0.35);
  transform: translateY(-1px);
}

.send-btn:not(:disabled):active {
  transform: scale(0.94);
  box-shadow: 0 1px 6px rgba(232,138,26,0.2);
}

.send-btn:disabled {
  background: var(--bg-elevated) !important;
  color: var(--text-muted) !important;
  box-shadow: none !important;
  opacity: 0.45;
}

.input-hint {
  font-size: 11px;
  color: var(--text-muted);
  margin-block-start: 10px;
  text-align: center;
  opacity: 0.45;
}
</style>

<template>
  <Transition name="fade">
    <div v-if="visible" class="welcome-screen">
      <div class="welcome-emoji">👨‍🍳</div>
      <h2 class="welcome-title">你好！我是<span>{{ appName }}</span></h2>
      <p class="welcome-desc">
        我可以帮你解答各种烹饪问题，从家常小炒到复杂大菜，<br />
        从食材选购到烹饪技法，都难不倒我！
      </p>
      <div class="welcome-tags">
        <el-tag
          v-for="tag in tags"
          :key="tag.label"
          type="warning"
          effect="plain"
          round
        >
          {{ tag.label }}
        </el-tag>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { APP_NAME, WELCOME_TAGS } from '@/constants'

defineProps<{ visible: boolean }>()

const appName = APP_NAME
const tags = WELCOME_TAGS
</script>

<style scoped>
/* ══════════════════════════════════════════════════════════
   WelcomeScreen — 高级欢迎页
   光晕动画 · 渐变文字 · 精致标签
   ══════════════════════════════════════════════════════════ */

.welcome-screen {
  text-align: center;
  padding: clamp(40px, 8vh, 80px) clamp(16px, 4vw, 32px);
  max-width: min(520px, 90vw);
  margin: auto;
}

.welcome-emoji {
  font-size: clamp(48px, 10vw, 80px);
  margin-block-end: clamp(12px, 2vw, 20px);
  filter: drop-shadow(0 4px 16px rgba(255, 107, 53, 0.3));
  animation: float 3s ease-in-out infinite;
  display: inline-block;
}

@keyframes float {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  25%      { transform: translateY(-6px) rotate(-2deg); }
  75%      { transform: translateY(-10px) rotate(2deg); }
}

.welcome-title {
  font-size: clamp(20px, 3.5vw, 28px);
  font-weight: 700;
  margin-block-end: clamp(8px, 1.5vw, 14px);
  color: var(--text-primary);
  line-height: 1.3;
  letter-spacing: -0.02em;
}

.welcome-title span {
  background: linear-gradient(135deg, var(--accent), var(--accent-light));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.welcome-desc {
  color: var(--text-secondary);
  font-size: clamp(13px, 1.8vw, 15px);
  line-height: 1.75;
  margin-block-end: clamp(20px, 3vw, 30px);
}

.welcome-tags {
  display: flex;
  flex-wrap: wrap;
  gap: clamp(6px, 1.2vw, 12px);
  justify-content: center;
}

.welcome-tags :deep(.el-tag) {
  background: var(--bg-card) !important;
  border: 1px solid var(--border) !important;
  color: var(--text-secondary) !important;
  font-weight: 400;
  padding: 4px 14px;
  transition:
    border-color var(--duration-fast),
    color var(--duration-fast),
    background var(--duration-fast);
}

.welcome-tags :deep(.el-tag:hover) {
  border-color: var(--accent) !important;
  color: var(--accent-light) !important;
  background: var(--bg-card-hover) !important;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.4s var(--ease-out);
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
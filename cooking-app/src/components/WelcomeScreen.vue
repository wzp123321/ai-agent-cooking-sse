<template>
  <Transition name="fade">
    <div v-if="visible" class="welcome-screen">
      <div class="welcome-emoji">👨‍🍳</div>
      <h2 class="welcome-title">你好！我是{{ appName }}</h2>
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
.welcome-screen {
  text-align: center;
  padding: 60px 20px;
  max-width: 480px;
  margin: auto;
}

.welcome-emoji {
  font-size: 72px;
  margin-bottom: 16px;
}

.welcome-title {
  font-size: 24px;
  font-weight: 700;
  margin-bottom: 12px;
  color: var(--text-primary);
}

.welcome-desc {
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.8;
  margin-bottom: 24px;
}

.welcome-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
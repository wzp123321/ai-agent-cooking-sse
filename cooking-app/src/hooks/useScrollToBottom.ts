import { ref, watch, nextTick, type Ref } from 'vue'

export function useScrollToBottom(source: Ref<unknown> | (() => unknown)) {
  const containerRef = ref<HTMLElement | null>(null)

  watch(
    typeof source === 'function' ? source : () => source.value,
    async () => {
      await nextTick()
      if (containerRef.value) {
        containerRef.value.scrollTop = containerRef.value.scrollHeight
      }
    },
  )

  return { containerRef }
}
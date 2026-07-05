import { computed, ref } from "vue";

const userAgent = ref(typeof navigator === "undefined" ? "" : navigator.userAgent);

export function usePlatform() {
  const isMacPlatform = computed(() => /Mac|iPhone|iPad|iPod/i.test(userAgent.value));

  return {
    isMacPlatform,
  };
}

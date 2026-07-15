import { computed, ref } from "vue";
import { defineStore } from "pinia";
import type { OnlineServiceStatus } from "@/types/model";
import { checkOnlineServiceStatus, restartOnlineService } from "@/api/commands/netease";

type ServiceState = "checking" | "restarting" | "available" | "unavailable";

const AVAILABLE_CHECK_INTERVAL_MS = 60_000;
const UNAVAILABLE_RETRY_DELAYS_MS = [2_000, 5_000, 10_000, 30_000];

export const useOnlineServiceStore = defineStore("onlineService", () => {
  const state = ref<ServiceState>("checking");
  const message = ref("");
  const statusCode = ref<number | null>(null);
  const lastCheckedAt = ref<number | null>(null);
  const isChecking = ref(false);
  const isRestarting = ref(false);
  let timer: number | null = null;
  let started = false;
  let failureStreak = 0;

  const isAvailable = computed(() => state.value === "available");

  function applyStatus(status: OnlineServiceStatus) {
    state.value = status.available ? "available" : "unavailable";
    message.value = status.message;
    statusCode.value = status.status_code;
    lastCheckedAt.value = Date.now();
    failureStreak = status.available ? 0 : failureStreak + 1;
  }

  function clearTimer() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function scheduleNextCheck() {
    clearTimer();
    if (!started || document.visibilityState === "hidden") return;
    const delay = isAvailable.value
      ? AVAILABLE_CHECK_INTERVAL_MS
      : UNAVAILABLE_RETRY_DELAYS_MS[
          Math.min(Math.max(0, failureStreak - 1), UNAVAILABLE_RETRY_DELAYS_MS.length - 1)
        ];
    timer = window.setTimeout(() => {
      timer = null;
      void checkNow();
    }, delay);
  }

  async function checkNow() {
    if (isChecking.value || isRestarting.value) return;
    clearTimer();
    isChecking.value = true;
    if (!lastCheckedAt.value) state.value = "checking";
    try {
      applyStatus(await checkOnlineServiceStatus());
    } catch (error) {
      state.value = "unavailable";
      message.value = error instanceof Error ? error.message : String(error);
      statusCode.value = null;
      lastCheckedAt.value = Date.now();
      failureStreak++;
    } finally {
      isChecking.value = false;
      scheduleNextCheck();
    }
  }

  async function restartService() {
    if (isChecking.value || isRestarting.value) return;
    isRestarting.value = true;
    state.value = "restarting";
    message.value = "";
    statusCode.value = null;
    let shouldRefreshStatus = false;
    try {
      await restartOnlineService();
      shouldRefreshStatus = true;
    } catch (error) {
      state.value = "unavailable";
      message.value = error instanceof Error ? error.message : String(error);
      statusCode.value = null;
      lastCheckedAt.value = Date.now();
    } finally {
      isRestarting.value = false;
      if (shouldRefreshStatus) await checkNow();
      else scheduleNextCheck();
    }
  }

  function handleVisibilityChange() {
    if (document.visibilityState === "hidden") {
      clearTimer();
    } else {
      void checkNow();
    }
  }

  function start() {
    if (started) return;
    started = true;
    document.addEventListener("visibilitychange", handleVisibilityChange);
    void checkNow();
  }

  function stop() {
    started = false;
    clearTimer();
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  }

  return {
    state,
    message,
    statusCode,
    lastCheckedAt,
    isChecking,
    isRestarting,
    isAvailable,
    checkNow,
    restartService,
    start,
    stop,
  };
});

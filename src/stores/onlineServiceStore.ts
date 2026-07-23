import { computed, ref } from "vue";
import { defineStore } from "pinia";
import type { OnlineServiceStatus } from "@/types/model";
import {
  checkOnlineServiceStatus,
  ensureOnlineService,
  restartOnlineService,
} from "@/api/commands/netease";

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
  let startPromise: Promise<void> | null = null;
  let checkPromise: Promise<boolean> | null = null;
  let restartPromise: Promise<void> | null = null;
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

  function checkNow(): Promise<boolean> {
    if (checkPromise) return checkPromise;
    if (isRestarting.value) return Promise.resolve(false);

    clearTimer();
    isChecking.value = true;
    if (!lastCheckedAt.value) state.value = "checking";

    checkPromise = (async () => {
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
      return isAvailable.value;
    })().finally(() => {
      checkPromise = null;
    });

    return checkPromise;
  }

  function restartService(): Promise<void> {
    if (restartPromise) return restartPromise;

    restartPromise = (async () => {
      if (checkPromise) await checkPromise;

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
    })().finally(() => {
      restartPromise = null;
    });

    return restartPromise;
  }

  function handleVisibilityChange() {
    if (document.visibilityState === "hidden") {
      clearTimer();
    } else {
      void checkNow();
    }
  }

  async function ensureStarted() {
    let didStart = false;
    if (!started) {
      started = true;
      didStart = true;
      state.value = "checking";
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }
    if (startPromise) return startPromise;
    if (restartPromise) {
      await restartPromise;
      if (isAvailable.value) return;
    }
    if (isAvailable.value) {
      if (didStart) scheduleNextCheck();
      return;
    }

    state.value = "checking";
    message.value = "";
    statusCode.value = null;

    startPromise = (async () => {
      try {
        await ensureOnlineService();
      } catch (error) {
        state.value = "unavailable";
        message.value = error instanceof Error ? error.message : String(error);
        statusCode.value = null;
        lastCheckedAt.value = Date.now();
        failureStreak++;
        scheduleNextCheck();
        throw error;
      }

      const available = await checkNow();
      if (!available) {
        throw new Error(message.value || "Online service is unavailable");
      }
    })().finally(() => {
      startPromise = null;
    });
    return startPromise;
  }

  function start() {
    void ensureStarted().catch((error) => {
      console.error("Failed to start online service:", error);
    });
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
    ensureStarted,
    restartService,
    start,
    stop,
  };
});

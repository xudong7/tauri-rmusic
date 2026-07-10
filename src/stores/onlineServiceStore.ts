import { computed, ref } from "vue";
import { defineStore } from "pinia";
import type { OnlineServiceStatus } from "@/types/model";
import { checkOnlineServiceStatus, restartOnlineService } from "@/api/commands/netease";

type ServiceState = "checking" | "restarting" | "available" | "unavailable";

const CHECK_INTERVAL_MS = 10_000;

export const useOnlineServiceStore = defineStore("onlineService", () => {
  const state = ref<ServiceState>("checking");
  const message = ref("");
  const statusCode = ref<number | null>(null);
  const lastCheckedAt = ref<number | null>(null);
  const isChecking = ref(false);
  const isRestarting = ref(false);
  let timer: number | null = null;

  const isAvailable = computed(() => state.value === "available");

  function applyStatus(status: OnlineServiceStatus) {
    state.value = status.available ? "available" : "unavailable";
    message.value = status.message;
    statusCode.value = status.status_code;
    lastCheckedAt.value = Date.now();
  }

  async function checkNow() {
    if (isChecking.value || isRestarting.value) return;
    isChecking.value = true;
    if (!lastCheckedAt.value) state.value = "checking";
    try {
      applyStatus(await checkOnlineServiceStatus());
    } catch (error) {
      state.value = "unavailable";
      message.value = error instanceof Error ? error.message : String(error);
      statusCode.value = null;
      lastCheckedAt.value = Date.now();
    } finally {
      isChecking.value = false;
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
    }
  }

  function start() {
    if (timer !== null) return;
    void checkNow();
    timer = window.setInterval(() => {
      void checkNow();
    }, CHECK_INTERVAL_MS);
  }

  function stop() {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
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

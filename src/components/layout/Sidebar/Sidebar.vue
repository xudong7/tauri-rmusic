<script setup lang="ts">
import { useRouter, useRoute } from "vue-router";
import { useI18n } from "vue-i18n";
import { Folder, Search, Setting } from "@element-plus/icons-vue";
import { useViewStore } from "@/stores/viewStore";

const { t } = useI18n();
const router = useRouter();
const route = useRoute();
const viewStore = useViewStore();

const navItems = [
  { path: "/", name: "LocalMusic", labelKey: "common.localMusic", icon: Folder },
  { path: "/online", name: "OnlineMusic", labelKey: "common.onlineSearch", icon: Search },
  { path: "/settings", name: "Settings", labelKey: "common.settings", icon: Setting },
];

function isActive(item: (typeof navItems)[0]) {
  if (item.name === "OnlineMusic") {
    // 搜索页和歌手页都属于「在线」模块，侧栏高亮
    return route.name === "OnlineMusic" || route.name === "Artist";
  }
  return route.name === item.name;
}

function goTo(item: (typeof navItems)[0]) {
  if (isActive(item)) return;
  // 点击「在线搜索」时回到上次在线的页面（搜索列表或歌手页）
  const targetPath = item.name === "OnlineMusic" ? viewStore.lastOnlinePath : item.path;
  router.push(targetPath);
}
</script>

<template>
  <aside class="sidebar">
    <nav class="sidebar-nav">
      <div
        v-for="item in navItems"
        :key="item.path"
        class="nav-item"
        :class="{ 'is-active': isActive(item) }"
        @click="goTo(item)"
      >
        <el-icon class="nav-icon"><component :is="item.icon" /></el-icon>
        <span class="nav-label">{{ t(item.labelKey) }}</span>
      </div>
    </nav>
  </aside>
</template>

<style scoped src="./Sidebar.css" />

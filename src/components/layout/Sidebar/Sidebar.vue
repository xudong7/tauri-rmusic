<script setup lang="ts">
import { useRouter, useRoute } from "vue-router";
import { useI18n } from "vue-i18n";
import { Folder, Search, Setting } from "@element-plus/icons-vue";

const { t } = useI18n();
const router = useRouter();
const route = useRoute();

const navItems = [
  { path: "/", name: "LocalMusic", labelKey: "common.localMusic", icon: Folder },
  { path: "/online", name: "OnlineMusic", labelKey: "common.onlineSearch", icon: Search },
  { path: "/settings", name: "Settings", labelKey: "common.settings", icon: Setting },
];

function isActive(item: (typeof navItems)[0]) {
  return route.name === item.name;
}

function goTo(item: (typeof navItems)[0]) {
  if (isActive(item)) return;
  router.push(item.path);
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

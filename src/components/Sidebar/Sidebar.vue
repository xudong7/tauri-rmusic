<script setup lang="ts">
import { useRouter, useRoute } from "vue-router";
import { Folder, Search, Setting } from "@element-plus/icons-vue";
const router = useRouter();
const route = useRoute();

const navItems = [
  { path: "/", name: "LocalMusic", label: "本地音乐", icon: Folder },
  { path: "/online", name: "OnlineMusic", label: "在线搜索", icon: Search },
  { path: "/settings", name: "Settings", label: "设置", icon: Setting },
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
        <span class="nav-label">{{ item.label }}</span>
      </div>
    </nav>
  </aside>
</template>

<style scoped src="./Sidebar.css" />

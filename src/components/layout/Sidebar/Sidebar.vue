<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useI18n } from "vue-i18n";
import { Folder, Search, Setting, Plus, List, ArrowDown } from "@element-plus/icons-vue";
import { useViewStore } from "@/stores/viewStore";
import { usePlaylistStore } from "@/stores/playlistStore";

const STORAGE_KEY_PLAYLIST_EXPANDED = "sidebar_playlist_expanded";

const { t } = useI18n();
const router = useRouter();
const route = useRoute();
const viewStore = useViewStore();
const playlistStore = usePlaylistStore();

const playlistSectionExpanded = ref(true);

onMounted(() => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_PLAYLIST_EXPANDED);
    if (saved !== null) playlistSectionExpanded.value = saved === "1";
  } catch {
    /* ignore */
  }
});

function togglePlaylistSection() {
  playlistSectionExpanded.value = !playlistSectionExpanded.value;
  try {
    localStorage.setItem(
      STORAGE_KEY_PLAYLIST_EXPANDED,
      playlistSectionExpanded.value ? "1" : "0"
    );
  } catch {
    /* ignore */
  }
}

const navItems = [
  { path: "/", name: "LocalMusic", labelKey: "common.localMusic", icon: Folder },
  { path: "/online", name: "OnlineMusic", labelKey: "common.onlineSearch", icon: Search },
  { path: "/settings", name: "Settings", labelKey: "common.settings", icon: Setting },
];

function isActive(item: (typeof navItems)[0]) {
  if (item.name === "OnlineMusic") {
    return route.name === "OnlineMusic" || route.name === "Artist";
  }
  return route.name === item.name;
}

function isPlaylistActive(id: string) {
  return route.name === "Playlist" && route.params.id === id;
}

function goTo(item: (typeof navItems)[0]) {
  if (isActive(item)) return;
  const targetPath = item.name === "OnlineMusic" ? viewStore.lastOnlinePath : item.path;
  router.push(targetPath);
}

function goToNewPlaylist() {
  router.push("/playlist/new");
}

function goToPlaylist(id: string) {
  if (route.params.id === id) return;
  router.push(`/playlist/${id}`);
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

      <div class="playlist-section" :class="{ 'is-collapsed': !playlistSectionExpanded }">
        <div
          class="playlist-section-title"
          role="button"
          tabindex="0"
          :aria-expanded="playlistSectionExpanded"
          @click="togglePlaylistSection"
          @keydown.enter.space.prevent="togglePlaylistSection"
        >
          <el-icon class="chevron"><ArrowDown /></el-icon>
          <el-icon class="title-icon"><List /></el-icon>
          <span class="playlist-section-title-text">{{ t("playlist.title") }}</span>
          <el-icon
            class="playlist-section-add"
            :title="t('playlist.newPlaylist')"
            :aria-label="t('playlist.newPlaylist')"
            @click.stop="goToNewPlaylist"
          >
            <Plus />
          </el-icon>
        </div>
        <Transition name="playlist-body">
          <div v-show="playlistSectionExpanded" class="playlist-section-body">
            <div
              v-for="pl in playlistStore.playlists"
              :key="pl.id"
              class="nav-item nav-item-playlist"
              :class="{ 'is-active': isPlaylistActive(pl.id) }"
              @click="goToPlaylist(pl.id)"
            >
              <span class="nav-label" :title="pl.name">{{
                pl.name || t("playlist.unnamed")
              }}</span>
            </div>
          </div>
        </Transition>
      </div>
    </nav>
  </aside>
</template>

<style scoped src="./Sidebar.css" />

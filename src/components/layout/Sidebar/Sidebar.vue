<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useI18n } from "vue-i18n";
import {
  Folder,
  Search,
  Setting,
  Plus,
  List,
  ArrowDown,
  Trophy,
} from "@element-plus/icons-vue";
import { STORAGE_KEY_SIDEBAR_PLAYLIST_EXPANDED } from "@/constants";
import { useViewStore } from "@/stores/viewStore";
import { usePlaylistStore } from "@/stores/playlistStore";
import PlaylistCover from "@/components/feature/PlaylistCover/PlaylistCover.vue";

const { t } = useI18n();
const router = useRouter();
const route = useRoute();
const viewStore = useViewStore();
const playlistStore = usePlaylistStore();

const playlistSectionExpanded = ref(true);

onMounted(() => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_SIDEBAR_PLAYLIST_EXPANDED);
    if (saved !== null) playlistSectionExpanded.value = saved === "1";
  } catch {
    /* ignore */
  }
});

function togglePlaylistSection() {
  playlistSectionExpanded.value = !playlistSectionExpanded.value;
  try {
    localStorage.setItem(
      STORAGE_KEY_SIDEBAR_PLAYLIST_EXPANDED,
      playlistSectionExpanded.value ? "1" : "0"
    );
  } catch {
    /* ignore */
  }
}

const navItems = [
  { path: "/", name: "LocalMusic", labelKey: "common.localMusic", icon: Folder },
  { path: "/online", name: "OnlineMusic", labelKey: "common.onlineSearch", icon: Search },
  { path: "/toplist", name: "Toplist", labelKey: "toplist.title", icon: Trophy },
  { path: "/settings", name: "Settings", labelKey: "common.settings", icon: Setting },
];

// 在线相关路由归属「在线音乐」这一项高亮。这里是显式名单而非前缀匹配，
// 新增在线页面时必须同步补充，否则导航不会高亮。
const ONLINE_NAV_ROUTE_NAMES = ["OnlineMusic", "Artist", "OnlinePlaylist", "OnlineAlbum"];

function isActive(item: (typeof navItems)[0]) {
  if (item.name === "OnlineMusic") {
    return ONLINE_NAV_ROUTE_NAMES.includes(String(route.name));
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
      <button
        v-for="item in navItems"
        :key="item.path"
        type="button"
        class="nav-item"
        :class="{ 'is-active': isActive(item) }"
        @click="goTo(item)"
      >
        <el-icon class="nav-icon"><component :is="item.icon" /></el-icon>
        <span class="nav-label">{{ t(item.labelKey) }}</span>
      </button>

      <div class="playlist-section" :class="{ 'is-collapsed': !playlistSectionExpanded }">
        <div class="playlist-section-title">
          <button
            type="button"
            class="playlist-section-toggle"
            :aria-expanded="playlistSectionExpanded"
            @click="togglePlaylistSection"
          >
            <el-icon class="chevron"><ArrowDown /></el-icon>
            <el-icon class="title-icon"><List /></el-icon>
            <span class="playlist-section-title-text">{{ t("playlist.title") }}</span>
          </button>
          <button
            type="button"
            class="playlist-section-add"
            :title="t('playlist.newPlaylist')"
            :aria-label="t('playlist.newPlaylist')"
            @click="goToNewPlaylist"
          >
            <el-icon><Plus /></el-icon>
          </button>
        </div>
        <Transition name="playlist-body">
          <div v-show="playlistSectionExpanded" class="playlist-section-body">
            <button
              v-for="pl in playlistStore.playlists"
              :key="pl.id"
              type="button"
              class="nav-item nav-item-playlist"
              :class="{ 'is-active': isPlaylistActive(pl.id) }"
              @click="goToPlaylist(pl.id)"
            >
              <PlaylistCover
                :item="pl.items[0]"
                :size="24"
                :radius="6"
                aria-hidden="true"
              />
              <span class="nav-label" :title="pl.name">{{
                pl.name || t("playlist.unnamed")
              }}</span>
            </button>
          </div>
        </Transition>
      </div>
    </nav>
  </aside>
</template>

<style scoped src="./Sidebar.css" />

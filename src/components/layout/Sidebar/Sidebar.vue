<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useI18n } from "vue-i18n";
import { Folder, Setting, Plus } from "@element-plus/icons-vue";
import OnlineMusicIcon from "@/components/base/icons/OnlineMusicIcon.vue";
import { useViewStore } from "@/stores/viewStore";
import { usePlaylistStore } from "@/stores/playlistStore";
import { useCollectedPlaylistStore } from "@/stores/collectedPlaylistStore";
import { useCollectedAlbumStore } from "@/stores/collectedAlbumStore";
import PlaylistCover from "@/components/feature/PlaylistCover/PlaylistCover.vue";
import CoverImage from "@/components/base/CoverImage/CoverImage.vue";

const { t } = useI18n();
const router = useRouter();
const route = useRoute();
const viewStore = useViewStore();
const playlistStore = usePlaylistStore();
const collectedStore = useCollectedPlaylistStore();
const collectedAlbumStore = useCollectedAlbumStore();

/** 侧边栏歌单区分栏：自建 / 收藏 */
const playlistTab = ref<"created" | "collected">("created");

const navItems = [
  { path: "/", name: "LocalMusic", labelKey: "common.localMusic", icon: Folder },
  {
    path: "/online",
    name: "OnlineMusic",
    labelKey: "common.onlineSearch",
    icon: OnlineMusicIcon,
  },
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

function isCollectedPlaylistActive(id: string) {
  return route.name === "OnlinePlaylist" && String(route.params.id) === id;
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

function isCollectedAlbumActive(id: string): boolean {
  return route.name === "OnlineAlbum" && String(route.params.id || "") === id;
}

function goToCollectedAlbum(id: string) {
  if (isCollectedAlbumActive(id)) return;
  router.push({ name: "OnlineAlbum", params: { id } });
}

const hasNothingCollected = computed(
  () =>
    collectedAlbumStore.collectedAlbums.length === 0 &&
    collectedStore.collectedPlaylists.length === 0
);

function goToCollectedPlaylist(id: string) {
  if (isCollectedPlaylistActive(id)) return;
  router.push({ name: "OnlinePlaylist", params: { id } });
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
        :aria-current="isActive(item) ? 'page' : undefined"
        @click="goTo(item)"
      >
        <el-icon class="nav-icon"><component :is="item.icon" /></el-icon>
        <span class="nav-label">{{ t(item.labelKey) }}</span>
      </button>

      <div class="playlist-section">
        <!-- 分栏栏：「自建歌单 | 收藏」，右侧是新建键（只在自建那一栏显示）。
             第二栏叫「收藏」而不是「收藏歌单」：它现在同时装收藏的专辑与歌单。 -->
        <div class="playlist-section-header">
          <div class="playlist-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              class="playlist-tab"
              :class="{ 'is-active': playlistTab === 'created' }"
              :aria-selected="playlistTab === 'created'"
              @click="playlistTab = 'created'"
            >
              {{ t("playlist.created") }}
            </button>
            <span class="playlist-tab-divider" aria-hidden="true"></span>
            <button
              type="button"
              role="tab"
              class="playlist-tab"
              :class="{ 'is-active': playlistTab === 'collected' }"
              :aria-selected="playlistTab === 'collected'"
              @click="playlistTab = 'collected'"
            >
              {{ t("common.collected") }}
            </button>
          </div>
          <button
            v-if="playlistTab === 'created'"
            type="button"
            class="playlist-section-add"
            :title="t('playlist.newPlaylist')"
            :aria-label="t('playlist.newPlaylist')"
            @click="goToNewPlaylist"
          >
            <el-icon><Plus /></el-icon>
          </button>
        </div>

        <div class="playlist-section-body">
          <template v-if="playlistTab === 'created'">
            <button
              v-for="pl in playlistStore.playlists"
              :key="pl.id"
              type="button"
              class="nav-item nav-item-playlist"
              :class="{ 'is-active': isPlaylistActive(pl.id) }"
              :aria-current="isPlaylistActive(pl.id) ? 'page' : undefined"
              @click="goToPlaylist(pl.id)"
            >
              <PlaylistCover
                :item="pl.items[0]"
                :size="20"
                :radius="5"
                aria-hidden="true"
              />
              <span class="nav-label-group">
                <span class="nav-label" :title="pl.name">{{
                  pl.name || t("playlist.unnamed")
                }}</span>
                <span class="nav-sublabel">{{
                  t("playlist.trackCount", { count: pl.items.length })
                }}</span>
              </span>
            </button>
          </template>

          <!-- 收藏页把两种收藏分两组列出。专辑在前：它的条目更少、也更容易找，
               而歌单可能很多，放在下面滚动时先看到专辑不会挡路。
               分组的另一个好处是以后再加别的收藏类型不必再动页签栏——
               侧栏只有 192px，塞不下第三个页签。 -->
          <template v-else>
            <template v-if="collectedAlbumStore.collectedAlbums.length > 0">
              <p class="playlist-group-title">{{ t("common.albums") }}</p>
              <button
                v-for="al in collectedAlbumStore.collectedAlbums"
                :key="al.id"
                type="button"
                class="nav-item nav-item-playlist"
                :class="{ 'is-active': isCollectedAlbumActive(al.id) }"
                :aria-current="isCollectedAlbumActive(al.id) ? 'page' : undefined"
                @click="goToCollectedAlbum(al.id)"
              >
                <CoverImage
                  :src="al.pic_url"
                  alt=""
                  :size="20"
                  :radius="5"
                  variant="album"
                  class="playlist-cover"
                />
                <span class="nav-label-group">
                  <span class="nav-label" :title="al.name">{{ al.name }}</span>
                  <span class="nav-sublabel">{{
                    t("onlineAlbum.songCount", { count: al.size })
                  }}</span>
                </span>
              </button>
            </template>

            <template v-if="collectedStore.collectedPlaylists.length > 0">
              <p class="playlist-group-title">{{ t("common.playlists") }}</p>
              <button
                v-for="pl in collectedStore.collectedPlaylists"
                :key="pl.id"
                type="button"
                class="nav-item nav-item-playlist"
                :class="{ 'is-active': isCollectedPlaylistActive(pl.id) }"
                :aria-current="isCollectedPlaylistActive(pl.id) ? 'page' : undefined"
                @click="goToCollectedPlaylist(pl.id)"
              >
                <CoverImage
                  :src="pl.cover_url"
                  alt=""
                  :size="20"
                  :radius="5"
                  variant="playlist"
                  class="playlist-cover"
                />
                <span class="nav-label-group">
                  <span class="nav-label" :title="pl.name">{{ pl.name }}</span>
                  <span class="nav-sublabel">{{
                    t("playlist.trackCount", { count: pl.track_count })
                  }}</span>
                </span>
              </button>
            </template>

            <p v-if="hasNothingCollected" class="playlist-empty-hint">
              {{ t("common.collectedEmpty") }}
            </p>
          </template>
        </div>
      </div>
    </nav>
  </aside>
</template>

<style scoped src="./Sidebar.css" />

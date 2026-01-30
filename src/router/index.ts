import { createRouter, createWebHistory } from "vue-router";
import LocalMusic from "@/views/LocalMusicView.vue";
import OnlineMusic from "@/views/OnlineMusicView.vue";
import Artist from "@/views/ArtistView.vue";
import Settings from "@/views/SettingsView.vue";
import PlaylistView from "@/views/PlaylistView.vue";
import { usePlaylistStore } from "@/stores/playlistStore";

const routes = [
  {
    path: "/",
    name: "LocalMusic",
    component: LocalMusic,
  },
  {
    path: "/online",
    name: "OnlineMusic",
    component: OnlineMusic,
  },
  {
    path: "/playlist/new",
    name: "PlaylistNew",
    component: PlaylistView,
    beforeEnter: (_to, _from, next) => {
      const store = usePlaylistStore();
      const list = store.createPlaylist("");
      next({ path: `/playlist/${list.id}`, replace: true });
    },
  },
  {
    path: "/playlist/:id",
    name: "Playlist",
    component: PlaylistView,
  },
  {
    path: "/artist/:id",
    name: "Artist",
    component: Artist,
  },
  {
    path: "/settings",
    name: "Settings",
    component: Settings,
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;

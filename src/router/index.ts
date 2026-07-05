import {
  createRouter,
  createWebHistory,
  type NavigationGuardNext,
  type RouteLocationNormalized,
} from "vue-router";
import { usePlaylistStore } from "@/stores/playlistStore";

const LocalMusic = () => import("@/views/LocalMusicView.vue");
const OnlineMusic = () => import("@/views/OnlineMusicView.vue");
const Artist = () => import("@/views/ArtistView.vue");
const Settings = () => import("@/views/SettingsView.vue");
const PlaylistView = () => import("@/views/PlaylistView.vue");

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
    beforeEnter: (
      _to: RouteLocationNormalized,
      _from: RouteLocationNormalized,
      next: NavigationGuardNext
    ) => {
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

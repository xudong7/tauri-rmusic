import { createRouter, createWebHistory } from 'vue-router';
import LocalMusic from '../views/LocalMusicView.vue';
import OnlineMusic from '../views/OnlineMusicView.vue';
import Settings from '../views/SettingsView.vue';

const routes = [
  {
    path: '/',
    name: 'LocalMusic',
    component: LocalMusic
  },
  {
    path: '/online',
    name: 'OnlineMusic',
    component: OnlineMusic
  },
  {
    path: '/settings',
    name: 'Settings',
    component: Settings
  }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

export default router;

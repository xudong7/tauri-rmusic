import { createRouter, createWebHashHistory } from "vue-router";
import Home from "../views/Home.vue";
import Netease from "../views/Netease.vue";

const routes = [
  {
    path: "/",
    name: "Home",
    component: Home,
  },
  {
    path: "/netease",
    name: "Netease",
    component: Netease,
  },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

export default router;

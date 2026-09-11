<template>
  <PageLayout class="toplist-view" max-width="wide">
    <PageHeader :title="t('toplist.title')">
      <template #actions>
        <el-button
          text
          :icon="Refresh"
          :loading="store.isToplistLoading"
          @click="store.loadToplist"
        >
          {{ t("toplist.refresh") }}
        </el-button>
      </template>
    </PageHeader>

    <EntityGrid :items="cards" :loading="store.isToplistLoading" @activate="openToplist">
      <template #loading><el-skeleton :rows="5" animated /></template>
      <template #empty>
        <el-empty :description="t('toplist.empty')" />
      </template>
    </EntityGrid>
  </PageLayout>
</template>

<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import { Refresh } from "@element-plus/icons-vue";
import type { PlaylistInfo } from "@/types/model";
import { ViewMode } from "@/types/model";
import { formatCompactNumber } from "@/utils/songUtils";
import { useOnlinePlaylistStore } from "@/stores/onlinePlaylistStore";
import { useViewStore } from "@/stores/viewStore";
import EntityGrid from "@/components/feature/EntityGrid/EntityGrid.vue";
import type { EntityCardModel } from "@/components/feature/EntityGrid/types";
import PageHeader from "@/components/layout/PageHeader/PageHeader.vue";
import PageLayout from "@/components/layout/PageLayout/PageLayout.vue";

const { t, locale } = useI18n();
const router = useRouter();
const store = useOnlinePlaylistStore();
const viewStore = useViewStore();

const cards = computed<EntityCardModel[]>(() =>
  store.toplists.map((item: PlaylistInfo) => ({
    key: item.id,
    kind: "playlist",
    title: item.name,
    metaLabel: formatCompactNumber(item.play_count, locale.value),
    coverUrl: item.cover_url,
    badge: item.update_frequency || undefined,
  }))
);

function openToplist(card: EntityCardModel) {
  router.push({ name: "OnlinePlaylist", params: { id: card.key } });
}

onMounted(() => {
  viewStore.setViewMode(ViewMode.ONLINE);
  // 刻意不调用 setLastOnlinePath：Sidebar 的「在线音乐」会跳到最后记录的
  // 在线路径，若这里写入 /toplist，点击「在线音乐」会看起来毫无反应。
  void store.loadToplist();
});
</script>

<style scoped>
.toplist-view {
  overflow: hidden;
}
</style>

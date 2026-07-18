<script setup lang="ts">
import { computed } from "vue";
import type { MusicFile, PlaylistItem } from "@/types/model";
import { useLocalMusicStore } from "@/stores/localMusicStore";
import { useCoverLoader } from "@/composables/useCoverLoader";
import CoverImage from "@/components/base/CoverImage/CoverImage.vue";

const props = withDefaults(
  defineProps<{
    item?: PlaylistItem;
    size?: number;
    radius?: number;
  }>(),
  {
    item: undefined,
    size: 40,
    radius: 9,
  }
);

const localStore = useLocalMusicStore();

const localMusic = computed<MusicFile | null>(() => {
  if (props.item?.type !== "local") return null;
  const fileName = props.item.file_name;
  return (
    localStore.musicFiles.find((file) => file.file_name === fileName) ?? {
      id: -1,
      file_name: fileName,
    }
  );
});

const onlineSong = computed(() =>
  props.item?.type === "online" ? props.item.song : null
);

const { localCoverUrl } = useCoverLoader({
  currentMusic: () => localMusic.value,
  currentOnlineSong: () => onlineSong.value,
  getDefaultDirectory: () => localStore.getDefaultDirectory(),
});

const resolvedCoverUrl = computed(
  () => onlineSong.value?.pic_url || localCoverUrl.value || ""
);
</script>

<template>
  <CoverImage
    :src="resolvedCoverUrl"
    alt=""
    :size="size"
    :radius="radius"
    variant="album"
    class="playlist-cover"
  />
</template>

<style scoped>
.playlist-cover {
  box-shadow: 0 2px 8px color-mix(in srgb, var(--el-color-primary) 10%, transparent);
}
</style>

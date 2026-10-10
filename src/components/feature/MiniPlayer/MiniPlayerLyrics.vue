<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import type { LyricLine } from "@/utils/lyrics";

const props = defineProps<{
  lines: LyricLine[];
  activeIndex: number;
  loading: boolean;
  unavailable: boolean;
  /** 当前封面：作为歌词面板的淡背景板；没有封面时不铺 */
  coverUrl: string;
}>();

const emit = defineEmits<{
  seek: [positionMs: number];
}>();

const { t } = useI18n();
const listRef = ref<HTMLElement | null>(null);
/** 第一次定位不做平滑：从顶部缓缓滚到中间看着像卡住了 */
let hasPositioned = false;

async function scrollToActive() {
  if (props.activeIndex < 0) return;
  await nextTick();
  const active = listRef.value?.querySelector<HTMLElement>(".is-active");
  active?.scrollIntoView({
    block: "center",
    behavior: hasPositioned ? "smooth" : "auto",
  });
  hasPositioned = true;
}

watch(() => props.activeIndex, scrollToActive);
watch(() => props.lines, scrollToActive);
</script>

<template>
  <div class="mini-lyrics">
    <!-- 封面做背景板：模糊 + 洗淡，只留一点颜色和轮廓 -->
    <div v-if="coverUrl" class="mini-lyrics__backdrop" aria-hidden="true">
      <img class="mini-lyrics__backdrop-image" :src="coverUrl" alt="" />
    </div>

    <p v-if="loading" class="mini-lyrics__hint">{{ t("lyric.loading") }}</p>
    <p v-else-if="unavailable || lines.length === 0" class="mini-lyrics__hint">
      {{ t("lyric.noLyric") }}
    </p>
    <div v-else ref="listRef" class="mini-lyrics__list">
      <p
        v-for="(line, index) in lines"
        :key="`${line.time}-${index}`"
        class="mini-lyrics__line"
        :class="{ 'is-active': index === activeIndex }"
        @click="emit('seek', line.time)"
      >
        <span class="mini-lyrics__text">{{ line.text }}</span>
        <span v-if="line.translation" class="mini-lyrics__translation">
          {{ line.translation }}
        </span>
      </p>
    </div>
  </div>
</template>

<style scoped src="./MiniPlayerLyrics.css" />

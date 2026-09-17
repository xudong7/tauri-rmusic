import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import themesCss from "@/assets/styles/themes.css?raw";
import trackRowSource from "./TrackRow.vue?raw";
import trackListSource from "./TrackList.vue?raw";
import TrackList from "./TrackList.vue";
import type { TrackRowModel } from "./types";

/** 数一条 grid-template-columns 里有多少条轨道。
 *  minmax(180px, 1fr) 内部有空格，所以只把括号深度为 0 的空格当分隔符。 */
function countTracks(value: string): number {
  let depth = 0;
  let tracks = 0;
  let inside = false;
  for (const char of value) {
    if (char === "(") depth += 1;
    else if (char === ")") depth -= 1;
    if (depth === 0 && char === " ") {
      inside = false;
      continue;
    }
    if (!inside) {
      inside = true;
      tracks += 1;
    }
  }
  return tracks;
}

/** themes.css 里第一条（不带断点的那条）--app-track-grid */
const baseGrid = themesCss.match(/--app-track-grid:\s*([^;]+);/)?.[1] ?? "";

function rows(count: number): TrackRowModel[] {
  return Array.from({ length: count }, (_, index) => ({
    key: `track-${index}`,
    title: `Track ${index}`,
    artist: "Artist",
    coverUrl: "",
    source: "local",
    sourceIndex: index,
  }));
}

describe("TrackList", () => {
  it("uses standard rendering for short lists", () => {
    const wrapper = mount(TrackList, { props: { items: rows(3) } });
    expect(wrapper.find("[data-render-mode='standard']").exists()).toBe(true);
    expect(wrapper.findAllComponents({ name: "TrackRow" })).toHaveLength(3);
  });

  it("switches to virtual rendering for long lists", () => {
    const wrapper = mount(TrackList, { props: { items: rows(60) } });
    expect(wrapper.find("[data-render-mode='virtual']").exists()).toBe(true);
  });

  // 列头与行曾各自维护一份网格：行上删掉序号列时列头那份没人跟着改，
  // 于是「歌曲」这个标题比歌名右移了整整 52px。这两条把「同源」钉死。
  describe("列头与行的网格必须同源", () => {
    it("列头的格数等于网格的轨道数", () => {
      const tracks = countTracks(baseGrid);
      // 自检：解析失败会得到 0，下面的断言就成了空转
      expect(tracks).toBe(4);

      const cells = mount(TrackList, { props: { items: rows(3) } }).findAll(
        ".track-list__columns > *"
      );
      expect(cells).toHaveLength(tracks);
    });

    // 这一条守的是一个没有报错、也测不出布局的错误：
    // grid-column: -1 是「最后一条网格线」，不是「最后一格」。拿它当起始线，
    // 元素就落在显式网格之外，浏览器为它新生成一格——整行右移一格，专辑挤进
    // 时长那格，列头却不会跟着动。jsdom 不算布局，只有真浏览器能看出来，
    // 所以退而求其次：从源码层面禁止裸负线号。
    it("网格定位不写裸负线号，要用线到线的区间", () => {
      const sources = import.meta.glob("../../**/*.{vue,css}", {
        query: "?raw",
        import: "default",
        eager: true,
      }) as Record<string, string>;

      const offenders: string[] = [];
      for (const [file, text] of Object.entries(sources)) {
        // 注释里会原样引用这些写法，先去掉再找
        const css = text.replace(/\/\*[\s\S]*?\*\//g, "");
        for (const match of css.matchAll(/grid-(?:column|row)(?:-start)?:\s*-\d+\s*;/g)) {
          offenders.push(`${file}: ${match[0]}`);
        }
      }

      expect(offenders).toEqual([]);
    });

    it("两边都读同一个 token，不各写一份", () => {
      for (const [file, source] of [
        ["TrackRow.vue", trackRowSource],
        ["TrackList.vue", trackListSource],
      ] as const) {
        expect(source, `${file} 应当读 --app-track-grid`).toContain(
          "grid-template-columns: var(--app-track-grid)"
        );
      }
    });
  });
});

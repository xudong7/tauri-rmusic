import { describe, expect, it } from "vitest";

/**
 * 过渡类名拼错的表现是「动画静默失效」：不报错、不报警、测试全绿，只有肉眼看
 * 才发现没动。这条测试把 `<Transition name="X">` 与 CSS 里的 `.X-enter-active`
 * 对上，兜住这一类错误。
 *
 * 局限（读的人得知道）：
 *   · 只验证类名存在，不验证规则挂在哪个元素上、也不验证动了哪些属性；
 *   · 不验证时长/曲线——「后代的时长不能超过根」这类约束表达不出来，
 *     硬写成断言只会变成对着实现抄一遍；
 *   · 动态 `:name` 与显式 `active-class` 静态查不了，直接跳过。
 */
const sources = import.meta.glob("../../**/*.{vue,css}", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/** 静态 <Transition name="X"> 的 X。
 *
 *  只读 .vue 的 <template> 段落，不全文扫：注释里写一句
 *  `<Transition name="queue">` 会被全文扫当成一处声明 —— 本文件落地时真踩到
 *  过，而且多出来的条目把「扫到了几条」的自检也一起骗了过去。
 *  TransitionGroup 不会被 <Transition\b 命中（n 与 G 之间没有词边界），
 *  正是想要的。 */
function collectTransitionNames(): Array<{ name: string; file: string }> {
  return Object.entries(sources)
    .filter(([file]) => file.endsWith(".vue"))
    .flatMap(([file, text]) => {
      const template = text.match(/<template>([\s\S]*)<\/template>/)?.[1] ?? "";
      return [...template.matchAll(/<Transition\b[^>]*>/g)]
        .filter(([tag]) => !/[:@]name=|active-class=/.test(tag))
        .map(([tag]) => tag.match(/\bname\s*=\s*["']([\w-]+)["']/)?.[1])
        .filter((name): name is string => Boolean(name))
        .map((name) => ({ name, file }));
    });
}

const declared = collectTransitionNames();
// 样式侧要连 .css 一起扫：过渡规则可能写在组件自己的 <style> 里，也可能写在
// 独立样式表里（Sidebar / HeaderBar 就是后者）。
// 先去掉 CSS 注释：本仓库的注释习惯是成段解释「为什么」，里面常把类名原样
// 写一遍；留下注释的话，改完名字忘改规则也会被注释里的旧名字蒙混过去。
const styles = Object.values(sources)
  .join("\n")
  .replace(/\/\*[\s\S]*?\*\//g, "");

describe("过渡类名", () => {
  // 自检：正则或 glob 一旦失效，declared 会是空数组，下面那条断言就空转通过。
  // 这条钉死具体名字而不是「至少 N 个」：数量能被注释里的假命中凑出来。
  it("确实扫到了模板里的 <Transition>", () => {
    expect(declared.map(({ name }) => name).sort()).toEqual([
      "history-dropdown",
      "immersive",
      "playlist-body",
      "queue",
    ]);
  });

  it("每个 name 都有对应的 enter-active / leave-active 规则", () => {
    const missing = declared.flatMap(({ name, file }) =>
      ["enter-active", "leave-active"]
        .map((suffix) => `.${name}-${suffix}`)
        // 边界匹配：否则 .queue-enter-active-x 会把 .queue-enter-active 蒙混过去
        .filter((selector) => !new RegExp(`\\${selector}(?![\\w-])`).test(styles))
        .map((selector) => `${selector}（<Transition name="${name}"> 声明于 ${file}）`)
    );

    expect(missing).toEqual([]);
  });
});

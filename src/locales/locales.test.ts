import { describe, expect, it } from "vitest";
import zh from "./zh";
import en from "./en";

type Bundle = Record<string, unknown>;

/**
 * 取出所有 "命名空间.键" 叶子路径。
 * i18n 配置里 fallbackLocale 是 "zh"，en 缺失的键不会报错，
 * 而是静默回落到中文——只能靠测试发现。
 */
function leafKeys(bundle: Bundle, prefix = ""): string[] {
  return Object.entries(bundle).flatMap(([key, value]) =>
    value !== null && typeof value === "object"
      ? leafKeys(value as Bundle, `${prefix}${key}.`)
      : [`${prefix}${key}`]
  );
}

/** 取出插值占位符集合，用于发现「键在但占位符漏了」这类问题 */
function placeholders(value: string): string[] {
  return [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
}

function leafEntries(bundle: Bundle, prefix = ""): [string, string][] {
  return Object.entries(bundle).flatMap(([key, value]) =>
    value !== null && typeof value === "object"
      ? leafEntries(value as Bundle, `${prefix}${key}.`)
      : [[`${prefix}${key}`, String(value)] as [string, string]]
  );
}

describe("locales", () => {
  it("keeps zh and en key sets identical", () => {
    const zhKeys = new Set(leafKeys(zh as Bundle));
    const enKeys = new Set(leafKeys(en as Bundle));

    expect([...zhKeys].filter((k) => !enKeys.has(k))).toEqual([]);
    expect([...enKeys].filter((k) => !zhKeys.has(k))).toEqual([]);
  });

  it("keeps interpolation placeholders in sync", () => {
    const enMap = new Map(leafEntries(en as Bundle));
    const mismatched = leafEntries(zh as Bundle)
      .filter(([key, value]) => {
        const counterpart = enMap.get(key);
        if (counterpart === undefined) return false; // 键缺失由上一个用例负责
        return placeholders(value).join(",") !== placeholders(counterpart).join(",");
      })
      .map(([key]) => key);

    expect(mismatched).toEqual([]);
  });

  it("keeps every namespace flat (namespace.key, never deeper)", () => {
    // 顶层是命名空间，第二层必须是字符串叶子——出现嵌套对象即为结构违规。
    const nested = Object.entries(zh as Bundle).flatMap(([namespace, value]) =>
      value !== null && typeof value === "object"
        ? Object.entries(value as Bundle)
            .filter(([, leaf]) => typeof leaf === "object" && leaf !== null)
            .map(([key]) => `${namespace}.${key}`)
        : []
    );

    expect(nested).toEqual([]);
  });
});

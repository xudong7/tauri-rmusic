import { describe, expect, it } from "vitest";
import { trimRecordToLimit } from "./storage";

describe("trimRecordToLimit", () => {
  it("不超限时原样返回同一个对象", () => {
    const record = { a: 1, b: 2 };
    expect(trimRecordToLimit(record, 5)).toBe(record);
  });

  it("超限时保留最近插入的若干条", () => {
    expect(trimRecordToLimit({ a: 1, b: 2, c: 3 }, 2)).toEqual({ b: 2, c: 3 });
  });

  it("上限为 0 时返回空映射", () => {
    expect(trimRecordToLimit({ a: 1 }, 0)).toEqual({});
  });
});

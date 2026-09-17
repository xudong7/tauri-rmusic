import { describe, expect, it } from "vitest";
import { nextTick, ref } from "vue";
import { useRowSelection } from "./useRowSelection";

describe("useRowSelection", () => {
  it("toggles selection mode and clears selection when leaving", () => {
    const { selectionMode, selectedKeys, toggleSelectionMode, toggleSelectRow } =
      useRowSelection<string>({
        getSelectableKeys: () => ["a", "b"],
        getAvailableKeys: () => new Set(["a", "b"]),
      });

    toggleSelectRow("a");
    expect(selectedKeys.value.size).toBe(0);

    toggleSelectionMode();
    toggleSelectRow("a");
    expect(selectedKeys.value.has("a")).toBe(true);

    toggleSelectionMode();
    expect(selectionMode.value).toBe(false);
    expect(selectedKeys.value.size).toBe(0);
  });

  it("selects only the provided selectable keys", () => {
    const { toggleSelectionMode, selectedKeys, selectAll, deselectAll } =
      useRowSelection<number>({
        getSelectableKeys: () => [1, 3],
        getAvailableKeys: () => new Set([0, 1, 2, 3]),
      });

    toggleSelectionMode();
    selectAll();
    expect(Array.from(selectedKeys.value)).toEqual([1, 3]);

    deselectAll();
    expect(selectedKeys.value.size).toBe(0);
  });

  it("prunes selected keys that disappear from the source", async () => {
    const available = ref(new Set(["a", "b"]));
    const { toggleSelectionMode, selectedKeys, toggleSelectRow } =
      useRowSelection<string>({
        getSelectableKeys: () => Array.from(available.value),
        getAvailableKeys: () => available.value,
      });

    toggleSelectionMode();
    toggleSelectRow("a");
    toggleSelectRow("b");

    available.value = new Set(["b"]);
    await nextTick();
    expect(Array.from(selectedKeys.value)).toEqual(["b"]);
  });
});

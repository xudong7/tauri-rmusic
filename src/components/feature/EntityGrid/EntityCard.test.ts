import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import EntityCard from "./EntityCard.vue";
import CoverImage from "@/components/base/CoverImage/CoverImage.vue";
import type { EntityCardModel } from "./types";

function card(overrides: Partial<EntityCardModel> = {}): EntityCardModel {
  return {
    key: "e1",
    kind: "playlist",
    title: "My playlist",
    subtitle: "Creator",
    metaLabel: "10 songs",
    coverUrl: "https://example.com/c.jpg",
    ...overrides,
  };
}

describe("EntityCard", () => {
  it("maps the entity kind onto the cover variant", () => {
    const wrapper = mount(EntityCard, { props: { item: card({ kind: "album" }) } });
    expect(wrapper.findComponent(CoverImage).props("variant")).toBe("album");
  });

  it("uses a circular cover for artists", () => {
    const wrapper = mount(EntityCard, { props: { item: card({ kind: "artist" }) } });
    expect(wrapper.findComponent(CoverImage).props("radius")).toBe(999);
  });

  it("renders subtitle and meta when provided", () => {
    const wrapper = mount(EntityCard, { props: { item: card() } });
    expect(wrapper.find(".entity-card__subtitle").text()).toBe("Creator");
    expect(wrapper.find(".entity-card__meta").text()).toBe("10 songs");
  });

  it("omits the meta line when absent", () => {
    const item = card();
    delete item.metaLabel;
    const wrapper = mount(EntityCard, { props: { item } });
    expect(wrapper.find(".entity-card__meta").exists()).toBe(false);
  });

  it("renders the badge only when provided", () => {
    const wrapper = mount(EntityCard, { props: { item: card({ badge: "刚刚更新" }) } });
    expect(wrapper.find(".entity-card__badge").text()).toBe("刚刚更新");

    const plain = mount(EntityCard, { props: { item: card() } });
    expect(plain.find(".entity-card__badge").exists()).toBe(false);
  });

  it("does not emit activate while disabled", async () => {
    const wrapper = mount(EntityCard, { props: { item: card({ disabled: true }) } });
    await wrapper.trigger("click");
    expect(wrapper.emitted("activate")).toBeUndefined();
  });

  it("emits the whole model on activate", async () => {
    const wrapper = mount(EntityCard, { props: { item: card() } });
    await wrapper.trigger("click");
    expect((wrapper.emitted("activate")?.[0][0] as EntityCardModel).key).toBe("e1");
  });
});

import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import PageHeader from "./PageHeader.vue";

describe("PageHeader", () => {
  it("renders title, subtitle and actions in a stable structure", () => {
    const wrapper = mount(PageHeader, {
      props: { title: "Library", subtitle: "12 tracks" },
      slots: { actions: "<button>Action</button>" },
    });

    expect(wrapper.get("h1").text()).toBe("Library");
    expect(wrapper.get(".page-header__subtitle").text()).toBe("12 tracks");
    expect(wrapper.get(".page-header__actions").text()).toBe("Action");
  });
});

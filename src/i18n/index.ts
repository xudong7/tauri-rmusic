import { createI18n } from "vue-i18n";
import zh from "@/locales/zh";
import en from "@/locales/en";

export const SUPPORTED_LOCALES = ["zh", "en"] as const;
export type LocaleKey = (typeof SUPPORTED_LOCALES)[number];

const savedLocale = localStorage.getItem("locale") as LocaleKey | null;
const fallback: LocaleKey = "zh";
const initialLocale: LocaleKey =
  savedLocale && SUPPORTED_LOCALES.includes(savedLocale) ? savedLocale : fallback;

export const i18n = createI18n({
  legacy: false,
  locale: initialLocale,
  fallbackLocale: fallback,
  messages: {
    zh,
    en,
  },
});

export function setLocale(locale: LocaleKey) {
  i18n.global.locale.value = locale;
  localStorage.setItem("locale", locale);
}

export function getLocale(): LocaleKey {
  const v = i18n.global.locale.value;
  return (SUPPORTED_LOCALES.includes(v as LocaleKey) ? v : fallback) as LocaleKey;
}

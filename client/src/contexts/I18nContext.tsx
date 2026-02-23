import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { translations, type Locale } from "@/lib/i18n";

interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  formatCurrency: (amount: number, currency: "USD" | "TWD") => string;
  currencySymbol: (currency: "USD" | "TWD") => string;
}

const I18nContext = createContext<I18nContextType | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("stock-dashboard-locale");
      if (saved === "en" || saved === "zh-TW") return saved;
    }
    return "zh-TW";
  });

  const handleSetLocale = useCallback((newLocale: Locale) => {
    setLocale(newLocale);
    localStorage.setItem("stock-dashboard-locale", newLocale);
  }, []);

  const toggleLocale = useCallback(() => {
    handleSetLocale(locale === "zh-TW" ? "en" : "zh-TW");
  }, [locale, handleSetLocale]);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => {
      let text = translations[locale]?.[key] || translations["zh-TW"]?.[key] || key;
      if (params) {
        Object.entries(params).forEach(([k, v]) => {
          text = text.replace(`{${k}}`, String(v));
        });
      }
      return text;
    },
    [locale]
  );

  const formatCurrency = useCallback(
    (amount: number, currency: "USD" | "TWD") => {
      if (currency === "TWD") {
        return locale === "zh-TW"
          ? `NT$${amount.toLocaleString("zh-TW", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
          : `NT$${amount.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
      }
      return locale === "zh-TW"
        ? `$${amount.toLocaleString("zh-TW", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : `$${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    },
    [locale]
  );

  const currencySymbol = useCallback((currency: "USD" | "TWD") => {
    return currency === "TWD" ? "NT$" : "$";
  }, []);

  return (
    <I18nContext.Provider value={{ locale, setLocale: handleSetLocale, toggleLocale, t, formatCurrency, currencySymbol }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}

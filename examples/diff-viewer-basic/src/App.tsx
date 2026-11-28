import { LocaleType } from "@univerjs/core";
import { UnitComparisonViewer } from "@univerkit/diff-viewer";
import { useMemo, useState, type ReactElement } from "react";
import { createComparisonUniver } from "./create-comparison-univer";
import { createDemoSheetComparison } from "./demo-comparison";

function readInitialOptions(): {
  readonly chrome: boolean;
  readonly darkMode: boolean;
  readonly locale: LocaleType;
} {
  const params = new URLSearchParams(window.location.search);
  return {
    chrome: params.get("chrome") !== "0",
    darkMode: params.get("theme") === "dark",
    locale: params.get("lang") === "zh-CN" ? LocaleType.ZH_CN : LocaleType.EN_US,
  };
}

export function App(): ReactElement {
  const initial = useMemo(() => readInitialOptions(), []);
  const [locale, setLocale] = useState<LocaleType>(initial.locale);
  const [darkMode, setDarkMode] = useState<boolean>(initial.darkMode);
  const comparison = useMemo(() => createDemoSheetComparison(), []);

  return (
    <div
      className={
        darkMode
          ? "flex h-screen min-h-0 flex-col bg-[#0a0a0a] text-[#fafafa]"
          : "flex h-screen min-h-0 flex-col bg-[#ffffff] text-[#0a0a0a]"
      }
    >
      {initial.chrome ? (
        <header
          className={
            darkMode
              ? "flex h-12 shrink-0 items-center justify-between border-b border-[#2e2e2e] bg-[#171717] px-4 text-sm"
              : "flex h-12 shrink-0 items-center justify-between border-b border-[#e5e5e5] bg-[#ffffff] px-4 text-sm"
          }
        >
          <div className="flex items-center gap-2.5">
            <span className="font-semibold">@univerkit/diff-viewer</span>
            <span
              className={
                darkMode
                  ? "rounded-full bg-[#262626] px-2 py-0.5 text-xs text-[#a3a3a3]"
                  : "rounded-full bg-[#f5f5f5] px-2 py-0.5 text-xs text-[#737373]"
              }
            >
              Sheet Comparison Example
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              className={
                darkMode
                  ? "cursor-pointer rounded-md border border-[#2e2e2e] bg-[#262626] px-2.5 py-1 text-xs font-medium hover:bg-[#333333]"
                  : "cursor-pointer rounded-md border border-[#e5e5e5] bg-[#ffffff] px-2.5 py-1 text-xs font-medium hover:bg-[#f5f5f5]"
              }
              type="button"
              onClick={() =>
                setLocale((prev) =>
                  prev === LocaleType.EN_US ? LocaleType.ZH_CN : LocaleType.EN_US,
                )
              }
            >
              {locale === LocaleType.EN_US ? "中文" : "English"}
            </button>
            <button
              className={
                darkMode
                  ? "cursor-pointer rounded-md border border-[#2e2e2e] bg-[#262626] px-2.5 py-1 text-xs font-medium hover:bg-[#333333]"
                  : "cursor-pointer rounded-md border border-[#e5e5e5] bg-[#ffffff] px-2.5 py-1 text-xs font-medium hover:bg-[#f5f5f5]"
              }
              type="button"
              onClick={() => setDarkMode((prev) => !prev)}
            >
              {darkMode ? "Light" : "Dark"}
            </button>
          </div>
        </header>
      ) : null}
      <main className="flex min-h-0 flex-1 flex-col">
        <UnitComparisonViewer
          key={`${comparison.result.comparisonId}:${comparison.result.unit.unitId}`}
          comparison={comparison}
          createUniver={createComparisonUniver}
          locale={locale}
          darkMode={darkMode}
        />
      </main>
    </div>
  );
}

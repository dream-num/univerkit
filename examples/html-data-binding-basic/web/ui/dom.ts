export const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;

export const message = (reason: unknown) =>
  reason instanceof Error ? reason.message : String(reason);

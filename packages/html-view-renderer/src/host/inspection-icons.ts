// Static SVG versions of the icons used by univer-workspace: @univerjs/icons
// SheetsMultiIcon (1.38.0) and lucide-react Table2 (1.33.0). No React runtime needed.
// License notices: docs/third-party-notices.md.
const icons = {
  workbook: `<svg viewBox="0 0 16 16" fill="none"><path fill="#35BD4B" d="M3.4535 1.12549C2.7002 1.12549 2.08954 1.73615 2.08954 2.48945V13.5104C2.08954 14.2637 2.7002 14.8744 3.4535 14.8744H12.5465C13.2998 14.8744 13.9105 14.2637 13.9105 13.5104V5.0992L10.0091 1.12549H3.4535Z"/><path fill="#32A846" d="M10.0075 1.12549L13.9104 5.09842H10.6742C10.306 5.09842 10.0075 4.79994 10.0075 4.43175V1.12549Z"/><path fill="white" d="M4.7 7.05H11.1V12.05H4.7V7.05ZM5.5 7.85V9.2H7.35V7.85H5.5ZM8.15 7.85V9.2H10.3V7.85H8.15ZM5.5 10V11.25H7.35V10H5.5ZM8.15 10V11.25H10.3V10H8.15Z" fill-rule="evenodd" clip-rule="evenodd"/></svg>`,
  sheet: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18"/></svg>`,
};

export function createInspectionIcon(document: Document, kind: keyof typeof icons) {
  const icon = document.createElement("span");
  icon.className = `binding-${kind}-icon`;
  icon.setAttribute("aria-hidden", "true");
  icon.innerHTML = icons[kind];
  return icon;
}

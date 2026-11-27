export const viewStyle = `
:host{display:block;width:100%;height:100%;min-width:0;min-height:0;container-type:inline-size;color-scheme:light}
*{box-sizing:border-box}[hidden]{display:none!important}
.layout{width:100%;height:100%;position:relative;font:13px/1.5 system-ui,-apple-system,sans-serif;color:#253247}
.html-frame{display:block;width:100%;height:100%;border:0}
button{cursor:pointer;font:inherit;color:inherit;transition:background .15s,border-color .15s}
button:focus-visible{outline:2px solid #6366f1;outline-offset:3px}
button:disabled{opacity:.45;cursor:default}
.layout.binding-layout{display:grid;grid-template-columns:minmax(0,1fr) clamp(340px,32cqw,410px);grid-template-rows:minmax(0,1fr)}
.layout.binding-layout>.html-frame{grid-column:1;grid-row:1;min-width:0;min-height:0}
.binding-inspector{grid-column:2;grid-row:1;min-width:0;min-height:0;overflow:auto;overscroll-behavior:contain;border-left:1px solid #e4e8ef;background:#f8fafc;color:#253247}
.binding-heading{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:8px;padding:12px 14px;background:#fff;border-bottom:1px solid #e4e8ef}
.binding-count{flex:1;min-width:0;margin:0;text-align:right;font-size:12px;color:#64748b}
.binding-refresh{display:grid;place-items:center;flex:none;width:28px;height:28px;padding:0;border:1px solid transparent;border-radius:7px;background:transparent;color:#64748b;font-size:20px;line-height:1}
.binding-refresh:hover{background:#f1f5f9;border-color:#e2e8f0;color:#253247}
.binding-all{display:flex;flex:none;align-items:center;gap:7px;border:1px solid #dce3eb;border-radius:7px;padding:6px 9px;background:white;font-size:12px;font-weight:550}
.binding-all:hover{background:#f0fdfa;border-color:#99d8d1}
.binding-all[aria-pressed="true"]{background:#eaf9f5;border-color:#75c8ba;color:#0f766e}
.binding-all-icon{width:13px;height:11px;border:1.5px dashed #0d9488;border-radius:2px}
.binding-error{margin:12px 16px 0;padding:10px 12px;border:1px solid #fed7aa;border-radius:8px;background:#fff7ed;color:#9a3412;font-size:12px;overflow-wrap:anywhere}
.binding-cards{display:grid;gap:12px;padding:12px}
.binding-unit-card{border:1px solid #e2e8f0;border-radius:11px;background:white;overflow:hidden;box-shadow:0 2px 5px #0f172a04}
.binding-unit-heading{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #eef1f5;background:#fefefe}
.binding-unit-heading h3{margin:0;font-size:13px;line-height:1.45;font-weight:650;overflow-wrap:anywhere;min-width:0;color:#253247}
.binding-workbook-icon,.binding-sheet-icon{display:inline-flex;flex:none;align-items:center;justify-content:center}
.binding-workbook-icon{width:22px;height:22px}
.binding-workbook-icon svg,.binding-sheet-icon svg{display:block;width:100%;height:100%}
.binding-sheet{padding:12px}
.binding-sheet+.binding-sheet{border-top:1px solid #eef1f5}
.binding-sheet-heading{display:flex;gap:7px;align-items:center;margin-bottom:9px;min-width:0}
.binding-sheet-heading h4{margin:0;font-size:12px;font-weight:550;color:#506079;overflow-wrap:anywhere}
.binding-sheet-icon{width:16px;height:16px;color:#64748b}
.binding-column-heads,.binding-diagram{display:grid;grid-template-columns:minmax(0,1.25fr) 24px minmax(0,1fr)}
.binding-column-heads{margin-bottom:7px}
.binding-column-heads>:last-child{grid-column:3}
.binding-kind{font-size:10px;font-weight:550;color:#94a3b8;letter-spacing:.025em}
.binding-diagram{position:relative;grid-auto-rows:minmax(40px,auto);row-gap:6px}
.binding-inspector .binding-node{display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:2px;min-width:0;width:100%;align-self:center;position:relative;z-index:1;padding:8px 9px;border:1px solid #e4e9f0;border-radius:7px;background:#fff;text-align:left;font:500 12px/1.35 ui-monospace,SFMono-Regular,Consolas,monospace;overflow-wrap:anywhere}
.binding-node:hover{background:#f8fafc;border-color:#bcc6d5}
.binding-node small{font:10px/1.4 system-ui,sans-serif;color:#8b97a8}
.binding-node[data-related="true"]{border-color:#c7d2fe;background:#f5f6ff}
.binding-inspector .binding-node[aria-pressed="true"]{border-color:#818cf8;background:#eef2ff;color:#4338ca;box-shadow:0 0 0 1px #a5b4fc40}
.binding-node[aria-pressed="true"] small{color:#7771bc}
.binding-node .binding-issue{color:#b45309}
.binding-edges{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.binding-edges path{fill:none;stroke:#dce3ed;stroke-width:1.5}
.binding-edges path.related{stroke:#c7d2fe}
.binding-edges path.selected{stroke:#818cf8;stroke-width:2}
.binding-invalid>h3{margin:0;color:#92400e;font-size:13px}
.binding-invalid .binding-node{width:calc(100% - 24px);margin:10px 12px}
.binding-empty{margin:0;padding:26px 18px;border:1px dashed #d8e0eb;border-radius:10px;background:#fff;text-align:center;font-size:12px;color:#7c899d}
@container(max-width:760px){
 .layout.binding-layout{grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,1fr) minmax(0,1fr)}
 .layout.binding-layout>.binding-inspector{grid-column:1;grid-row:2;border-left:0;border-top:1px solid #e4e8ef}
 .binding-cards{padding:12px;gap:10px}
}
@media(prefers-reduced-motion:reduce){button{transition:none}}
`;

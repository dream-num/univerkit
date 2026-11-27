import { LocaleType, type IWorkbookData } from "@univerjs/core";

export function createSheetData(id: string, name: string): IWorkbookData {
  return {
    id,
    name,
    rev: 1,
    appVersion: "",
    locale: LocaleType.EN_US,
    sheetOrder: ["sheet-1"],
    styles: {},
    resources: [],
    sheets: {
      "sheet-1": {
        id: "sheet-1",
        name: "Budget",
        rowCount: 100,
        columnCount: 26,
        columnData: { 0: { w: 180 }, 1: { w: 150 } },
        cellData: {
          0: { 0: { v: "Team budget" } },
          2: { 0: { v: "Income" }, 1: { v: 120000, t: 2 } },
          3: { 0: { v: "Expenses" }, 1: { v: 80000, t: 2 } },
          4: { 0: { v: "Balance" }, 1: { f: "=B3-B4", v: 40000, t: 2 } },
        },
      },
    },
  };
}

export function createHtmlSource(unitId: string): string {
  const ref = `${encodeURIComponent(unitId)}:sheet-1`;
  const jsonId = JSON.stringify(unitId).replaceAll("<", "\\u003c");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Team budget</title>
<style>
*{box-sizing:border-box}body{margin:0;padding:40px;font:15px/1.6 system-ui;background:#f6f8fc;color:#142539}
main{max-width:900px;margin:auto}.eyebrow{font-size:12px;letter-spacing:.12em;color:#477768;text-transform:uppercase}h1{font-size:36px;letter-spacing:-.04em;margin:8px 0}p{color:#64748b}
.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin:30px 0}.card,section{background:white;border:1px solid #e0e7ef;border-radius:14px;padding:24px}.card span{display:block;color:#64748b}.card strong{font-size:30px}.card:last-child{background:#e7f4ee}
label{display:block;margin:18px 0 6px}input{font:inherit;max-width:100%;padding:9px;border:1px solid #ccd6e0;border-radius:6px}input[type=range]{width:100%;padding:0}#chart{display:block;width:100%;max-width:560px;margin:24px auto 0;overflow:visible}#chart text{font:14px system-ui;fill:#64748b}.chart-value{font-weight:600!important;fill:#142539!important}#message{color:#b42318}section+section{margin-top:18px}@media(max-width:640px){body{padding:20px}.cards{grid-template-columns:1fr}.card strong{font-size:26px}}
</style></head><body><main>
<div class="eyebrow">Univer Data Binding / Live example</div><h1>Team budget</h1>
<p>Open the Sheet in another tab. Values and formula results stay in sync.</p>
<div class="cards">
<div class="card"><span>Income · B3</span><strong data-univer-cell-text="${ref}:B3">Loading…</strong></div>
<div class="card"><span>Expenses · B4</span><strong data-univer-cell-text="${ref}:B4">Loading…</strong></div>
<div class="card"><span>Balance · B5</span><strong data-univer-cell-text="${ref}:B5">Loading…</strong></div>
</div>
<section><h2>HTML attribute bindings</h2>
<label for="income">Income</label><input id="income" type="number" min="0" step="1000" data-univer-cell-model="${ref}:B3">
<label for="expenses">Expenses</label><input id="expenses" type="range" min="0" max="200000" step="1000" data-univer-cell-model="${ref}:B4">
<p>The balance is calculated by the Sheet formula <code>=B3-B4</code>.</p></section>
<section><h2>JavaScript interface</h2>
<p>A simple chart subscribes to Income and Expenses. Edit the controls above or the Sheet to update the bars.</p>
<svg id="chart" data-univer-range-subscribe="${ref}:B3:B4" viewBox="0 0 560 280" role="img" aria-label="Income and expenses chart">
<line id="chart-baseline" x1="40" x2="520" stroke="#ccd6e0" />
<rect id="chart-income" x="110" width="100" rx="5" fill="#39856a" />
<rect id="chart-expenses" x="350" width="100" rx="5" fill="#8c79c7" />
<text id="chart-income-value" class="chart-value" x="160" text-anchor="middle">Loading…</text>
<text id="chart-expenses-value" class="chart-value" x="400" text-anchor="middle">Loading…</text>
<text x="160" y="270" text-anchor="middle">Income</text>
<text x="400" y="270" text-anchor="middle">Expenses</text>
</svg><div id="message" role="alert"></div></section>
</main><script>
const binding = window.univerBinding;
const cells = [{ name: 'income', row: 2 }, { name: 'expenses', row: 3 }];
const values = [null, null];
const chart = document.querySelector('#chart');
const message = document.querySelector('#message');
function drawChart() {
  const min = Math.min(0, ...values);
  const max = Math.max(1, ...values);
  const y = value => 230 - (value - min) / (max - min) * 190;
  const baseline = y(0);
  chart.querySelector('#chart-baseline').setAttribute('y1', baseline);
  chart.querySelector('#chart-baseline').setAttribute('y2', baseline);
  cells.forEach((cell, index) => {
    const value = values[index];
    const bar = chart.querySelector('#chart-' + cell.name);
    bar.setAttribute('y', Math.min(y(value), baseline));
    bar.setAttribute('height', value === null ? 0 : Math.abs(y(value) - baseline));
    const label = chart.querySelector('#chart-' + cell.name + '-value');
    label.setAttribute('y', value < 0 ? y(value) + 18 : y(value) - 10);
    label.textContent = value === null ? '—' : value.toLocaleString();
  });
}
binding.subscribeRangeById('chart', ({ value }) => {
  cells.forEach((cell, index) => {
    const amount = value[index][0];
    values[index] = typeof amount === 'number' && Number.isFinite(amount) ? amount : null;
  });
  drawChart();
}).catch(error => { message.textContent = error.message; });
</script></body></html>`;
}

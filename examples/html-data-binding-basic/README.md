# HTML data binding example

English | [简体中文](./README.zh-CN.md)

An example application built from the three HTML data binding packages and the Univer Collaboration
SDK. It manages collaborative Sheets and `.univer.html` pages, and shows two-way sync between HTML
pages and Sheets, binding inspection, spreadsheet import, and AI-generated pages. The example uses
one fixed guest identity, with no login or permissions.

## Start

From the repository root, run:

```bash
pnpm install
pnpm build
pnpm --filter @univerkit/example-html-data-binding-basic start
```

Open <http://127.0.0.1:3030/>. Click **Open in new tab** to open the current file in another tab, or
open a Sheet and an HTML page that references it side by side.

The first start creates the files below. Later starts keep existing files and edits; changes to the
template code affect only new files.

| Sheet                        | HTML pages                         |
| ---------------------------- | ---------------------------------- |
| Team budget                  | Team budget.univer.html            |
| 区域销售分析                 | 区域销售驾驶舱.univer.html         |
| Univer 开发者沙龙 · 活动管理 | 活动报名, 现场签到台, 活动实时大屏 |

## Walkthrough

1. Open **Team budget.univer.html** and change Income or Expenses.
2. Open **Team budget** in another tab and watch B3/B4 and the B5 formula result update.
3. Edit B3/B4 in the Sheet; the HTML controls, balance, and JavaScript bar chart follow.
4. Create or import another Sheet, select it, and click **Generate HTML** at the top right to
   generate an HTML page from it.
5. Preview and save the generated page, or click **HTML source** to edit and save an existing page.
6. Restart the server and open the files again to check that the data persisted.

The template declares the income and expense range B3:B4 on the chart element with
`data-univer-range-subscribe`, receives updates through
`window.univerBinding.subscribeRangeById("chart", callback)`, and redraws the SVG bar chart with
plain JavaScript.

HTML source is saved as an ordinary file, not a collaborative Unit; the Sheet data a page references
syncs through collaboration. After editing the source, save or discard it before switching files.

## Import spreadsheets

Click **Import spreadsheet** to import an XLS, XLSX, CSV, or TSV file of up to 25 MiB. The page
uploads the file to the File Endpoint, starts an Exchange import task, and polls it. When it
finishes, the new Sheet appears in the file list and opens, named after the file without its
extension.

## Binding inspection

Click **Bindings** to open the inspection sidebar. The SDK provides the sidebar, highlights, and
popovers; the application supplies only names. The Sheet name comes from `GET /api/files/:id`, and
sheet names come directly from the Binding Engine the page has loaded (`getSheets()`). The wiring is
in [web/views/html.ts](web/views/html.ts); see
[built-in inspector and interface boundaries](../../packages/html-view/docs/binding-inspection.md)
for the API.

The inspector is in English by default. Open `/?file=demo-budget-view&lang=zh-CN` for the Chinese
sidebar and popovers. The example passes the query parameter to `renderHtmlView({ locale })`; the
template content and application navigation are unaffected.

## AI-generated pages

Select a Sheet, click **Generate HTML**, and describe the page you want. The AI reads the Sheet's
latest data and generates an HTML draft to preview before you save it. Before first use, enter a
DeepSeek API Key in **AI settings**; the server stores it in `.env`. The server reads Sheets through
one shared snapshot materializer: the first read starts its runtime, and later reads take
milliseconds.

## Code layout

```text
server/main.ts            Server composition: storage, collaboration / File / Exchange Services, Endpoints, HTTP, lifecycle
server/file-catalog.ts    File list: Sheets from Unit metadata, HTML pages in the application's own table
server/file-routes.ts     File list, creation, and HTML source APIs
server/ai-routes.ts       AI settings and page generation APIs
server/workbook-reader.ts Reads the latest Sheet data on the server
server/demo-files.ts      Seeded files
server/*template.ts       Seeded Sheet data and HTML templates
web/main.ts               Page state, file switching, source editing, and view modes
web/api/                  File APIs and spreadsheet import
web/views/                Collaborative Sheet editor and HTML pages
web/ui/                   Create, import, and share UI
web/ai/                   AI generation and settings UI
```

Collaboration data, uploaded file records, and HTML pages share `.data/collaboration.sqlite`: Sheet
names live in Unit metadata, and HTML pages in the application's own `html_views` table. Uploaded file
contents are stored in `.data/files/`. When you stop the server (Ctrl+C), it releases the Endpoints,
Services, and storage in dependency order.

## Configuration

To customize, copy `.env.example` to `.env` in this directory.

| Variable            | Default                    | Purpose                                                         |
| ------------------- | -------------------------- | --------------------------------------------------------------- |
| `HOST`              | `127.0.0.1`                | Listening address                                               |
| `PORT`              | `3030`                     | HTTP and WebSocket port                                         |
| `DATA_DIR`          | `.data`                    | Where data files are stored                                     |
| `UNIVER_LICENSE`    | empty                      | Optional Univer license; rebuild the frontend after changing it |
| `DEEPSEEK_API_KEY`  | empty                      | API Key for AI generation; can also be set in AI settings       |
| `DEEPSEEK_MODEL`    | `deepseek-flash`           | Model for AI generation                                         |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` | AI API address                                                  |

One server provides the frontend, HTTP APIs, and WebSocket. During development, Vite proxies `/api`
and `/universer-api` to port 3030.

## Page lifecycle

The Sheet editor and HTML pages run in separate pages. Univer UI Facade extensions apply to the
whole JavaScript realm, so file navigation keeps the UI editor and the Headless Engine apart.

When you switch files, HTML control drafts are submitted and acknowledged by collaboration before
the page is left; if saving fails, the current page stays. When you close or refresh the browser
with unsaved changes, the browser's leave prompt appears.

The example's styles apply only to the file list and outer toolbar; the Sheet uses the Univer SDK's
default styles.

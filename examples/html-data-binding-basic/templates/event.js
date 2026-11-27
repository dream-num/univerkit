/* A complete, dependency-free view. Counts come from the Sheet's formulas.
   This demo uses fixed rows 2–81 and one registration writer at a time. */
(() => {
  const binding = window.univerBinding;
  const view = document.body.dataset.view;
  const $ = (id) => document.getElementById(id);
  const range = (sheetId, startRow, endRow, endColumn) => ({
    unitId: EVENT_UNIT,
    sheetId,
    range: { startRow, endRow, startColumn: 0, endColumn },
  });
  const rosterRef = range("attendees", 1, 80, 6);
  let records = [],
    sessionsReady = false,
    filter = "all";
  let busy = false,
    pendingRegistration = null,
    previousArrivals = null;
  const busyRows = new Set();
  const pendingCheckins = new Map();
  const subscriptions = [];
  const number = (value) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
  const text = (id, value) => {
    if ($(id)) $(id).textContent = String(value);
  };
  const message = (value = "", error = false) => {
    text("message", value);
    $("message").dataset.error = String(error);
  };
  const cell = (row, col) => ({ unitId: EVENT_UNIT, sheetId: "attendees", row, col });
  const write = (row, col, value) => binding.setCellValue(cell(row, col), value);
  const time = (value) => {
    const date = new Date(String(value));
    return Number.isNaN(date.getTime())
      ? "时间未记录"
      : date.toLocaleTimeString("zh-CN", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Asia/Shanghai",
        });
  };
  const maskedName = (name) => [...String(name || "")].slice(0, 1).join("") + "**";
  const isChecked = (record) => record.values[5] === "已签到";
  const roster = (values) =>
    values.map((row, i) => ({ row: i + 1, values: row })).filter((record) => record.values[0]);
  const el = (tag, className, content) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  };
  const percent = (value) => `${Math.round(number(value) * 100)}%`;
  const updateNumber = (id, value) => {
    const target = $(id);
    if (!target || target.textContent === String(value)) return;
    target.textContent = String(value);
    target.classList.remove("count-pulse");
    void target.offsetWidth;
    target.classList.add("count-pulse");
  };
  const updateForm = () => {
    if (!$("submit-registration")) return;
    $("submit-registration").disabled = busy || !sessionsReady;
  };

  async function register(event) {
    event.preventDefault();
    if (busy || !sessionsReady) return;
    if (!$("registration-form").reportValidity()) return;
    const name = $("name").value.trim(),
      company = $("company").value.trim(),
      session = $("session").value;
    if (!name || !company || !session) {
      message("请填写姓名、公司 / 团队，并选择参会场次。", true);
      return;
    }
    busy = true;
    updateForm();
    message("正在保存报名信息…");
    try {
      // Re-read before allocating. Application-level concurrent registration needs a
      // server-side allocator; collaboration cell writes alone are not a transaction.
      const [{ value: rows }, { value: capacity }] = await Promise.all([
        binding.getRangeState(rosterRef),
        binding.getCellState({ unitId: EVENT_UNIT, sheetId: "settings", row: 4, col: 1 }),
      ]);
      const registrationLimit = Math.max(0, Math.min(80, Math.floor(number(capacity))));
      const current = roster(rows);
      const existing = current.find(
        (record) =>
          record.values[1] === name && record.values[2] === company && record.values[3] === session,
      );
      let ticket;
      if (existing) {
        ticket = existing.values[0];
      } else {
        if (current.length >= registrationLimit)
          throw new Error("本场活动报名已满，期待下次相聚。");
        if (!pendingRegistration) {
          // Do not reuse a partially written row after a failed or interrupted submission.
          const index = rows.findIndex((row) =>
            row.every((value) => value === null || value === ""),
          );
          if (index < 0) throw new Error("报名名额已满，暂时无法继续报名。");
          const usedIds = new Set(current.map((record) => String(record.values[0])));
          let suffix = index + 1;
          while (usedIds.has(`U-${String(suffix).padStart(3, "0")}`)) suffix++;
          pendingRegistration = {
            row: index + 1,
            id: `U-${String(suffix).padStart(3, "0")}`,
            fields: [name, company, session, new Date().toISOString()],
          };
        }
        const pending = pendingRegistration;
        const occupant = rows[pending.row - 1][0];
        if (occupant && occupant !== pending.id) {
          pendingRegistration = null;
          throw new Error("这个名额刚刚被占用，请重新提交报名。");
        }
        if (!occupant) {
          // Publish the ID last, so other views do not display an incomplete attendee.
          await Promise.all([
            ...pending.fields.map((value, i) => write(pending.row, i + 1, value)),
            write(pending.row, 5, "未签到"),
            write(pending.row, 6, ""),
          ]);
          await write(pending.row, 0, pending.id);
        }
        ticket = pending.id;
      }
      await binding.flush();
      text("ticket-id", ticket);
      text(
        "success-name",
        `${pendingRegistration?.fields[0] || name}，已为你保留 ${pendingRegistration?.fields[2] || session} 的位置。`,
      );
      $("registration-form").hidden = true;
      $("registration-success").hidden = false;
      $("registration-success").focus();
      pendingRegistration = null;
      message(existing ? "已找到这份报名记录，沿用原报名编号。" : "报名信息已保存。");
    } catch (error) {
      message(`报名未确认：${error.message} 请重试；重试会沿用本次报名信息。`, true);
    } finally {
      busy = false;
      updateForm();
    }
  }

  async function checkin(record, undo) {
    if (busyRows.has(record.row)) return;
    const pending = pendingCheckins.get(record.row) || {
      undo,
      timestamp: undo ? "" : new Date().toISOString(),
    };
    undo = pending.undo;
    pendingCheckins.set(record.row, pending);
    busyRows.add(record.row);
    renderAttendees();
    message(undo ? "正在撤销签到…" : "正在保存签到…");
    try {
      const { value: rows } = await binding.getRangeState(
        range("attendees", record.row, record.row, 6),
      );
      const current = rows[0];
      if (current[0] !== record.values[0]) throw new Error("这条报名记录已发生变化，请重新搜索。");
      const desired = undo ? "未签到" : "已签到";
      if (current[5] !== desired) {
        // Keep the original attempted timestamp when retrying an unconfirmed write.
        await write(record.row, 6, pending.timestamp);
        await write(record.row, 5, desired);
      }
      await binding.flush();
      pendingCheckins.delete(record.row);
      message(undo ? `已撤销 ${current[1]} 的签到。` : `${current[1]} 签到成功，欢迎来到现场！`);
    } catch (error) {
      message(`操作未确认：${error.message} 请检查连接后重试。`, true);
    } finally {
      busyRows.delete(record.row);
      renderAttendees();
    }
  }

  function renderAttendees() {
    if (!$("attendee-list")) return;
    const query = $("search").value.trim().toLocaleLowerCase();
    const visible = records.filter(
      (record) =>
        (filter === "all" || (filter === "checked" ? isChecked(record) : !isChecked(record))) &&
        record.values.slice(0, 3).some((value) =>
          String(value || "")
            .toLocaleLowerCase()
            .includes(query),
        ),
    );
    text("result-count", `${visible.length} 位参会者`);
    const fragment = document.createDocumentFragment();
    for (const record of visible) {
      const [id, name, company, session, , , timestamp] = record.values;
      const item = el("article", "attendee");
      item.dataset.ticket = String(id);
      item.append(el("div", "avatar", [...String(name || "?")][0]));
      const info = el("div", "person-info");
      const title = el("div", "person-name", String(name || "未填写姓名"));
      title.append(el("span", "", String(id)));
      info.append(title, el("div", "person-company", String(company || "")));
      item.append(info, el("span", "session-tag", String(session || "")));
      const actions = el("div", "attendee-actions");
      const checked = isChecked(record);
      const pending = pendingCheckins.get(record.row);
      if (checked) {
        const label = el("div", "checked-label", "✓ 已签到");
        label.append(el("small", "", time(timestamp)));
        actions.append(label);
      }
      const button = el(
        "button",
        checked ? "undo-button" : "primary checkin-button",
        busyRows.has(record.row) ? "保存中…" : pending ? "重试保存" : checked ? "撤销" : "签到 ↗",
      );
      button.type = "button";
      button.setAttribute(
        "aria-label",
        `${pending ? "重试保存" : checked ? "撤销签到" : "签到"} ${name} ${id}`,
      );
      button.disabled = busyRows.has(record.row);
      button.addEventListener(
        "click",
        () => void checkin(record, pending ? pending.undo : checked),
      );
      actions.append(button);
      item.append(actions);
      fragment.append(item);
    }
    if (!visible.length)
      fragment.append(
        el(
          "div",
          "empty-state",
          query ? "没有找到匹配的参会者，试试姓名或报名编号。" : "这里暂时没有参会者。",
        ),
      );
    $("attendee-list").replaceChildren(fragment);
  }

  function renderWelcome(values) {
    const checked = roster(values).filter(isChecked);
    const currentIds = new Set(checked.map((record) => record.values[0]));
    const newArrival =
      previousArrivals && checked.find((record) => !previousArrivals.has(record.values[0]));
    previousArrivals = currentIds;
    if (newArrival) {
      text("welcome-text", `欢迎 ${maskedName(newArrival.values[1])}，很高兴在这里遇见你。`);
      $("welcome").classList.remove("flash");
      void $("welcome").offsetWidth;
      $("welcome").classList.add("flash");
    }
  }

  function renderArrivals(values) {
    const checked = roster(values).filter(isChecked);
    const sorted = checked
      .slice()
      .sort((a, b) => {
        const date = (value) => {
          const timestamp = Date.parse(String(value));
          return Number.isNaN(timestamp) ? 0 : timestamp;
        };
        return date(b.values[6]) - date(a.values[6]) || b.row - a.row;
      })
      .slice(0, 4);
    const fragment = document.createDocumentFragment();
    for (const record of sorted) {
      const item = el("article", "arrival-card");
      item.append(el("span", "avatar", [...String(record.values[1] || "?")][0]));
      const info = el("div");
      info.append(
        el("strong", "", maskedName(record.values[1])),
        el("small", "", String(record.values[3] || "")),
      );
      item.append(info, el("time", "", time(record.values[6])));
      fragment.append(item);
    }
    if (!sorted.length) fragment.append(el("div", "empty-state", "期待第一位伙伴抵达。"));
    $("recent-arrivals").replaceChildren(fragment);
  }

  function renderSessions(values) {
    const fragment = document.createDocumentFragment();
    values.forEach(([name, total, checked]) => {
      const row = el("div", "session-row");
      const label = el("div", "session-label");
      label.append(
        el("span", "", String(name || "")),
        el("small", "", `${number(checked)} / ${number(total)} 人`),
      );
      const bar = el("div", "session-bar");
      const fill = el("div");
      fill.style.width = `${total ? Math.max(0, Math.min(100, (number(checked) / number(total)) * 100)) : 0}%`;
      bar.append(fill);
      row.append(label, bar);
      fragment.append(row);
    });
    $("session-progress").replaceChildren(fragment);
  }

  $("registration-form")?.addEventListener("submit", register);
  // The iframe deliberately disallows native form navigation. Submit through
  // the binding API from an explicit button, while retaining form validation.
  $("submit-registration")?.addEventListener("click", register);
  $("registration-form")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.target.tagName === "INPUT") {
      event.preventDefault();
      $("submit-registration").click();
    }
  });
  $("register-another")?.addEventListener("click", () => {
    $("registration-form").reset();
    $("registration-form").hidden = false;
    $("registration-success").hidden = true;
    message();
    $("name").focus();
  });
  $("search")?.addEventListener("input", renderAttendees);
  document.querySelectorAll("[data-filter]").forEach((button) =>
    button.addEventListener("click", () => {
      filter = button.dataset.filter;
      document
        .querySelectorAll("[data-filter]")
        .forEach((tab) => tab.setAttribute("aria-pressed", String(tab === button)));
      renderAttendees();
    }),
  );
  async function connect() {
    try {
      if (view === "register") {
        subscriptions.push(
          await binding.subscribeRangeById("session", ({ value }) => {
            const previous = $("session").value;
            $("session").replaceChildren(
              ...value
                .filter(([name]) => name)
                .map(([name]) => new Option(String(name), String(name))),
            );
            if ([...$("session").options].some((option) => option.value === previous))
              $("session").value = previous;
            sessionsReady = true;
            updateForm();
          }),
        );
      }
      if (view === "checkin") {
        subscriptions.push(
          await binding.subscribeRangeById("attendee-list", ({ value }) => {
            records = roster(value);
            renderAttendees();
          }),
        );
      }
      if ($("rate")) {
        subscriptions.push(
          await binding.subscribeCellById("rate", ({ value }) =>
            updateNumber("rate", percent(value)),
          ),
        );
      }
      if (view === "screen") {
        subscriptions.push(
          await binding.subscribeCellById("overall-progress", ({ value }) => {
            $("overall-progress").style.width =
              `${Math.max(0, Math.min(100, number(value) * 100))}%`;
          }),
        );
        subscriptions.push(
          await binding.subscribeRangeById("session-progress", ({ value }) =>
            renderSessions(value),
          ),
        );
        subscriptions.push(
          await binding.subscribeRangeById("welcome", ({ value }) => renderWelcome(value)),
        );
        subscriptions.push(
          await binding.subscribeRangeById("recent-arrivals", ({ value }) => renderArrivals(value)),
        );
      }
      subscriptions.push(
        await binding.subscribeCollaborationStatus(EVENT_UNIT, (status) => {
          const labels = {
            synced: "实时数据已连接",
            offline: "已离线 · 等待重连",
            conflict: "同步冲突 · 请刷新",
            not_collab: "尚未连接协同",
          };
          text("connection", labels[status] || "正在同步…");
          $("connection").dataset.state = status === "synced" ? "synced" : "pending";
        }),
      );
    } catch (error) {
      text("connection", "连接失败");
      $("connection").dataset.state = "pending";
      message(`无法加载活动数据：${error.message} 请刷新页面重试。`, true);
    }
  }
  window.addEventListener(
    "pagehide",
    () => subscriptions.forEach((subscription) => subscription.dispose()),
    { once: true },
  );
  void connect();
})();

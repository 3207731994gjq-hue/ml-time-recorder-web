(function () {
  "use strict";

  var Logic = window.MLRecorderLogic;
  var STORAGE_KEY = "ml-time-recorder.web.v1";
  var LAST_AMOUNT_KEY = "ml-time-recorder.web.lastAmount";
  var records = [];
  var currentRange = "last7";
  var confirmAction = null;
  var toastTimer = null;

  function byId(id) {
    return document.getElementById(id);
  }

  function each(nodes, callback) {
    var i;
    for (i = 0; i < nodes.length; i += 1) {
      callback(nodes[i], i);
    }
  }

  function safeGet(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function safeSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch (error) {
      showToast("保存失败，请检查 Safari 可用空间或隐私设置。", true);
      return false;
    }
  }

  function loadRecords() {
    var raw = safeGet(STORAGE_KEY);
    var decoded;
    var input;
    var cleaned = [];
    var seenIds = {};
    var i;
    var record;
    if (!raw) {
      records = [];
      return;
    }
    try {
      decoded = JSON.parse(raw);
      input = Object.prototype.toString.call(decoded) === "[object Array]" ? decoded : decoded.records;
      if (Object.prototype.toString.call(input) !== "[object Array]") {
        records = [];
        return;
      }
      for (i = 0; i < input.length; i += 1) {
        record = Logic.coerceRecord(input[i]);
        if (record && !seenIds[record.id]) {
          cleaned.push(record);
          seenIds[record.id] = true;
        }
      }
      records = cleaned;
      sortRecords();
    } catch (error) {
      records = [];
      showToast("本机旧数据无法读取，请从 JSON 备份恢复。", true);
    }
  }

  function persistRecords() {
    var envelope = {
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      records: records
    };
    return safeSet(STORAGE_KEY, JSON.stringify(envelope));
  }

  function sortRecords() {
    records.sort(function (first, second) {
      return Logic.parseRecordDate(second).getTime() - Logic.parseRecordDate(first).getTime();
    });
  }

  function getLastAmount() {
    var value = Number(safeGet(LAST_AMOUNT_KEY));
    return Logic.isValidAmount(value) ? value : 120;
  }

  function setLastAmount(value) {
    safeSet(LAST_AMOUNT_KEY, String(Logic.normalizeAmount(value)));
  }

  function pad(value) {
    return value < 10 ? "0" + value : String(value);
  }

  function displayDate(date) {
    var weekdays = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
    return date.getFullYear() + "年" + (date.getMonth() + 1) + "月" + date.getDate() + "日 " + weekdays[date.getDay()];
  }

  function displayRangeDate(date) {
    return date.getFullYear() + "/" + pad(date.getMonth() + 1) + "/" + pad(date.getDate());
  }

  function exactClock(date) {
    return pad(date.getHours()) + ":" + pad(date.getMinutes()) + ":" + pad(date.getSeconds());
  }

  function updateClock() {
    var now = new Date();
    byId("liveClock").textContent = exactClock(now);
    byId("liveDate").textContent = displayDate(now);
    byId("quickTime").textContent = "确认后记录：" + Logic.exactDateTime(now);
  }

  function showToast(message, isError) {
    var toast = byId("toast");
    if (!toast) {
      return;
    }
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.className = "toast is-visible" + (isError ? " is-error" : "");
    toastTimer = window.setTimeout(function () {
      toast.className = "toast";
    }, 3200);
  }

  function emptyState(title, detail) {
    var box = document.createElement("div");
    var strong = document.createElement("strong");
    var paragraph = document.createElement("p");
    box.className = "empty-state";
    strong.textContent = title;
    paragraph.textContent = detail;
    box.appendChild(strong);
    box.appendChild(paragraph);
    return box;
  }

  function recordRow(record) {
    var row = document.createElement("article");
    var badge = document.createElement("div");
    var main = document.createElement("div");
    var amount = document.createElement("strong");
    var detail = document.createElement("span");
    var actions = document.createElement("div");
    var edit = document.createElement("button");
    var remove = document.createElement("button");
    var date = Logic.parseRecordDate(record);

    row.className = "record-row";
    row.setAttribute("data-id", record.id);
    badge.className = "record-badge";
    badge.textContent = pad(date.getDate());
    main.className = "record-main";
    amount.textContent = record.amountMl + " ml";
    detail.textContent = Logic.exactDateTime(date) + " · " + record.source;
    main.appendChild(amount);
    main.appendChild(detail);
    actions.className = "record-actions";
    edit.type = "button";
    edit.setAttribute("data-action", "edit");
    edit.textContent = "编辑";
    remove.type = "button";
    remove.className = "delete-record";
    remove.setAttribute("data-action", "delete");
    remove.textContent = "删除";
    actions.appendChild(edit);
    actions.appendChild(remove);
    row.appendChild(badge);
    row.appendChild(main);
    row.appendChild(actions);
    return row;
  }

  function renderRecordList(container, values, emptyTitle, emptyDetail) {
    var i;
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    if (!values.length) {
      container.appendChild(emptyState(emptyTitle, emptyDetail));
      return;
    }
    for (i = 0; i < values.length; i += 1) {
      container.appendChild(recordRow(values[i]));
    }
  }

  function searchRecords() {
    var term = String(byId("recordSearch").value || "").toLowerCase().replace(/^\s+|\s+$/g, "");
    var filtered;
    if (!term) {
      return records.slice(0);
    }
    filtered = records.filter(function (record) {
      var date = Logic.parseRecordDate(record);
      var text = Logic.exactDateTime(date) + " " + record.amountMl + " ml " + record.source;
      return text.toLowerCase().indexOf(term) !== -1;
    });
    return filtered;
  }

  function renderHome() {
    var now = new Date();
    var start = Logic.startOfDay(now);
    var end = Logic.addDays(start, 1);
    var todayStats = Logic.calculateStatistics(records, { start: start, end: end, dayCount: 1 });
    var recent = records.slice(0, 5);
    byId("todayCount").textContent = String(todayStats.count);
    byId("todayTotal").textContent = String(todayStats.totalMl);
    byId("latestHint").textContent = recent.length ? "最近 " + recent.length + " 条，时间准确到秒" : "还没有记录";
    renderRecordList(byId("recentList"), recent, "还没有记录", "点击“立即记录毫升”保存当前时间。 ");
  }

  function renderRecords() {
    var filtered = searchRecords();
    var hasSearch = String(byId("recordSearch").value || "").replace(/^\s+|\s+$/g, "").length > 0;
    byId("recordCountHint").textContent = hasSearch ? "找到 " + filtered.length + " 条，共 " + records.length + " 条" : "共 " + records.length + " 条";
    renderRecordList(byId("recordsList"), filtered, hasSearch ? "没有匹配记录" : "还没有记录", hasSearch ? "换一个日期或毫升数试试。" : "可点击右上角补记以前的时间。 ");
  }

  function formatAverageAmount(value) {
    var rounded;
    if (value === null || typeof value === "undefined") {
      return "—";
    }
    rounded = Math.round(value * 10) / 10;
    return (Math.floor(rounded) === rounded ? rounded.toFixed(0) : rounded.toFixed(1)) + " ml";
  }

  function renderChart(values) {
    var container = byId("dailyChart");
    var max = 0;
    var i;
    var column;
    var value;
    var wrap;
    var bar;
    var label;
    var percent;
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    if (!values.length) {
      container.appendChild(emptyState("暂无图表数据", "记录后会显示每天的毫升总数。"));
      return;
    }
    for (i = 0; i < values.length; i += 1) {
      max = Math.max(max, values[i].totalMl);
    }
    for (i = 0; i < values.length; i += 1) {
      column = document.createElement("div");
      value = document.createElement("span");
      wrap = document.createElement("div");
      bar = document.createElement("div");
      label = document.createElement("span");
      column.className = "chart-column";
      column.title = Logic.exactDateTime(values[i].date).slice(0, 10) + "：" + values[i].totalMl + " ml，" + values[i].count + " 次";
      value.className = "chart-value";
      value.textContent = String(values[i].totalMl);
      wrap.className = "chart-bar-wrap";
      bar.className = "chart-bar";
      percent = max ? Math.round(values[i].totalMl / max * 100) : 0;
      bar.style.height = (values[i].totalMl ? Math.max(5, percent) : 0) + "%";
      wrap.appendChild(bar);
      label.className = "chart-label";
      label.textContent = Logic.shortDate(values[i].date);
      column.appendChild(value);
      column.appendChild(wrap);
      column.appendChild(label);
      container.appendChild(column);
    }
  }

  function renderStats() {
    var now = new Date();
    var range = Logic.dateRange(currentRange, now, records);
    var stats = Logic.calculateStatistics(records, range);
    var days = Logic.dailyTotals(records, range, 30);
    var lastIncluded = new Date(Math.max(range.start.getTime(), range.end.getTime() - 1000));
    byId("statTotal").textContent = stats.totalMl + " ml";
    byId("statCount").textContent = stats.count + " 次";
    byId("statAverageAmount").textContent = formatAverageAmount(stats.averageAmountMl);
    byId("statAverageClock").textContent = Logic.formatClockSeconds(stats.averageClockSeconds);
    byId("statAverageInterval").textContent = Logic.formatDuration(stats.averageIntervalSeconds);
    byId("statDailyAverage").textContent = stats.averageDailyCount.toFixed(2) + " 次";
    byId("statDayCount").textContent = "按 " + range.dayCount + " 个自然日计算";
    byId("statRangeDates").textContent = displayRangeDate(range.start) + " — " + displayRangeDate(lastIncluded);
    renderChart(days);
  }

  function renderBackup() {
    byId("backupRecordCount").textContent = records.length + " 条";
  }

  function renderAll() {
    renderHome();
    renderRecords();
    renderStats();
    renderBackup();
  }

  function switchPanel(target) {
    each(document.querySelectorAll(".panel"), function (panel) {
      panel.className = "panel" + (panel.getAttribute("data-panel") === target ? " is-active" : "");
    });
    each(document.querySelectorAll(".nav-item"), function (button) {
      var active = button.getAttribute("data-target") === target;
      button.className = "nav-item" + (active ? " is-active" : "");
      button.setAttribute("aria-selected", active ? "true" : "false");
    });
    if (target === "stats") {
      renderStats();
    } else if (target === "records") {
      renderRecords();
    } else if (target === "backup") {
      renderBackup();
    }
    window.scrollTo(0, 0);
  }

  function setModalOpen(modal, open) {
    modal.className = modal.className.replace(/\s*is-open/g, "") + (open ? " is-open" : "");
    modal.setAttribute("aria-hidden", open ? "false" : "true");
    if (open) {
      document.body.className += document.body.className.indexOf("modal-open") === -1 ? " modal-open" : "";
    } else if (!document.querySelector(".modal.is-open")) {
      document.body.className = document.body.className.replace(/\s*modal-open/g, "");
    }
  }

  function closeModal(name) {
    if (name === "quick") {
      setModalOpen(byId("quickModal"), false);
    } else if (name === "manual") {
      setModalOpen(byId("manualModal"), false);
    }
  }

  function setQuickAmount(value) {
    var amount = Logic.normalizeAmount(value);
    byId("amountRange").value = String(amount);
    byId("quickAmount").textContent = String(amount);
    each(document.querySelectorAll(".preset-row button"), function (button) {
      button.className = Number(button.getAttribute("data-amount")) === amount ? "is-selected" : "";
    });
  }

  function openQuick() {
    setQuickAmount(getLastAmount());
    updateClock();
    setModalOpen(byId("quickModal"), true);
  }

  function fillAmountSelect() {
    var select = byId("manualAmount");
    var amount;
    var option;
    for (amount = Logic.MIN_AMOUNT; amount <= Logic.MAX_AMOUNT; amount += Logic.AMOUNT_STEP) {
      option = document.createElement("option");
      option.value = String(amount);
      option.textContent = amount + " ml";
      select.appendChild(option);
    }
  }

  function openManual(record) {
    var now = new Date();
    var date;
    byId("manualError").textContent = "";
    byId("editingId").value = record ? record.id : "";
    byId("manualTitle").textContent = record ? "编辑记录" : "手动补记";
    byId("saveManual").textContent = record ? "保存修改" : "保存补记";
    if (record) {
      date = Logic.parseRecordDate(record);
      byId("manualAmount").value = String(record.amountMl);
    } else {
      date = now;
      byId("manualAmount").value = String(getLastAmount());
    }
    byId("manualDate").value = Logic.localDateValue(date);
    byId("manualDate").max = Logic.localDateValue(now);
    byId("manualTime").value = Logic.localTimeValue(date);
    setModalOpen(byId("manualModal"), true);
  }

  function saveCurrentRecord() {
    var amount = Number(byId("amountRange").value);
    var record = Logic.createRecord(amount, new Date(), "当前时间记录");
    if (!record) {
      showToast("毫升数必须是 10–300，并以 10 为单位。", true);
      return;
    }
    records.push(record);
    sortRecords();
    if (!persistRecords()) {
      records = records.filter(function (item) { return item.id !== record.id; });
      return;
    }
    setLastAmount(amount);
    closeModal("quick");
    renderAll();
    showToast("已记录 " + amount + " ml · " + Logic.exactDateTime(Logic.parseRecordDate(record)));
  }

  function saveManualRecord(event) {
    var amount = Number(byId("manualAmount").value);
    var date = Logic.parseLocalDateTime(byId("manualDate").value, byId("manualTime").value);
    var editingId = byId("editingId").value;
    var existing = null;
    var oldRecord = null;
    var newRecord;
    var i;
    event.preventDefault();
    byId("manualError").textContent = "";
    if (!Logic.isValidAmount(amount)) {
      byId("manualError").textContent = "毫升数必须是 10–300，并且以 10 为单位。";
      return;
    }
    if (!date) {
      byId("manualError").textContent = "请输入有效的日期和准确时间。";
      return;
    }
    if (date.getTime() > new Date().getTime() + 1000) {
      byId("manualError").textContent = "补记时间不能晚于当前时间。";
      return;
    }
    for (i = 0; i < records.length; i += 1) {
      if (records[i].id === editingId) {
        existing = records[i];
        break;
      }
    }
    newRecord = Logic.createRecord(amount, date, existing ? existing.source : "手动补记", editingId || null);
    if (!newRecord) {
      byId("manualError").textContent = "这条记录无法保存，请检查输入。";
      return;
    }
    if (existing) {
      oldRecord = existing;
      records[i] = newRecord;
    } else {
      records.push(newRecord);
    }
    sortRecords();
    if (!persistRecords()) {
      if (oldRecord) {
        records = records.filter(function (item) { return item.id !== newRecord.id; });
        records.push(oldRecord);
        sortRecords();
      } else {
        records = records.filter(function (item) { return item.id !== newRecord.id; });
      }
      return;
    }
    setLastAmount(amount);
    closeModal("manual");
    renderAll();
    showToast((existing ? "已修改 " : "已补记 ") + amount + " ml · " + Logic.exactDateTime(date));
  }

  function changeManualAmount(delta) {
    byId("manualAmount").value = String(Logic.normalizeAmount(Number(byId("manualAmount").value) + delta));
  }

  function findRecord(id) {
    var i;
    for (i = 0; i < records.length; i += 1) {
      if (records[i].id === id) {
        return records[i];
      }
    }
    return null;
  }

  function askConfirmation(title, message, action, buttonText) {
    confirmAction = action;
    byId("confirmTitle").textContent = title;
    byId("confirmMessage").textContent = message;
    byId("acceptConfirm").textContent = buttonText || "确认";
    setModalOpen(byId("confirmModal"), true);
  }

  function closeConfirmation() {
    confirmAction = null;
    setModalOpen(byId("confirmModal"), false);
  }

  function deleteRecord(record) {
    var previous = records.slice(0);
    records = records.filter(function (item) { return item.id !== record.id; });
    if (!persistRecords()) {
      records = previous;
      return;
    }
    renderAll();
    showToast("已删除一条记录");
  }

  function handleRecordAction(event) {
    var button = event.target;
    var row;
    var record;
    while (button && button !== event.currentTarget && !button.getAttribute("data-action")) {
      button = button.parentNode;
    }
    if (!button || button === event.currentTarget) {
      return;
    }
    row = button;
    while (row && row !== event.currentTarget && !row.getAttribute("data-id")) {
      row = row.parentNode;
    }
    record = row ? findRecord(row.getAttribute("data-id")) : null;
    if (!record) {
      return;
    }
    if (button.getAttribute("data-action") === "edit") {
      openManual(record);
    } else {
      askConfirmation("删除这条记录？", Logic.exactDateTime(Logic.parseRecordDate(record)) + " · " + record.amountMl + " ml。删除后无法撤销。", function () {
        deleteRecord(record);
      }, "删除");
    }
  }

  function csvCell(value) {
    return "\"" + String(value).replace(/\"/g, "\"\"") + "\"";
  }

  function backupName(extension) {
    var now = new Date();
    return "毫升时间记录-" + Logic.localDateValue(now) + "-" + pad(now.getHours()) + pad(now.getMinutes()) + "." + extension;
  }

  function shareOrDownload(text, mime, filename, title) {
    var blob;
    var file;
    var shareData;

    function openTextFallback() {
      try {
        window.open("data:" + mime + ";charset=utf-8," + encodeURIComponent(text), "_blank");
        showToast("文件已在新页面打开，请用 Safari 分享按钮保存。 ");
      } catch (fallbackError) {
        showToast("无法导出，请升级 Safari 后重试。", true);
      }
    }

    function downloadBlob() {
      var anchor;
      var url;
      try {
        anchor = document.createElement("a");
        url = window.URL.createObjectURL(blob);
        anchor.href = url;
        anchor.download = filename;
        anchor.style.display = "none";
        document.body.appendChild(anchor);
        anchor.click();
        window.setTimeout(function () {
          window.URL.revokeObjectURL(url);
          if (anchor.parentNode) {
            anchor.parentNode.removeChild(anchor);
          }
        }, 2000);
        showToast("备份文件已生成；如看到预览页，请用分享按钮存入“文件”。");
      } catch (error) {
        openTextFallback();
      }
    }

    try {
      blob = new Blob([text], { type: mime });
    } catch (error) {
      openTextFallback();
      return;
    }
    if (typeof File === "function" && navigator.share && navigator.canShare) {
      file = new File([blob], filename, { type: mime });
      shareData = { files: [file], title: title };
      if (navigator.canShare(shareData)) {
        navigator.share(shareData).then(function () {
          showToast("分享完成；可在“文件”中查看备份。 ");
        }).catch(function (error) {
          if (error && error.name === "AbortError") {
            showToast("已取消导出。 ");
          } else {
            downloadBlob();
          }
        });
        return;
      }
    }
    downloadBlob();
  }

  function exportJson() {
    var backup = {
      app: "本地毫升时间记录器网页版",
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      records: records
    };
    shareOrDownload(JSON.stringify(backup, null, 2), "application/json", backupName("json"), "毫升时间记录 JSON 备份");
  }

  function exportCsv() {
    var lines = ["序号,准确日期时间,毫升数,记录方式"];
    var chronological = records.slice(0).reverse();
    var i;
    for (i = 0; i < chronological.length; i += 1) {
      lines.push([
        String(i + 1),
        csvCell(Logic.exactDateTime(Logic.parseRecordDate(chronological[i]))),
        String(chronological[i].amountMl),
        csvCell(chronological[i].source)
      ].join(","));
    }
    shareOrDownload("\uFEFF" + lines.join("\r\n"), "text/csv", backupName("csv"), "毫升时间记录 CSV");
  }

  function importJsonFile(event) {
    var file = event.target.files && event.target.files[0];
    var reader;
    if (!file) {
      return;
    }
    reader = new FileReader();
    reader.onload = function () {
      var decoded;
      var incoming;
      var existingKeys = {};
      var previous = records.slice(0);
      var added = 0;
      var invalid = 0;
      var i;
      var record;
      try {
        decoded = JSON.parse(String(reader.result || "").replace(/^\uFEFF/, ""));
        incoming = Object.prototype.toString.call(decoded) === "[object Array]" ? decoded : decoded.records;
        if (Object.prototype.toString.call(incoming) !== "[object Array]") {
          throw new Error("records missing");
        }
        for (i = 0; i < records.length; i += 1) {
          existingKeys[Logic.recordKey(records[i])] = true;
        }
        for (i = 0; i < incoming.length; i += 1) {
          record = Logic.coerceRecord(incoming[i]);
          if (!record) {
            invalid += 1;
          } else if (!existingKeys[Logic.recordKey(record)]) {
            records.push(record);
            existingKeys[Logic.recordKey(record)] = true;
            added += 1;
          }
        }
        if (!added && invalid === incoming.length && incoming.length) {
          throw new Error("no valid records");
        }
        sortRecords();
        if (!persistRecords()) {
          records = previous;
          return;
        }
        renderAll();
        showToast("恢复完成：新增 " + added + " 条，重复记录已跳过" + (invalid ? "，无效 " + invalid + " 条" : "") + "。 ");
      } catch (error) {
        showToast("导入失败：请选择本应用导出的 JSON 备份。", true);
      }
      byId("importJson").value = "";
    };
    reader.onerror = function () {
      showToast("文件读取失败，请重新选择。", true);
      byId("importJson").value = "";
    };
    reader.readAsText(file, "utf-8");
  }

  function bindEvents() {
    each(document.querySelectorAll(".nav-item"), function (button) {
      button.addEventListener("click", function () {
        switchPanel(button.getAttribute("data-target"));
      });
    });
    byId("openQuickHeader").addEventListener("click", openQuick);
    byId("openQuickHero").addEventListener("click", openQuick);
    byId("openManualHome").addEventListener("click", function () { openManual(null); });
    byId("openManualRecords").addEventListener("click", function () { openManual(null); });
    each(document.querySelectorAll("[data-close]"), function (button) {
      button.addEventListener("click", function () { closeModal(button.getAttribute("data-close")); });
    });
    byId("amountRange").addEventListener("input", function () { setQuickAmount(byId("amountRange").value); });
    byId("amountRange").addEventListener("change", function () { setQuickAmount(byId("amountRange").value); });
    byId("amountMinus").addEventListener("click", function () { setQuickAmount(Number(byId("amountRange").value) - 10); });
    byId("amountPlus").addEventListener("click", function () { setQuickAmount(Number(byId("amountRange").value) + 10); });
    each(document.querySelectorAll(".preset-row button"), function (button) {
      button.addEventListener("click", function () { setQuickAmount(Number(button.getAttribute("data-amount"))); });
    });
    byId("confirmQuick").addEventListener("click", saveCurrentRecord);
    byId("manualMinus").addEventListener("click", function () { changeManualAmount(-10); });
    byId("manualPlus").addEventListener("click", function () { changeManualAmount(10); });
    byId("manualForm").addEventListener("submit", saveManualRecord);
    byId("recentList").addEventListener("click", handleRecordAction);
    byId("recordsList").addEventListener("click", handleRecordAction);
    byId("recordSearch").addEventListener("input", renderRecords);
    byId("clearSearch").addEventListener("click", function () {
      byId("recordSearch").value = "";
      renderRecords();
    });
    each(document.querySelectorAll("#rangeSelector button"), function (button) {
      button.addEventListener("click", function () {
        currentRange = button.getAttribute("data-range");
        each(document.querySelectorAll("#rangeSelector button"), function (item) {
          item.className = item === button ? "is-active" : "";
        });
        renderStats();
      });
    });
    byId("exportJson").addEventListener("click", exportJson);
    byId("exportCsv").addEventListener("click", exportCsv);
    byId("importJson").addEventListener("change", importJsonFile);
    byId("clearAll").addEventListener("click", function () {
      if (!records.length) {
        showToast("当前没有可清空的记录。 ");
        return;
      }
      askConfirmation("清空全部本机数据？", "将永久删除 " + records.length + " 条记录。建议先导出 JSON 备份。", function () {
        var previous = records.slice(0);
        records = [];
        if (!persistRecords()) {
          records = previous;
          return;
        }
        renderAll();
        showToast("全部本机记录已清空");
      }, "全部清空");
    });
    byId("cancelConfirm").addEventListener("click", closeConfirmation);
    byId("acceptConfirm").addEventListener("click", function () {
      var action = confirmAction;
      closeConfirmation();
      if (action) {
        action();
      }
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" || event.keyCode === 27) {
        if (byId("confirmModal").className.indexOf("is-open") !== -1) {
          closeConfirmation();
        } else if (byId("manualModal").className.indexOf("is-open") !== -1) {
          closeModal("manual");
        } else if (byId("quickModal").className.indexOf("is-open") !== -1) {
          closeModal("quick");
        }
      }
    });
  }

  function registerServiceWorker() {
    if ("serviceWorker" in navigator && (window.location.protocol === "https:" || window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")) {
      navigator.serviceWorker.register("sw.js").catch(function () {
        /* The app still works online when offline installation is unavailable. */
      });
    }
  }

  function shouldOpenQuickOnLaunch() {
    return /(?:\?|&)quick=1(?:&|$)/.test(window.location.search) || window.navigator.standalone === true;
  }

  function init() {
    if (!Logic) {
      return;
    }
    fillAmountSelect();
    loadRecords();
    bindEvents();
    updateClock();
    window.setInterval(updateClock, 1000);
    renderAll();
    registerServiceWorker();
    if (shouldOpenQuickOnLaunch()) {
      window.setTimeout(openQuick, 250);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
}());

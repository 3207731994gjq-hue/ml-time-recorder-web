(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.MLRecorderLogic = api;
  }
}(this, function () {
  "use strict";

  var MIN_AMOUNT = 10;
  var MAX_AMOUNT = 300;
  var AMOUNT_STEP = 10;
  var DAY_SECONDS = 86400;

  function pad(value) {
    return value < 10 ? "0" + value : String(value);
  }

  function isValidAmount(value) {
    var amount = Number(value);
    return isFinite(amount) && amount >= MIN_AMOUNT && amount <= MAX_AMOUNT && amount % AMOUNT_STEP === 0;
  }

  function normalizeAmount(value) {
    var amount = Math.round(Number(value) / AMOUNT_STEP) * AMOUNT_STEP;
    if (!isFinite(amount)) {
      amount = 120;
    }
    return Math.min(MAX_AMOUNT, Math.max(MIN_AMOUNT, amount));
  }

  function toSecondPrecision(date) {
    return new Date(Math.floor(date.getTime() / 1000) * 1000);
  }

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  }

  function addDays(date, amount) {
    var result = new Date(date.getTime());
    result.setDate(result.getDate() + amount);
    return result;
  }

  function startOfWeek(date) {
    var day = startOfDay(date);
    var daysSinceMonday = (day.getDay() + 6) % 7;
    return addDays(day, -daysSinceMonday);
  }

  function parseRecordDate(record) {
    var raw = record && (record.at || record.recordedAt || record.clientRecordedAt);
    var date = new Date(raw);
    return isNaN(date.getTime()) ? null : toSecondPrecision(date);
  }

  function coerceRecord(record) {
    var date = parseRecordDate(record);
    var amount = Number(record && record.amountMl);
    if (!date || !isValidAmount(amount)) {
      return null;
    }
    return {
      id: String(record.id || makeId()),
      amountMl: amount,
      at: date.toISOString(),
      source: String(record.source || "当前时间记录")
    };
  }

  function makeId() {
    var randomPart = Math.random().toString(36).slice(2);
    return "web-" + new Date().getTime().toString(36) + "-" + randomPart;
  }

  function createRecord(amount, date, source, id) {
    if (!isValidAmount(amount) || !(date instanceof Date) || isNaN(date.getTime())) {
      return null;
    }
    return {
      id: id || makeId(),
      amountMl: Number(amount),
      at: toSecondPrecision(date).toISOString(),
      source: source || "当前时间记录"
    };
  }

  function parseLocalDateTime(dateText, timeText) {
    var dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateText || ""));
    var timeMatch = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(timeText || ""));
    if (!dateMatch || !timeMatch) {
      return null;
    }
    var year = Number(dateMatch[1]);
    var month = Number(dateMatch[2]);
    var day = Number(dateMatch[3]);
    var hour = Number(timeMatch[1]);
    var minute = Number(timeMatch[2]);
    var second = Number(timeMatch[3] || 0);
    var date = new Date(year, month - 1, day, hour, minute, second, 0);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day ||
        date.getHours() !== hour || date.getMinutes() !== minute || date.getSeconds() !== second) {
      return null;
    }
    return date;
  }

  function localDateValue(date) {
    return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
  }

  function localTimeValue(date) {
    return pad(date.getHours()) + ":" + pad(date.getMinutes()) + ":" + pad(date.getSeconds());
  }

  function exactDateTime(date) {
    return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate()) +
      " " + pad(date.getHours()) + ":" + pad(date.getMinutes()) + ":" + pad(date.getSeconds());
  }

  function shortDate(date) {
    return pad(date.getMonth() + 1) + "/" + pad(date.getDate());
  }

  function sameDay(first, second) {
    return first.getFullYear() === second.getFullYear() &&
      first.getMonth() === second.getMonth() &&
      first.getDate() === second.getDate();
  }

  function countDays(start, end) {
    var cursor = startOfDay(start);
    var finalDay = startOfDay(new Date(Math.max(start.getTime(), end.getTime() - 1)));
    var count = 1;
    while (cursor.getTime() < finalDay.getTime() && count < 20000) {
      cursor = addDays(cursor, 1);
      count += 1;
    }
    return count;
  }

  function dateRange(kind, now, records) {
    var current = now || new Date();
    var today = startOfDay(current);
    var start;
    var end = new Date(current.getTime() + 1000);
    var values = records || [];
    var i;
    var parsed;
    var earliest = null;

    if (kind === "last7") {
      start = addDays(today, -6);
    } else if (kind === "thisWeek") {
      start = startOfWeek(current);
    } else if (kind === "lastWeek") {
      end = startOfWeek(current);
      start = addDays(end, -7);
    } else if (kind === "last30") {
      start = addDays(today, -29);
    } else {
      for (i = 0; i < values.length; i += 1) {
        parsed = parseRecordDate(values[i]);
        if (parsed && (!earliest || parsed.getTime() < earliest.getTime())) {
          earliest = parsed;
        }
      }
      start = earliest ? startOfDay(earliest) : today;
    }

    return {
      kind: kind,
      start: start,
      end: end,
      dayCount: Math.max(1, countDays(start, end))
    };
  }

  function recordsInRange(records, range) {
    var result = [];
    var i;
    var date;
    for (i = 0; i < records.length; i += 1) {
      date = parseRecordDate(records[i]);
      if (date && date.getTime() >= range.start.getTime() && date.getTime() < range.end.getTime()) {
        result.push(records[i]);
      }
    }
    result.sort(function (a, b) {
      return parseRecordDate(a).getTime() - parseRecordDate(b).getTime();
    });
    return result;
  }

  function averageClockSeconds(records) {
    if (!records.length) {
      return null;
    }
    var x = 0;
    var y = 0;
    var arithmetic = 0;
    var i;
    var date;
    var seconds;
    var angle;
    for (i = 0; i < records.length; i += 1) {
      date = parseRecordDate(records[i]);
      if (!date) {
        continue;
      }
      seconds = date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();
      angle = seconds / DAY_SECONDS * Math.PI * 2;
      x += Math.cos(angle);
      y += Math.sin(angle);
      arithmetic += seconds;
    }
    if (Math.sqrt(x * x + y * y) < 0.000001) {
      return Math.round(arithmetic / records.length) % DAY_SECONDS;
    }
    angle = Math.atan2(y, x);
    if (angle < 0) {
      angle += Math.PI * 2;
    }
    return Math.round(angle / (Math.PI * 2) * DAY_SECONDS) % DAY_SECONDS;
  }

  function calculateStatistics(records, range) {
    var selected = recordsInRange(records, range);
    var total = 0;
    var intervalTotal = 0;
    var i;
    for (i = 0; i < selected.length; i += 1) {
      total += Number(selected[i].amountMl);
      if (i > 0) {
        intervalTotal += Math.max(0, (parseRecordDate(selected[i]).getTime() - parseRecordDate(selected[i - 1]).getTime()) / 1000);
      }
    }
    return {
      records: selected,
      count: selected.length,
      totalMl: total,
      averageAmountMl: selected.length ? total / selected.length : null,
      averageClockSeconds: averageClockSeconds(selected),
      averageDailyCount: selected.length / Math.max(1, range.dayCount),
      averageIntervalSeconds: selected.length > 1 ? Math.round(intervalTotal / (selected.length - 1)) : null
    };
  }

  function dailyTotals(records, range, maximumDays) {
    var values = [];
    var cursor = startOfDay(range.start);
    var next;
    var dayEnd;
    var selected;
    var total;
    var i;
    while (cursor.getTime() < range.end.getTime() && values.length < 20000) {
      next = addDays(cursor, 1);
      dayEnd = new Date(Math.min(next.getTime(), range.end.getTime()));
      selected = recordsInRange(records, { start: cursor, end: dayEnd });
      total = 0;
      for (i = 0; i < selected.length; i += 1) {
        total += Number(selected[i].amountMl);
      }
      values.push({ date: new Date(cursor.getTime()), count: selected.length, totalMl: total });
      cursor = next;
    }
    if (maximumDays && values.length > maximumDays) {
      return values.slice(values.length - maximumDays);
    }
    return values;
  }

  function formatClockSeconds(seconds) {
    if (seconds === null || typeof seconds === "undefined") {
      return "—";
    }
    var normalized = ((Math.round(seconds) % DAY_SECONDS) + DAY_SECONDS) % DAY_SECONDS;
    return pad(Math.floor(normalized / 3600)) + ":" +
      pad(Math.floor((normalized % 3600) / 60)) + ":" + pad(normalized % 60);
  }

  function formatDuration(seconds) {
    if (seconds === null || typeof seconds === "undefined") {
      return "—";
    }
    var value = Math.max(0, Math.round(seconds));
    var days = Math.floor(value / DAY_SECONDS);
    var hours = Math.floor((value % DAY_SECONDS) / 3600);
    var minutes = Math.floor((value % 3600) / 60);
    var secs = value % 60;
    if (days) {
      return days + "天 " + hours + "小时 " + minutes + "分";
    }
    if (hours) {
      return hours + "小时 " + minutes + "分 " + secs + "秒";
    }
    if (minutes) {
      return minutes + "分 " + secs + "秒";
    }
    return secs + "秒";
  }

  function recordKey(record) {
    var date = parseRecordDate(record);
    return (date ? Math.floor(date.getTime() / 1000) : 0) + "|" + record.amountMl + "|" + record.source;
  }

  return {
    MIN_AMOUNT: MIN_AMOUNT,
    MAX_AMOUNT: MAX_AMOUNT,
    AMOUNT_STEP: AMOUNT_STEP,
    isValidAmount: isValidAmount,
    normalizeAmount: normalizeAmount,
    createRecord: createRecord,
    coerceRecord: coerceRecord,
    parseRecordDate: parseRecordDate,
    parseLocalDateTime: parseLocalDateTime,
    localDateValue: localDateValue,
    localTimeValue: localTimeValue,
    exactDateTime: exactDateTime,
    shortDate: shortDate,
    sameDay: sameDay,
    startOfDay: startOfDay,
    addDays: addDays,
    startOfWeek: startOfWeek,
    dateRange: dateRange,
    calculateStatistics: calculateStatistics,
    dailyTotals: dailyTotals,
    averageClockSeconds: averageClockSeconds,
    formatClockSeconds: formatClockSeconds,
    formatDuration: formatDuration,
    recordKey: recordKey,
    makeId: makeId
  };
}));

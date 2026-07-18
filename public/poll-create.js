// poll-create.js — Calendar picker, timezone selector, slot management

(function () {
  "use strict";

  // --- State ---
  const state = {
    selectedSlots: new Map(), // key -> Set of "HH:MM" strings (or empty set for date-only)
    currentMonth: new Date().getMonth(),
    currentYear: new Date().getFullYear(),
    pollType: "datetime",
    scheduleMode: "specific", // "specific" or "weekly"
  };

  // --- DOM refs ---
  const calendarContainer = document.getElementById("calendar-container");
  const selectedSlotsContainer = document.getElementById("selected-slots");
  const timezoneSelect = document.getElementById("timezone");
  const timezoneSearch = document.getElementById("timezone-search");
  const defaultTimeGroup = document.getElementById("default-time-group");
  const defaultTimeInput = document.getElementById("default-time");
  const applyDefaultTimeBtn = document.getElementById("apply-default-time");
  const durationGroup = document.getElementById("duration-group");
  const durationSelect = document.getElementById("duration");
  const customDurationDiv = document.getElementById("custom-duration");
  const customDurationInput = document.getElementById("custom-duration-input");
  const weekdayContainer = document.getElementById("weekday-container");
  const createBtn = document.getElementById("create-btn");
  const form = document.getElementById("create-poll-form");

  if (!calendarContainer || !timezoneSelect || !form) return;

  // --- Timezone setup ---
  function initTimezones() {
    const timezones = Intl.supportedValuesOf("timeZone");
    const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

    timezoneSelect.innerHTML = "";
    for (const tz of timezones) {
      const opt = document.createElement("option");
      opt.value = tz;
      opt.textContent = tz.replace(/_/g, " ");
      if (tz === browserTz) opt.selected = true;
      timezoneSelect.appendChild(opt);
    }

    // Search/filter
    if (timezoneSearch) {
      timezoneSearch.value = browserTz.replace(/_/g, " ");
      timezoneSearch.addEventListener("input", function () {
        const query = this.value.toLowerCase().replace(/\s+/g, "_");
        let firstMatch = null;
        for (const opt of timezoneSelect.options) {
          const matches = opt.value.toLowerCase().includes(query);
          opt.hidden = !matches;
          if (matches && !firstMatch) firstMatch = opt;
        }
        if (firstMatch) {
          timezoneSelect.value = firstMatch.value;
        }
      });

      timezoneSearch.addEventListener("focus", function () {
        this.select();
      });

      timezoneSelect.addEventListener("change", function () {
        timezoneSearch.value = this.value.replace(/_/g, " ");
      });
    }
  }

  // --- Poll type toggle ---
  function initPollTypeToggle() {
    const radios = document.querySelectorAll('input[name="poll_type"]');
    for (const radio of radios) {
      radio.addEventListener("change", function () {
        state.pollType = this.value;
        var isDatetime = this.value === "datetime";
        if (defaultTimeGroup) {
          if (isDatetime) { defaultTimeGroup.classList.remove("hidden"); } else { defaultTimeGroup.classList.add("hidden"); }
        }
        if (durationGroup) {
          if (isDatetime) { durationGroup.classList.remove("hidden"); } else { durationGroup.classList.add("hidden"); }
        }
        // Clear all times if switching to date-only
        if (this.value === "date") {
          for (const [date, times] of state.selectedSlots) {
            times.clear();
          }
        } else {
          // Add default time to dates that have none
          const defaultTime = defaultTimeInput ? defaultTimeInput.value : "10:00";
          for (const [date, times] of state.selectedSlots) {
            if (times.size === 0) {
              times.add(defaultTime);
            }
          }
        }
        renderSelectedSlots();
      });
    }
  }

  // --- Schedule mode toggle ---
  function initScheduleModeToggle() {
    var radios = document.querySelectorAll('input[name="schedule_mode"]');
    for (var radio of radios) {
      radio.addEventListener("change", function () {
        state.scheduleMode = this.value;
        // Clear selections when switching modes
        state.selectedSlots.clear();

        if (this.value === "weekly") {
          calendarContainer.classList.add("hidden");
          if (weekdayContainer) weekdayContainer.classList.remove("hidden");
          renderWeekdayPicker();
        } else {
          calendarContainer.classList.remove("hidden");
          if (weekdayContainer) weekdayContainer.classList.add("hidden");
          renderCalendar();
        }
        renderSelectedSlots();
      });
    }
  }

  // --- Weekday picker ---
  var WEEKDAYS = [
    { key: "monday", short: "Mon", full: "Monday" },
    { key: "tuesday", short: "Tue", full: "Tuesday" },
    { key: "wednesday", short: "Wed", full: "Wednesday" },
    { key: "thursday", short: "Thu", full: "Thursday" },
    { key: "friday", short: "Fri", full: "Friday" },
    { key: "saturday", short: "Sat", full: "Saturday" },
    { key: "sunday", short: "Sun", full: "Sunday" },
  ];

  function renderWeekdayPicker() {
    if (!weekdayContainer) return;

    var html = '<div class="weekday-picker" role="group" aria-label="Select days of the week">';
    for (var i = 0; i < WEEKDAYS.length; i++) {
      var day = WEEKDAYS[i];
      var isSelected = state.selectedSlots.has(day.key);
      var cls = "weekday-btn" + (isSelected ? " weekday-selected" : "");
      html += '<button type="button" class="' + cls + '" data-day="' + day.key + '"';
      html += ' aria-pressed="' + isSelected + '"';
      html += ' aria-label="' + day.full + (isSelected ? ", selected" : "") + '">';
      html += day.short;
      html += "</button>";
    }
    html += "</div>";
    weekdayContainer.innerHTML = html;

    for (var btn of weekdayContainer.querySelectorAll(".weekday-btn")) {
      btn.addEventListener("click", function () {
        toggleDate(this.dataset.day);
        renderWeekdayPicker();
      });
    }
  }

  // --- Calendar rendering ---
  function renderCalendar() {
    var year = state.currentYear;
    var month = state.currentMonth;

    var firstDay = new Date(year, month, 1);
    var lastDay = new Date(year, month + 1, 0);
    var startDow = (firstDay.getDay() + 6) % 7; // Monday = 0
    var daysInMonth = lastDay.getDate();

    var monthName = firstDay.toLocaleDateString("en-US", { month: "long", year: "numeric" });

    var html = '<div class="calendar" role="group" aria-label="' + monthName + '">';
    html += '<div class="calendar-nav">';
    html += '<button type="button" class="cal-prev" aria-label="Previous month">&lsaquo;</button>';
    html += '<span class="cal-month" id="cal-month-label" aria-live="polite">' + monthName + "</span>";
    html += '<button type="button" class="cal-next" aria-label="Next month">&rsaquo;</button>';
    html += "</div>";

    html += '<div class="calendar-grid" role="grid" aria-labelledby="cal-month-label">';

    // Day name headers
    var dayNamesFull = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    var dayNamesShort = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
    html += '<div role="row" class="cal-header-row">';
    for (var i = 0; i < dayNamesShort.length; i++) {
      html += '<div role="columnheader" class="cal-header" abbr="' + dayNamesFull[i] + '">' + dayNamesShort[i] + "</div>";
    }
    html += "</div>";

    // Build rows (weeks)
    var today = new Date();
    today.setHours(0, 0, 0, 0);

    var cellIndex = 0;
    var totalCells = startDow + daysInMonth;
    var day = 1;

    while (cellIndex < totalCells) {
      html += '<div role="row">';
      for (var col = 0; col < 7 && cellIndex < totalCells; col++, cellIndex++) {
        if (cellIndex < startDow) {
          html += '<div role="gridcell" class="cal-empty"></div>';
        } else {
          var dateStr = year + "-" + String(month + 1).padStart(2, "0") + "-" + String(day).padStart(2, "0");
          var dateObj = new Date(year, month, day);
          var isPast = dateObj < today;
          var isSelected = state.selectedSlots.has(dateStr);
          var isToday = dateObj.getTime() === today.getTime();

          var dateLabel = dateObj.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
          if (isSelected) dateLabel += ", selected";

          var cls = "cal-day";
          if (isPast) cls += " cal-past";
          if (isSelected) cls += " cal-selected";
          if (isToday) cls += " cal-today";

          html += '<button type="button" role="gridcell" class="' + cls + '" data-date="' + dateStr + '"';
          html += ' aria-selected="' + isSelected + '"';
          html += ' aria-label="' + dateLabel + '"';
          if (isPast) html += ' aria-disabled="true" disabled';
          html += ' tabindex="-1"';
          html += ">" + day + "</button>";
          day++;
        }
      }
      html += "</div>";
    }

    html += "</div></div>";
    calendarContainer.innerHTML = html;

    // Set tabindex="0" on the first focusable day (or today, or first selected)
    var focusTarget = calendarContainer.querySelector(".cal-today:not([disabled])") ||
      calendarContainer.querySelector(".cal-selected") ||
      calendarContainer.querySelector(".cal-day:not([disabled])");
    if (focusTarget) focusTarget.setAttribute("tabindex", "0");

    // Event listeners — nav buttons
    calendarContainer.querySelector(".cal-prev").addEventListener("click", function () {
      state.currentMonth--;
      if (state.currentMonth < 0) {
        state.currentMonth = 11;
        state.currentYear--;
      }
      renderCalendar();
    });

    calendarContainer.querySelector(".cal-next").addEventListener("click", function () {
      state.currentMonth++;
      if (state.currentMonth > 11) {
        state.currentMonth = 0;
        state.currentYear++;
      }
      renderCalendar();
    });

    // Click to select
    for (var btn of calendarContainer.querySelectorAll(".cal-day:not([disabled])")) {
      btn.addEventListener("click", function () {
        toggleDate(this.dataset.date);
      });
    }

    // Keyboard navigation within the grid
    calendarContainer.querySelector(".calendar-grid").addEventListener("keydown", function (e) {
      var current = document.activeElement;
      if (!current || !current.classList.contains("cal-day")) return;

      var allDays = Array.from(calendarContainer.querySelectorAll(".cal-day"));
      var idx = allDays.indexOf(current);
      var target = null;

      if (e.key === "ArrowRight") {
        target = allDays[idx + 1];
      } else if (e.key === "ArrowLeft") {
        target = allDays[idx - 1];
      } else if (e.key === "ArrowDown") {
        target = allDays[idx + 7];
      } else if (e.key === "ArrowUp") {
        target = allDays[idx - 7];
      } else if (e.key === "Home") {
        target = allDays[0];
      } else if (e.key === "End") {
        target = allDays[allDays.length - 1];
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (!current.disabled) toggleDate(current.dataset.date);
        return;
      } else {
        return;
      }

      if (target) {
        e.preventDefault();
        current.setAttribute("tabindex", "-1");
        target.setAttribute("tabindex", "0");
        target.focus();
      }
    });
  }

  function toggleDate(dateStr) {
    if (state.selectedSlots.has(dateStr)) {
      state.selectedSlots.delete(dateStr);
    } else {
      const times = new Set();
      if (state.pollType === "datetime") {
        const defaultTime = defaultTimeInput ? defaultTimeInput.value : "10:00";
        times.add(defaultTime);
      }
      state.selectedSlots.set(dateStr, times);
    }
    renderCalendar();
    renderSelectedSlots();
  }

  // --- Selected slots list ---
  function renderSelectedSlots() {
    if (state.selectedSlots.size === 0) {
      selectedSlotsContainer.innerHTML = '<p class="muted">No dates selected yet. Click dates on the calendar above.</p>';
      createBtn.disabled = true;
      updateFormInputs();
      return;
    }

    createBtn.disabled = false;

    // Sort keys — weekdays by canonical order, dates alphabetically
    var WEEKDAY_ORDER = { monday: 0, tuesday: 1, wednesday: 2, thursday: 3, friday: 4, saturday: 5, sunday: 6 };
    var sortedDates = [...state.selectedSlots.keys()].sort(function (a, b) {
      if (state.scheduleMode === "weekly") {
        return (WEEKDAY_ORDER[a] ?? 0) - (WEEKDAY_ORDER[b] ?? 0);
      }
      return a.localeCompare(b);
    });

    var html = '<div class="slot-list">';
    for (var dateStr of sortedDates) {
      var times = state.selectedSlots.get(dateStr);
      var dateDisplay;
      if (state.scheduleMode === "weekly") {
        dateDisplay = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
      } else {
        dateDisplay = new Date(dateStr + "T12:00:00Z").toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
          timeZone: "UTC",
        });
      }

      html += '<div class="slot-item" data-date="' + dateStr + '">';
      html += '<span class="slot-date">' + dateDisplay + "</span>";

      if (state.pollType === "datetime") {
        html += '<div class="slot-times">';
        const sortedTimes = [...times].sort();
        for (const time of sortedTimes) {
          html += '<div class="slot-time-entry">';
          html += '<input type="time" class="input input-time slot-time-input" value="' + time + '" data-date="' + dateStr + '" data-old-time="' + time + '" />';
          html += '<button type="button" class="btn-icon remove-time" data-date="' + dateStr + '" data-time="' + time + '" aria-label="Remove time">&times;</button>';
          html += "</div>";
        }
        html += '<button type="button" class="btn-link add-time" data-date="' + dateStr + '">+ Add time</button>';
        html += "</div>";
      }

      html += '<button type="button" class="btn-icon remove-date" data-date="' + dateStr + '" aria-label="Remove date">&times;</button>';
      html += "</div>";
    }
    html += "</div>";

    selectedSlotsContainer.innerHTML = html;

    // Event listeners for time management
    for (const btn of selectedSlotsContainer.querySelectorAll(".remove-date")) {
      btn.addEventListener("click", function () {
        state.selectedSlots.delete(this.dataset.date);
        renderCalendar();
        renderSelectedSlots();
      });
    }

    for (const btn of selectedSlotsContainer.querySelectorAll(".remove-time")) {
      btn.addEventListener("click", function () {
        const times = state.selectedSlots.get(this.dataset.date);
        if (times) {
          times.delete(this.dataset.time);
          if (times.size === 0) {
            // Keep the date, add back a default time
            times.add(defaultTimeInput ? defaultTimeInput.value : "10:00");
          }
        }
        renderSelectedSlots();
      });
    }

    for (const btn of selectedSlotsContainer.querySelectorAll(".add-time")) {
      btn.addEventListener("click", function () {
        const times = state.selectedSlots.get(this.dataset.date);
        if (times) {
          // Find a time that's not already used, default to next hour
          let hour = 10;
          for (let h = 8; h < 22; h++) {
            const t = String(h).padStart(2, "0") + ":00";
            if (!times.has(t)) {
              hour = h;
              break;
            }
          }
          times.add(String(hour).padStart(2, "0") + ":00");
        }
        renderSelectedSlots();
      });
    }

    for (const input of selectedSlotsContainer.querySelectorAll(".slot-time-input")) {
      input.addEventListener("change", function () {
        const times = state.selectedSlots.get(this.dataset.date);
        if (times) {
          times.delete(this.dataset.oldTime);
          times.add(this.value);
          this.dataset.oldTime = this.value;
        }
        updateFormInputs();
      });
    }

    updateFormInputs();
  }

  // --- Sync hidden form inputs ---
  function updateFormInputs() {
    // Remove old hidden inputs
    for (const el of form.querySelectorAll(".slot-hidden-input")) {
      el.remove();
    }

    const sortedDates = [...state.selectedSlots.keys()].sort();
    for (const dateStr of sortedDates) {
      const times = state.selectedSlots.get(dateStr);

      if (state.pollType === "date" || times.size === 0) {
        addHiddenInput("slot_date", dateStr);
        addHiddenInput("slot_time", "");
      } else {
        const sortedTimes = [...times].sort();
        for (const time of sortedTimes) {
          addHiddenInput("slot_date", dateStr);
          addHiddenInput("slot_time", time);
        }
      }
    }
  }

  function addHiddenInput(name, value) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    input.className = "slot-hidden-input";
    form.appendChild(input);
  }

  // --- Apply default time ---
  if (applyDefaultTimeBtn && defaultTimeInput) {
    applyDefaultTimeBtn.addEventListener("click", function () {
      const time = defaultTimeInput.value;
      for (const [date, times] of state.selectedSlots) {
        times.clear();
        times.add(time);
      }
      renderSelectedSlots();
    });
  }

  // --- Duration custom toggle ---
  function initDuration() {
    if (!durationSelect) return;

    durationSelect.addEventListener("change", function () {
      if (customDurationDiv) {
        if (this.value === "custom") { customDurationDiv.classList.remove("hidden"); customDurationDiv.classList.add("d-flex"); } else { customDurationDiv.classList.add("hidden"); customDurationDiv.classList.remove("d-flex"); }
      }
      // Sync a hidden input for the custom value
      if (this.value === "custom" && customDurationInput) {
        customDurationInput.name = "custom_duration";
      }
    });

    if (customDurationInput) {
      customDurationInput.name = "custom_duration";
    }
  }

  // --- Template pre-population ---
  function applyTemplate() {
    var raw = form.getAttribute("data-template");
    if (!raw) return;
    var tpl;
    try { tpl = JSON.parse(raw); } catch (e) { return; }

    // Title, description, link
    var titleEl = document.getElementById("title");
    var descEl = document.getElementById("description");
    var linkEl = document.getElementById("link");
    if (titleEl && tpl.title) titleEl.value = tpl.title;
    if (descEl && tpl.description) descEl.value = tpl.description;
    if (linkEl && tpl.link) linkEl.value = tpl.link;

    // Timezone
    if (tpl.timezone && timezoneSelect) {
      timezoneSelect.value = tpl.timezone;
      if (timezoneSearch) timezoneSearch.value = tpl.timezone.replace(/_/g, " ");
    }

    // Schedule mode
    if (tpl.schedule_mode) {
      var modeRadio = document.querySelector('input[name="schedule_mode"][value="' + tpl.schedule_mode + '"]');
      if (modeRadio) {
        modeRadio.checked = true;
        state.scheduleMode = tpl.schedule_mode;
        if (tpl.schedule_mode === "weekly") {
          calendarContainer.classList.add("hidden");
          if (weekdayContainer) weekdayContainer.classList.remove("hidden");
        }
      }
    }

    // Poll type
    if (tpl.poll_type) {
      var typeRadio = document.querySelector('input[name="poll_type"][value="' + tpl.poll_type + '"]');
      if (typeRadio) {
        typeRadio.checked = true;
        state.pollType = tpl.poll_type;
        if (tpl.poll_type === "date") {
          if (defaultTimeGroup) defaultTimeGroup.classList.add("hidden");
          if (durationGroup) durationGroup.classList.add("hidden");
        }
      }
    }

    // Duration
    if (tpl.duration && durationSelect) {
      var found = false;
      for (var i = 0; i < durationSelect.options.length; i++) {
        if (durationSelect.options[i].value === String(tpl.duration)) {
          durationSelect.value = String(tpl.duration);
          found = true;
          break;
        }
      }
      if (!found) {
        durationSelect.value = "custom";
        if (customDurationDiv) { customDurationDiv.classList.remove("hidden"); customDurationDiv.classList.add("d-flex"); }
        if (customDurationInput) {
          customDurationInput.value = tpl.duration;
          customDurationInput.name = "custom_duration";
        }
      }
    }

    // Hidden responses
    var hiddenCheck = document.querySelector('input[name="responses_hidden"]');
    if (hiddenCheck && tpl.responses_hidden) {
      hiddenCheck.checked = true;
    }

    // Pre-populate slots
    if (tpl.slots && tpl.slots.length > 0) {
      for (var s = 0; s < tpl.slots.length; s++) {
        var slot = tpl.slots[s];
        var key = slot.date;
        if (!state.selectedSlots.has(key)) {
          state.selectedSlots.set(key, new Set());
        }
        if (slot.start_time && tpl.poll_type === "datetime") {
          state.selectedSlots.get(key).add(slot.start_time);
        }
      }
    }

    // Re-render everything
    if (state.scheduleMode === "weekly") {
      renderWeekdayPicker();
    } else {
      // Navigate calendar to the first slot's month if it's a specific date
      var firstSlot = tpl.slots && tpl.slots[0];
      if (firstSlot && firstSlot.date && /^\d{4}-\d{2}-\d{2}$/.test(firstSlot.date)) {
        var parts = firstSlot.date.split("-");
        state.currentYear = parseInt(parts[0], 10);
        state.currentMonth = parseInt(parts[1], 10) - 1;
      }
      renderCalendar();
    }
    renderSelectedSlots();
  }

  // --- Init ---
  initTimezones();
  initScheduleModeToggle();
  initPollTypeToggle();
  initDuration();
  renderCalendar();
  renderSelectedSlots();
  applyTemplate();
})();

// poll-create.js — Calendar picker, timezone selector, slot management

(function () {
  "use strict";

  // --- State ---
  const state = {
    selectedSlots: new Map(), // "YYYY-MM-DD" -> Set of "HH:MM" strings (or empty set for date-only)
    currentMonth: new Date().getMonth(),
    currentYear: new Date().getFullYear(),
    pollType: "datetime",
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
          defaultTimeGroup.style.display = isDatetime ? "" : "none";
        }
        if (durationGroup) {
          durationGroup.style.display = isDatetime ? "" : "none";
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

  // --- Calendar rendering ---
  function renderCalendar() {
    const year = state.currentYear;
    const month = state.currentMonth;

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDow = (firstDay.getDay() + 6) % 7; // Monday = 0
    const daysInMonth = lastDay.getDate();

    const monthName = firstDay.toLocaleDateString("en-US", { month: "long", year: "numeric" });

    let html = '<div class="calendar">';
    html += '<div class="calendar-nav">';
    html += '<button type="button" class="cal-prev" aria-label="Previous month">&lsaquo;</button>';
    html += '<span class="cal-month">' + monthName + "</span>";
    html += '<button type="button" class="cal-next" aria-label="Next month">&rsaquo;</button>';
    html += "</div>";

    html += '<div class="calendar-grid">';
    const dayNames = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
    for (const d of dayNames) {
      html += '<div class="cal-header">' + d + "</div>";
    }

    // Empty cells before first day
    for (let i = 0; i < startDow; i++) {
      html += '<div class="cal-empty"></div>';
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const dateObj = new Date(year, month, day);
      const isPast = dateObj < today;
      const isSelected = state.selectedSlots.has(dateStr);
      const isToday = dateObj.getTime() === today.getTime();

      let cls = "cal-day";
      if (isPast) cls += " cal-past";
      if (isSelected) cls += " cal-selected";
      if (isToday) cls += " cal-today";

      html += '<button type="button" class="' + cls + '" data-date="' + dateStr + '"';
      if (isPast) html += " disabled";
      html += ">" + day + "</button>";
    }

    html += "</div></div>";
    calendarContainer.innerHTML = html;

    // Event listeners
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

    for (const btn of calendarContainer.querySelectorAll(".cal-day:not([disabled])")) {
      btn.addEventListener("click", function () {
        toggleDate(this.dataset.date);
      });
    }
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

    // Sort dates
    const sortedDates = [...state.selectedSlots.keys()].sort();

    let html = '<div class="slot-list">';
    for (const dateStr of sortedDates) {
      const times = state.selectedSlots.get(dateStr);
      const dateDisplay = new Date(dateStr + "T12:00:00Z").toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      });

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
        customDurationDiv.style.display = this.value === "custom" ? "flex" : "none";
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

  // --- Init ---
  initTimezones();
  initPollTypeToggle();
  initDuration();
  renderCalendar();
  renderSelectedSlots();
})();

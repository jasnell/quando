// poll-respond.js — Response grid toggling, view toggle, local timezone display

(function () {
  "use strict";

  // --- Timezone opt-in ---
  var tzInput = document.getElementById("respondent-timezone");
  var tzCheckbox = document.getElementById("share-tz-checkbox");
  var tzNameLabel = document.getElementById("share-tz-name");
  var detectedTz = "";
  try {
    detectedTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch (e) {}

  if (tzNameLabel && detectedTz) {
    tzNameLabel.textContent = "(" + detectedTz.replace(/_/g, " ") + ")";
  }
  if (tzCheckbox && tzInput) {
    // Set initial value based on checkbox state
    if (tzCheckbox.checked && detectedTz) {
      tzInput.value = detectedTz;
    } else {
      tzInput.value = "";
    }
    // Toggle on change
    tzCheckbox.addEventListener("change", function () {
      tzInput.value = this.checked ? detectedTz : "";
    });
  }

  // --- Shared: sync a slot's value across both views ---
  function syncSlotValue(slotId, value) {
    var labels = { yes: "\u2713", no: "\u2717", maybe: "?" };

    // Update table-view toggle button
    var tableBtn = document.querySelector('.view-table .toggle-btn[data-slot-id="' + slotId + '"]');
    if (tableBtn) {
      tableBtn.dataset.value = value;
      tableBtn.textContent = labels[value];
      tableBtn.className = "toggle-btn value-" + value;
      // Update aria-label: replace the value portion after the last colon
      var currentLabel = tableBtn.getAttribute("aria-label") || "";
      var colonIdx = currentLabel.lastIndexOf(":");
      if (colonIdx !== -1) {
        tableBtn.setAttribute("aria-label", currentLabel.substring(0, colonIdx + 1) + " " + value);
      }
    }

    // Update hidden input (lives in the table view)
    var hidden = document.querySelector('input[name="slot_' + slotId + '"]');
    if (hidden) hidden.value = value;

    // Update list-view option buttons
    var listBtns = document.querySelectorAll('.view-list .respond-opt[data-slot-id="' + slotId + '"]');
    for (var i = 0; i < listBtns.length; i++) {
      var btn = listBtns[i];
      var isActive = btn.dataset.opt === value;
      if (isActive) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
      btn.setAttribute("aria-pressed", isActive ? "true" : "false");
    }
  }

  // --- Table view: cycle toggle buttons ---
  var cycle = ["no", "yes", "maybe"];

  for (var btn of document.querySelectorAll(".toggle-btn")) {
    btn.addEventListener("click", function () {
      var current = this.dataset.value;
      var idx = cycle.indexOf(current);
      var next = cycle[(idx + 1) % cycle.length];
      syncSlotValue(this.dataset.slotId, next);
    });
  }

  // --- Keyboard navigation for table view ---
  var toggleBtnsAll = document.querySelectorAll(".respond-input .toggle-btn");
  if (toggleBtnsAll.length > 0) {
    // Build ordered array for arrow-key navigation
    var btnArray = Array.prototype.slice.call(toggleBtnsAll);

    function focusBtn(idx) {
      if (idx < 0 || idx >= btnArray.length) return;
      // Roving tabindex: deactivate old, activate new
      for (var i = 0; i < btnArray.length; i++) {
        btnArray[i].setAttribute("tabindex", "-1");
      }
      btnArray[idx].setAttribute("tabindex", "0");
      btnArray[idx].focus();
    }

    for (var b = 0; b < btnArray.length; b++) {
      btnArray[b].addEventListener("keydown", function (e) {
        var idx = btnArray.indexOf(this);
        switch (e.key) {
          case "ArrowRight":
          case "ArrowDown":
            e.preventDefault();
            focusBtn(idx + 1);
            break;
          case "ArrowLeft":
          case "ArrowUp":
            e.preventDefault();
            focusBtn(idx - 1);
            break;
          case "Home":
            e.preventDefault();
            focusBtn(0);
            break;
          case "End":
            e.preventDefault();
            focusBtn(btnArray.length - 1);
            break;
          case "y":
          case "Y":
            e.preventDefault();
            syncSlotValue(this.dataset.slotId, "yes");
            break;
          case "n":
          case "N":
            e.preventDefault();
            syncSlotValue(this.dataset.slotId, "no");
            break;
          case "?":
          case "m":
          case "M":
            e.preventDefault();
            syncSlotValue(this.dataset.slotId, "maybe");
            break;
        }
      });
    }
  }

  // --- List view: explicit yes/maybe/no buttons + keyboard nav ---
  var respondCards = document.querySelectorAll(".respond-card[data-slot-id]");

  function focusCard(idx) {
    if (idx < 0 || idx >= respondCards.length) return;
    // Focus the active (or first) button in the target card
    var active = respondCards[idx].querySelector(".respond-opt.active") || respondCards[idx].querySelector(".respond-opt");
    if (active) active.focus();
  }

  for (var optBtn of document.querySelectorAll(".respond-opt")) {
    optBtn.addEventListener("click", function () {
      syncSlotValue(this.dataset.slotId, this.dataset.opt);
    });

    optBtn.addEventListener("keydown", function (e) {
      var card = this.closest(".respond-card[data-slot-id]");
      var slotId = card ? card.dataset.slotId : this.dataset.slotId;
      var cardIdx = Array.prototype.indexOf.call(respondCards, card);

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          focusCard(cardIdx + 1);
          break;
        case "ArrowUp":
          e.preventDefault();
          focusCard(cardIdx - 1);
          break;
        case "y":
        case "Y":
          e.preventDefault();
          syncSlotValue(slotId, "yes");
          break;
        case "n":
        case "N":
          e.preventDefault();
          syncSlotValue(slotId, "no");
          break;
        case "?":
        case "m":
        case "M":
          e.preventDefault();
          syncSlotValue(slotId, "maybe");
          break;
      }
    });
  }

  // --- View toggle ---
  var viewToggle = document.getElementById("view-toggle");
  if (viewToggle) {
    var toggleBtns = viewToggle.querySelectorAll(".view-toggle-btn");

    function setView(view) {
      var tables = document.querySelectorAll(".view-table");
      var lists = document.querySelectorAll(".view-list");

      for (var i = 0; i < tables.length; i++) {
        if (view === "table") { tables[i].classList.remove("hidden"); } else { tables[i].classList.add("hidden"); }
      }
      for (var i = 0; i < lists.length; i++) {
        if (view === "list") { lists[i].classList.remove("hidden"); } else { lists[i].classList.add("hidden"); }
      }

      for (var i = 0; i < toggleBtns.length; i++) {
        var isActive = toggleBtns[i].dataset.view === view;
        if (isActive) {
          toggleBtns[i].classList.add("active");
        } else {
          toggleBtns[i].classList.remove("active");
        }
        toggleBtns[i].setAttribute("aria-pressed", isActive ? "true" : "false");
      }

      try {
        localStorage.setItem("quando-view", view);
      } catch (e) {}
    }

    for (var i = 0; i < toggleBtns.length; i++) {
      toggleBtns[i].addEventListener("click", function () {
        setView(this.dataset.view);
      });
    }

    // Restore saved preference
    try {
      var saved = localStorage.getItem("quando-view");
      if (saved === "list" || saved === "table") {
        setView(saved);
      }
    } catch (e) {}
  }

  // --- Confirm buttons ---
  for (var btn of document.querySelectorAll("[data-confirm]")) {
    btn.addEventListener("click", function (e) {
      if (!confirm(this.dataset.confirm)) {
        e.preventDefault();
      }
    });
  }

  // --- Local timezone display ---

  // Convert a wall-clock date+time in a given timezone to a correct UTC Date.
  // e.g. wallClockToUTC("2026-08-03", "09:00", "America/New_York") returns the
  // Date representing 9:00 AM EDT (which is 13:00 UTC), not 9:00 AM in the
  // browser's local timezone.
  function wallClockToUTC(isoDate, time, timezone) {
    // Start with a UTC guess: treat the wall-clock time as if it were UTC
    var utcGuess = new Date(isoDate + "T" + time + ":00Z");

    // Format that UTC instant in the target timezone to see what wall-clock
    // time it maps to there
    var parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      minute: "2-digit",
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(utcGuess);

    var get = function (type) {
      var p = parts.find(function (p) { return p.type === type; });
      return p ? p.value : "00";
    };

    // Build a UTC Date from what the timezone thinks the wall-clock time is
    var tzWall = new Date(
      get("year") + "-" + get("month") + "-" + get("day") +
      "T" + String(get("hour")).padStart(2, "0") + ":" + get("minute") + ":00Z"
    );

    // The difference is the timezone's UTC offset at that instant.
    // Subtract it so that formatting the result in the target timezone
    // yields the originally desired wall-clock time.
    var offsetMs = tzWall.getTime() - utcGuess.getTime();
    return new Date(utcGuess.getTime() - offsetMs);
  }

  function formatLocalTime(dateObj, tz) {
    return dateObj.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: tz,
      timeZoneName: "short",
    });
  }

  function showLocalTimezones() {
    var localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

    // Table view grids
    var grids = document.querySelectorAll(".response-grid");
    for (var g = 0; g < grids.length; g++) {
      var grid = grids[g];
      var pollTz = grid.dataset.timezone;
      var pollType = grid.dataset.pollType;
      var duration = parseInt(grid.dataset.duration, 10) || 0;

      if (!pollTz || pollType === "date" || localTz === pollTz) continue;

      var headers = grid.querySelectorAll("th[data-date]");
      for (var h = 0; h < headers.length; h++) {
        populateLocalTime(headers[h].querySelector(".slot-local-time"), headers[h].dataset.date, headers[h].dataset.time, pollTz, localTz, duration);
      }
    }

    // List view cards
    var cardEls = document.querySelectorAll(".slot-card-local-time");
    for (var c = 0; c < cardEls.length; c++) {
      var el = cardEls[c];
      var parent = el.closest("[data-date]");
      if (!parent) continue;
      var pollTz = el.dataset.timezone;
      var pollType = el.dataset.pollType;
      var duration = parseInt(el.dataset.duration, 10) || 0;
      if (!pollTz || pollType === "date" || localTz === pollTz) continue;
      populateLocalTime(el, parent.dataset.date, parent.dataset.time, pollTz, localTz, duration);
    }
  }

  function populateLocalTime(el, date, time, pollTz, localTz, duration) {
    if (!el || !date || !time) return;

    // For weekly polls, date is a day name — use a reference Monday (2026-01-05) + offset
    var weekdayOffsets = { monday: 0, tuesday: 1, wednesday: 2, thursday: 3, friday: 4, saturday: 5, sunday: 6 };
    var isoDate = date;
    if (weekdayOffsets[date] !== undefined) {
      var refDay = 5 + weekdayOffsets[date]; // 2026-01-05 is a Monday
      isoDate = "2026-01-" + String(refDay).padStart(2, "0");
    }

    // Resolve the wall-clock time in the poll's timezone to a correct UTC instant
    var startObj = wallClockToUTC(isoDate, time, pollTz);
    var localStart = formatLocalTime(startObj, localTz);
    var pollStart = formatLocalTime(startObj, pollTz);

    if (localStart !== pollStart) {
      var label = localStart;
      if (duration > 0) {
        var endObj = new Date(startObj.getTime() + duration * 60000);
        var localEnd = endObj.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          timeZone: localTz,
        });
        label = localStart + "\u2013" + localEnd;
      }
      el.textContent = label;
      el.title = "Your local time (" + localTz.replace(/_/g, " ") + ")";
    }
  }

  // --- Copy as Markdown ---
  var copyBtn = document.getElementById("copy-markdown-btn");
  var mdSource = document.getElementById("markdown-source");
  if (copyBtn && mdSource) {
    // Fix the poll URL placeholder in the markdown
    var md = mdSource.value.replace("[View poll]()", "[View poll](" + window.location.href + ")");
    mdSource.value = md;

    copyBtn.addEventListener("click", function () {
      navigator.clipboard.writeText(mdSource.value).then(
        function () {
          var original = copyBtn.textContent;
          copyBtn.textContent = "Copied!";
          setTimeout(function () {
            copyBtn.textContent = original;
          }, 2000);
        },
        function () {
          // Fallback: select the textarea
          mdSource.classList.remove("sr-only");
          mdSource.select();
          mdSource.classList.add("sr-only");
        }
      );
    });
  }

  // --- Share URL ---
  var shareInput = document.getElementById("share-url");
  if (shareInput) {
    shareInput.value = window.location.origin + shareInput.value;
    shareInput.addEventListener("click", function () {
      this.select();
    });
  }

  showLocalTimezones();
})();

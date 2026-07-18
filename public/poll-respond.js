// poll-respond.js — Response grid toggling, view toggle, local timezone display

(function () {
  "use strict";

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

  // --- List view: explicit yes/maybe/no buttons ---
  for (var optBtn of document.querySelectorAll(".respond-opt")) {
    optBtn.addEventListener("click", function () {
      syncSlotValue(this.dataset.slotId, this.dataset.opt);
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
        tables[i].style.display = view === "table" ? "" : "none";
      }
      for (var i = 0; i < lists.length; i++) {
        lists[i].style.display = view === "list" ? "" : "none";
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

    var startObj = new Date(date + "T" + time + ":00");
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

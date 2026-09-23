const form = document.getElementById("bookingForm");
const status = document.getElementById("formStatus");
const submitButton = form.querySelector('button[type="submit"]');
const dateField = form.elements.date;
const phoneField = form.elements.phone;
const emailField = form.elements.email;
const attendanceField = form.elements.attendance;

// Keep the public Event Type choices aligned with the booking CRM lists.\nconst eventTypeField = form.elements.eventType;\nif (eventTypeField) {\n  const eventTypes = ["Wedding", "Corporate", "Private Party", "Festival", "Birthday", "Nonprofit", "Holiday Party", "Concert", "Other"];\n  eventTypeField.replaceChildren(...eventTypes.map(value => {\n    const option = document.createElement("option");\n    option.value = value;\n    option.textContent = value;\n    return option;\n  }));\n  eventTypeField.value = "Private Party";\n}\n
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function setStatus(message, isError = false) {
  status.textContent = message;
  status.dataset.state = isError ? "error" : "success";
}

function validateForm() {
  const phoneDigits = phoneField.value.replace(/\D/g, "");

  if (!emailPattern.test(emailField.value.trim())) {
    emailField.setCustomValidity("Enter a valid email address, such as name@example.com.");
    emailField.reportValidity();
    emailField.focus();
    return false;
  }
  emailField.setCustomValidity("");

  if (phoneDigits.length !== 10) {
    phoneField.setCustomValidity("Enter a 10-digit U.S. phone number.");
    phoneField.reportValidity();
    phoneField.focus();
    return false;
  }
  phoneField.setCustomValidity("");

  const today = new Date();
  const localToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const selectedDate = new Date(dateField.value + "T00:00:00");

  if (!dateField.value || Number.isNaN(selectedDate.getTime()) || selectedDate < localToday) {
    dateField.setCustomValidity("Choose today or a future event date.");
    dateField.reportValidity();
    dateField.focus();
    return false;
  }
  dateField.setCustomValidity("");

  const attendance = Number(attendanceField.value);
  if (!Number.isInteger(attendance) || attendance < 1) {
    attendanceField.setCustomValidity("Enter a positive whole number.");
    attendanceField.reportValidity();
    attendanceField.focus();
    return false;
  }
  attendanceField.setCustomValidity("");

  return form.checkValidity();
}

phoneField.addEventListener("input", () => {
  const digits = phoneField.value.replace(/\D/g, "").slice(0, 10);
  phoneField.value = digits.length > 6
    ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
    : digits.length > 3
      ? `(${digits.slice(0, 3)}) ${digits.slice(3)}`
      : digits;
  phoneField.setCustomValidity("");
});

emailField.addEventListener("input", () => emailField.setCustomValidity(""));
dateField.addEventListener("input", () => dateField.setCustomValidity(""));
attendanceField.addEventListener("input", () => attendanceField.setCustomValidity(""));

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("");

  if (!validateForm()) return;

  const data = Object.fromEntries(new FormData(form).entries());

  submitButton.disabled = true;
  submitButton.setAttribute("aria-busy", "true");
  submitButton.querySelector("span").textContent = "…";
  setStatus("Sending your booking inquiry…");

  try {
    const response = await fetch("/api/booking", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok || !result.ok) {
      throw new Error(result.error || "We couldn't send your inquiry.");
    }

    form.reset();
    setStatus("Inquiry sent — thanks. We'll get back to you soon.");
  } catch (error) {
    console.error(error);
    setStatus(error.message || "We couldn't send your inquiry. Please try again.", true);
  } finally {
    submitButton.disabled = false;
    submitButton.removeAttribute("aria-busy");
    submitButton.querySelector("span").textContent = "↗";
  }
});

/* ------------------------------------------------------------
   BLK DMND custom Apple-style date + time pickers
   Replaces native browser date/time popovers with a consistent
   touch-friendly picker that matches the site's dark aesthetic.
------------------------------------------------------------- */

(function setupBookingPickers() {
  const dateSource = form.elements.date;
  const timeSource = form.elements.time;

  if (!dateSource || !timeSource) return;

  injectPickerStyles();

  const dateVisual = replaceWithPickerInput(dateSource, {
    type: "date",
    placeholder: "Select a date",
    ariaLabel: "Choose event date"
  });

  const timeVisual = replaceWithPickerInput(timeSource, {
    type: "time",
    placeholder: "Select a start time",
    ariaLabel: "Choose start time"
  });

  const picker = createPickerShell();

  let activeType = null;
  let lastFocused = null;
  let dateView = getTodayParts();
  let draftTime = "";

  const weekdayNames = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const monthNames = [
    "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
    "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"
  ];

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function getTodayParts() {
    const today = new Date();
    return {
      year: today.getFullYear(),
      month: today.getMonth(),
      day: today.getDate()
    };
  }

  function todayIso() {
    const t = getTodayParts();
    return `${t.year}-${pad(t.month + 1)}-${pad(t.day)}`;
  }

  function prettyDate(iso) {
    if (!iso) return "";
    const [year, month, day] = iso.split("-").map(Number);
    if (!year || !month || !day) return "";
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric"
    }).format(new Date(year, month - 1, day));
  }

  function prettyTime(value) {
    if (!value) return "";
    const [hours, minutes] = value.split(":").map(Number);
    if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return "";
    const period = hours >= 12 ? "PM" : "AM";
    const displayHour = hours % 12 || 12;
    return `${displayHour}:${pad(minutes)} ${period}`;
  }

  function parseStoredDate() {
    const value = dateSource.value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [year, month, day] = value.split("-").map(Number);
    return { year, month: month - 1, day };
  }

  function parseStoredTime() {
    const value = timeSource.value;
    if (!/^\d{2}:\d{2}$/.test(value)) return null;
    const [hours, minutes] = value.split(":").map(Number);
    const period = hours >= 12 ? "PM" : "AM";
    const hour12 = hours % 12 || 12;
    return { hour12, minutes, period };
  }

  function updateVisuals() {
    dateVisual.value = prettyDate(dateSource.value);
    timeVisual.value = prettyTime(timeSource.value);
  }

  function clearPickerValidity(source, visual) {
    source.setCustomValidity("");
    visual.setCustomValidity("");
  }

  function setDate(value) {
    const minimum = todayIso();
    if (value < minimum) return;
    dateSource.value = value;
    dateVisual.value = prettyDate(value);
    clearPickerValidity(dateSource, dateVisual);
    dateSource.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function setTime(hours, minutes) {
    const value = `${pad(hours)}:${pad(minutes)}`;
    timeSource.value = value;
    timeVisual.value = prettyTime(value);
    clearPickerValidity(timeSource, timeVisual);
    timeSource.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function closePicker() {
    if (!picker.backdrop.classList.contains("is-open")) return;
    picker.backdrop.classList.remove("is-open");
    picker.backdrop.setAttribute("aria-hidden", "true");
    document.body.classList.remove("blk-picker-open");
    activeType = null;
    if (lastFocused) lastFocused.focus({ preventScroll: true });
  }

  function openPicker(type, sourceVisual) {
    activeType = type;
    lastFocused = sourceVisual;
    picker.dialog.replaceChildren();

    if (type === "date") {
      const stored = parseStoredDate();
      const today = getTodayParts();
      const chosen = stored || today;
      dateView = { year: chosen.year, month: chosen.month, day: chosen.day };
      picker.title.textContent = "CHOOSE EVENT DATE";
      renderDatePicker();
    } else {
      picker.title.textContent = "CHOOSE START TIME";
      renderTimePicker();
    }

    picker.backdrop.classList.add("is-open");
    picker.backdrop.setAttribute("aria-hidden", "false");
    document.body.classList.add("blk-picker-open");

    requestAnimationFrame(() => {
      const focusTarget = picker.dialog.querySelector("button:not([disabled]), input, [tabindex='0']");
      if (focusTarget) focusTarget.focus();
    });
  }

  function renderDatePicker() {
    picker.dialog.replaceChildren(picker.head);

    const nav = document.createElement("div");
    nav.className = "blk-picker-calendar-nav";

    const prev = document.createElement("button");
    prev.type = "button";
    prev.className = "blk-picker-nav-btn";
    prev.setAttribute("aria-label", "Previous month");
    prev.innerHTML = "‹";
    prev.disabled = isCurrentMonth(dateView.year, dateView.month);
    prev.addEventListener("click", () => {
      if (prev.disabled) return;
      dateView.month -= 1;
      if (dateView.month < 0) {
        dateView.month = 11;
        dateView.year -= 1;
      }
      renderDatePicker();
    });

    const label = document.createElement("div");
    label.className = "blk-picker-month";
    label.innerHTML = `<strong>${monthNames[dateView.month]}</strong><span>${dateView.year}</span>`;

    const next = document.createElement("button");
    next.type = "button";
    next.className = "blk-picker-nav-btn";
    next.setAttribute("aria-label", "Next month");
    next.innerHTML = "›";
    next.addEventListener("click", () => {
      dateView.month += 1;
      if (dateView.month > 11) {
        dateView.month = 0;
        dateView.year += 1;
      }
      renderDatePicker();
    });

    nav.append(prev, label, next);
    picker.dialog.append(nav);

    const weekdays = document.createElement("div");
    weekdays.className = "blk-picker-weekdays";
    weekdayNames.forEach(name => {
      const el = document.createElement("span");
      el.textContent = name;
      weekdays.appendChild(el);
    });
    picker.dialog.append(weekdays);

    const grid = document.createElement("div");
    grid.className = "blk-picker-calendar-grid";

    const firstDay = new Date(dateView.year, dateView.month, 1).getDay();
    const daysInMonth = new Date(dateView.year, dateView.month + 1, 0).getDate();
    const selected = dateSource.value;
    const minimum = todayIso();

    for (let i = 0; i < firstDay; i++) {
      const blank = document.createElement("span");
      blank.className = "blk-picker-day is-empty";
      blank.setAttribute("aria-hidden", "true");
      grid.appendChild(blank);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const iso = `${dateView.year}-${pad(dateView.month + 1)}-${pad(day)}`;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "blk-picker-day";
      button.textContent = String(day);

      const isToday = iso === minimum;
      const isSelected = iso === selected;

      if (isToday) button.classList.add("is-today");
      if (isSelected) button.classList.add("is-selected");
      if (iso < minimum) {
        button.disabled = true;
        button.classList.add("is-disabled");
      }

      button.setAttribute("aria-label", prettyDate(iso));
      if (isSelected) button.setAttribute("aria-current", "date");

      button.addEventListener("click", () => {
        setDate(iso);
        closePicker();
      });

      grid.appendChild(button);
    }

    picker.dialog.append(grid);

    const footer = document.createElement("div");
    footer.className = "blk-picker-footer";

    const todayButton = document.createElement("button");
    todayButton.type = "button";
    todayButton.className = "blk-picker-secondary";
    todayButton.textContent = "TODAY";
    todayButton.addEventListener("click", () => {
      const t = getTodayParts();
      dateView = { year: t.year, month: t.month, day: t.day };
      setDate(todayIso());
      closePicker();
    });

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "blk-picker-secondary";
    cancel.textContent = "CANCEL";
    cancel.addEventListener("click", closePicker);

    footer.append(todayButton, cancel);
    picker.dialog.append(footer);
  }

  function isCurrentMonth(year, month) {
    const t = getTodayParts();
    return year === t.year && month === t.month;
  }

  function renderTimePicker() {
    const stored = parseStoredTime() || {
      hour12: 6,
      minutes: 0,
      period: "PM"
    };

    const headline = document.createElement("div");
    headline.className = "blk-picker-time-display";
    headline.innerHTML = `<strong id="blkTimeDisplay">${prettyTime(timeSource.value) || "6:00 PM"}</strong><span>Scroll each wheel into place</span>`;
    picker.dialog.appendChild(headline);

    const wheels = document.createElement("div");
    wheels.className = "blk-picker-wheels";

    const hourWheel = buildWheel(
      "Hour",
      Array.from({ length: 12 }, (_, i) => i + 1),
      stored.hour12,
      value => {
        stored.hour12 = Number(value);
        updateTimeHeadline();
      }
    );

    const minuteWheel = buildWheel(
      "Minute",
      Array.from({ length: 60 }, (_, i) => i),
      stored.minutes,
      value => {
        stored.minutes = Number(value);
        updateTimeHeadline();
      },
      value => pad(value)
    );

    const periodWheel = buildWheel(
      "AM/PM",
      ["AM", "PM"],
      stored.period,
      value => {
        stored.period = value;
        updateTimeHeadline();
      }
    );

    wheels.append(hourWheel.container, minuteWheel.container, periodWheel.container);
    picker.dialog.appendChild(wheels);

    const footer = document.createElement("div");
    footer.className = "blk-picker-footer";

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "blk-picker-secondary";
    cancel.textContent = "CANCEL";
    cancel.addEventListener("click", closePicker);

    const done = document.createElement("button");
    done.type = "button";
    done.className = "blk-picker-primary";
    done.textContent = "DONE";
    done.addEventListener("click", () => {
      let hours24 = stored.hour12 % 12;
      if (stored.period === "PM") hours24 += 12;
      setTime(hours24, stored.minutes);
      closePicker();
    });

    footer.append(cancel, done);
    picker.dialog.appendChild(footer);

    requestAnimationFrame(() => {
      hourWheel.scrollToValue(stored.hour12);
      minuteWheel.scrollToValue(stored.minutes);
      periodWheel.scrollToValue(stored.period);
      updateTimeHeadline();
    });

    function updateTimeHeadline() {
      let hours24 = stored.hour12 % 12;
      if (stored.period === "PM") hours24 += 12;
      const display = `${stored.hour12}:${pad(stored.minutes)} ${stored.period}`;
      const headlineTarget = headline.querySelector("#blkTimeDisplay");
      headlineTarget.textContent = display;
      draftTime = `${pad(hours24)}:${pad(stored.minutes)}`;
    }
  }

  function buildWheel(labelText, values, selectedValue, onValueChange, formatter = value => String(value)) {
    const wrapper = document.createElement("div");
    wrapper.className = "blk-wheel-column";

    const label = document.createElement("div");
    label.className = "blk-wheel-label";
    label.textContent = labelText.toUpperCase();

    const wheel = document.createElement("div");
    wheel.className = "blk-picker-wheel";
    wheel.setAttribute("role", "listbox");
    wheel.setAttribute("aria-label", labelText);

    const spacerTop = document.createElement("div");
    spacerTop.className = "blk-wheel-spacer";

    const spacerBottom = document.createElement("div");
    spacerBottom.className = "blk-wheel-spacer";

    wheel.appendChild(spacerTop);

    values.forEach(value => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "blk-wheel-item";
      button.textContent = formatter(value);
      button.dataset.value = String(value);
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", String(String(value) === String(selectedValue)));
      button.addEventListener("click", () => {
        wheel.scrollTo({ top: valueIndex(value, values) * 44, behavior: "smooth" });
      });
      wheel.appendChild(button);
    });

    wheel.appendChild(spacerBottom);

    let scrollTimer;
    wheel.addEventListener("scroll", () => {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        const index = Math.max(
          0,
          Math.min(values.length - 1, Math.round(wheel.scrollTop / 44))
        );
        const value = values[index];
        wheel.querySelectorAll(".blk-wheel-item").forEach((item, i) => {
          const active = i === index;
          item.setAttribute("aria-selected", String(active));
          item.classList.toggle("is-active", active);
        });
        onValueChange(value);
      }, 40);
    });

    wrapper.append(label, wheel);

    function scrollToValue(value) {
      const index = valueIndex(value, values);
      wheel.scrollTop = index * 44;
      wheel.querySelectorAll(".blk-wheel-item").forEach((item, i) => {
        const active = i === index;
        item.setAttribute("aria-selected", String(active));
        item.classList.toggle("is-active", active);
      });
    }

    return { container: wrapper, scrollToValue };
  }

  function valueIndex(value, values) {
    const index = values.findIndex(item => String(item) === String(value));
    return index < 0 ? 0 : index;
  }

  function replaceWithPickerInput(source, options) {
    const visual = document.createElement("input");
    visual.type = "text";
    visual.readOnly = true;
    visual.required = true;
    visual.autocomplete = "off";
    visual.placeholder = options.placeholder;
    visual.setAttribute("aria-haspopup", "dialog");
    visual.setAttribute("aria-label", options.ariaLabel);

    if (source.id) {
      visual.id = source.id;
      source.id = `${source.id}-value`;
    }

    visual.className = source.className;
    visual.style.cursor = "pointer";

    source.type = "hidden";
    source.required = false;

    source.parentNode.insertBefore(visual, source);

    visual.addEventListener("click", () => openPicker(options.type, visual));
    visual.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openPicker(options.type, visual);
      }
    });

    return visual;
  }

  function createPickerShell() {
    const backdrop = document.createElement("div");
    backdrop.className = "blk-picker-backdrop";
    backdrop.setAttribute("aria-hidden", "true");

    const dialog = document.createElement("div");
    dialog.className = "blk-picker-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "blkPickerTitle");

    const head = document.createElement("div");
    head.className = "blk-picker-head";

    const eyebrow = document.createElement("span");
    eyebrow.className = "blk-picker-eyebrow";
    eyebrow.textContent = "BLK DMND";

    const title = document.createElement("strong");
    title.id = "blkPickerTitle";
    title.className = "blk-picker-title";

    const close = document.createElement("button");
    close.type = "button";
    close.className = "blk-picker-close";
    close.setAttribute("aria-label", "Close picker");
    close.innerHTML = "×";
    close.addEventListener("click", closePicker);

    const titleWrap = document.createElement("div");
    titleWrap.append(eyebrow, title);
    head.append(titleWrap, close);

    dialog.appendChild(head);
    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);

    backdrop.addEventListener("click", event => {
      if (event.target === backdrop) closePicker();
    });

    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && backdrop.classList.contains("is-open")) {
        closePicker();
      }
    });

    return { backdrop, dialog, head, title };
  }

  function injectPickerStyles() {
    if (document.getElementById("blk-picker-styles")) return;

    const style = document.createElement("style");
    style.id = "blk-picker-styles";
    style.textContent = `
      body.blk-picker-open { overflow: hidden; }

      .blk-picker-backdrop {
        position: fixed;
        inset: 0;
        z-index: 1000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        background: rgba(0,0,0,.68);
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
        transition: opacity .18s ease, visibility .18s ease;
        backdrop-filter: blur(8px);
      }

      .blk-picker-backdrop.is-open {
        opacity: 1;
        visibility: visible;
        pointer-events: auto;
      }

      .blk-picker-dialog {
        width: min(430px, 100%);
        max-height: min(720px, calc(100vh - 40px));
        overflow: auto;
        background: #171717;
        color: #fff;
        border: 1px solid #3b3b3b;
        border-radius: 20px;
        box-shadow: 0 28px 90px rgba(0,0,0,.5);
        padding: 22px;
        transform: translateY(12px) scale(.98);
        transition: transform .2s ease;
      }

      .blk-picker-backdrop.is-open .blk-picker-dialog {
        transform: translateY(0) scale(1);
      }

      .blk-picker-head,
      .blk-picker-calendar-nav,
      .blk-picker-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .blk-picker-head {
        margin-bottom: 18px;
      }

      .blk-picker-eyebrow {
        display: block;
        margin-bottom: 4px;
        color: #8d8d8d;
        font-size: 9px;
        font-weight: 700;
        letter-spacing: .2em;
      }

      .blk-picker-title {
        display: block;
        font-family: "Space Grotesk", sans-serif;
        font-size: 15px;
        letter-spacing: .08em;
      }

      .blk-picker-close,
      .blk-picker-nav-btn {
        width: 40px;
        height: 40px;
        border: 1px solid #373737;
        background: #202020;
        color: #fff;
        border-radius: 12px;
        font-size: 24px;
        line-height: 1;
        cursor: pointer;
      }

      .blk-picker-close:hover,
      .blk-picker-nav-btn:hover:not(:disabled) {
        border-color: #727272;
      }

      .blk-picker-nav-btn:disabled {
        opacity: .25;
        cursor: default;
      }

      .blk-picker-month {
        display: flex;
        align-items: baseline;
        gap: 7px;
        font-family: "Space Grotesk", sans-serif;
        letter-spacing: .08em;
      }

      .blk-picker-month strong { font-size: 17px; }
      .blk-picker-month span { color: #8c8c8c; font-size: 13px; }

      .blk-picker-weekdays,
      .blk-picker-calendar-grid {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        gap: 6px;
      }

      .blk-picker-weekdays {
        margin: 18px 0 7px;
        color: #777;
        font-size: 9px;
        font-weight: 700;
        letter-spacing: .12em;
        text-align: center;
      }

      .blk-picker-day {
        aspect-ratio: 1;
        border: 1px solid transparent;
        background: transparent;
        color: #fff;
        border-radius: 12px;
        font-size: 14px;
        cursor: pointer;
      }

      .blk-picker-day:hover:not(:disabled) {
        background: #252525;
        border-color: #444;
      }

      .blk-picker-day.is-today {
        border-color: #c7a35a;
        color: #c7a35a;
      }

      .blk-picker-day.is-selected {
        background: #fff;
        color: #111;
        border-color: #fff;
        font-weight: 700;
      }

      .blk-picker-day.is-disabled {
        color: #444;
        cursor: not-allowed;
      }

      .blk-picker-day.is-empty {
        pointer-events: none;
      }

      .blk-picker-footer {
        margin-top: 18px;
        padding-top: 16px;
        border-top: 1px solid #303030;
      }

      .blk-picker-secondary,
      .blk-picker-primary {
        border: 0;
        padding: 11px 14px;
        border-radius: 10px;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: .13em;
        cursor: pointer;
      }

      .blk-picker-secondary {
        background: transparent;
        color: #999;
      }

      .blk-picker-secondary:hover { color: #fff; }

      .blk-picker-primary {
        background: #fff;
        color: #111;
      }

      .blk-picker-time-display {
        text-align: center;
        padding: 6px 0 18px;
      }

      .blk-picker-time-display strong {
        display: block;
        font-family: "Space Grotesk", sans-serif;
        font-size: 34px;
        letter-spacing: -.04em;
      }

      .blk-picker-time-display span {
        display: block;
        margin-top: 6px;
        color: #777;
        font-size: 10px;
        letter-spacing: .11em;
        text-transform: uppercase;
      }

      .blk-picker-wheels {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 10px;
        padding: 8px 0 4px;
      }

      .blk-wheel-column {
        min-width: 0;
      }

      .blk-wheel-label {
        margin-bottom: 7px;
        color: #777;
        font-size: 9px;
        font-weight: 700;
        letter-spacing: .13em;
        text-align: center;
      }

      .blk-picker-wheel {
        position: relative;
        height: 220px;
        overflow-y: auto;
        overscroll-behavior: contain;
        scroll-snap-type: y mandatory;
        scrollbar-width: none;
        border: 1px solid #303030;
        border-radius: 14px;
        background:
          linear-gradient(#171717 0%, transparent 18%, transparent 82%, #171717 100%);
      }

      .blk-picker-wheel::-webkit-scrollbar { display: none; }

      .blk-wheel-spacer {
        height: 88px;
      }

      .blk-wheel-item {
        display: block;
        width: 100%;
        height: 44px;
        border: 0;
        background: transparent;
        color: #686868;
        font: inherit;
        font-family: "Space Grotesk", sans-serif;
        font-size: 19px;
        cursor: pointer;
        scroll-snap-align: center;
        transition: color .12s ease, transform .12s ease;
      }

      .blk-wheel-item.is-active,
      .blk-wheel-item[aria-selected="true"] {
        color: #fff;
        font-weight: 600;
        transform: scale(1.03);
      }

      .blk-picker-wheel::after {
        content: "";
        position: absolute;
        left: 10px;
        right: 10px;
        top: 88px;
        height: 44px;
        border-top: 1px solid #c7a35a;
        border-bottom: 1px solid #c7a35a;
        border-radius: 7px;
        pointer-events: none;
        opacity: .75;
      }

      @media (max-width: 800px) {
        .blk-picker-backdrop {
          align-items: flex-end;
          padding: 0;
        }

        .blk-picker-dialog {
          width: 100%;
          max-height: min(760px, 92vh);
          border-radius: 22px 22px 0 0;
          border-bottom: 0;
          padding: 18px 18px calc(18px + env(safe-area-inset-bottom));
        }

        .blk-picker-day { font-size: 13px; }
        .blk-picker-close,
        .blk-picker-nav-btn { width: 42px; height: 42px; }
      }
    `;

    document.head.appendChild(style);
  }

  updateVisuals();

  form.addEventListener("reset", () => {
    requestAnimationFrame(updateVisuals);
  });
})();

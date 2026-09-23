const form = document.getElementById("bookingForm");
const status = document.getElementById("formStatus");
const submitButton = form.querySelector('button[type="submit"]');
const dateField = form.elements.date;
const phoneField = form.elements.phone;
const emailField = form.elements.email;
const attendanceField = form.elements.attendance;

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

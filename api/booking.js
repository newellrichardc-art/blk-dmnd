import nodemailer from "nodemailer";

const REQUIRED_FIELDS = [
  "name", "email", "phone", "eventType", "date", "time",
  "venue", "location", "pay", "attendance", "details"
];

function json(res, status, payload) {
  return res.status(status).json(payload);
}

function normalizePhone(phone) {
  const digits = phone.replace(/\D/g, "");
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function isValidDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [y, m, d] = date.split("-").map(Number);
  const value = new Date(y, m - 1, d);
  return value.getFullYear() === y && value.getMonth() === m - 1 && value.getDate() === d;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return json(res, 405, { ok: false, error: "Method not allowed" });
  }

  try {
    const body = req.body || {};

    const missing = REQUIRED_FIELDS.filter((field) => {
      const value = body[field];
      return typeof value !== "string" || value.trim() === "";
    });

    if (missing.length) {
      return json(res, 400, {
        ok: false,
        error: "Please complete every field.",
        fields: missing
      });
    }

    if (typeof body.website === "string" && body.website.trim() !== "") {
      return json(res, 400, { ok: false, error: "Spam check failed." });
    }

    const name = body.name.trim();
    const email = body.email.trim().toLowerCase();
    const phone = body.phone.trim();
    const eventType = body.eventType.trim();
    const date = body.date.trim();
    const time = body.time.trim();
    const venue = body.venue.trim();
    const location = body.location.trim();
    const pay = body.pay.trim();
    const attendance = body.attendance.trim();
    const details = body.details.trim();

    if (name.length < 2 || name.length > 100) {
      return json(res, 400, { ok: false, error: "Please enter a valid name." });
    }

    if (!/^([^\s@]+)@([^\s@]+)\.[^\s@]{2,}$/.test(email) || email.length > 254) {
      return json(res, 400, { ok: false, error: "Please enter a valid email address." });
    }

    const phoneDigits = phone.replace(/\D/g, "");
    if (phoneDigits.length !== 10) {
      return json(res, 400, { ok: false, error: "Phone number must contain 10 digits." });
    }

    if (!isValidDate(date)) {
      return json(res, 400, { ok: false, error: "Please enter a valid event date." });
    }

    const [year, month, day] = date.split("-").map(Number);
    const eventDate = new Date(year, month - 1, day);
    const now = new Date();
    const todayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (eventDate < todayLocal) {
      return json(res, 400, { ok: false, error: "Event date cannot be in the past." });
    }

    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      return json(res, 400, { ok: false, error: "Please enter a valid start time." });
    }

    if (!/^\d+$/.test(attendance) || Number(attendance) < 1 || Number(attendance) > 1000000) {
      return json(res, 400, { ok: false, error: "Expected attendance must be a positive whole number." });
    }

    if (venue.length < 2 || location.length < 2 || pay.length < 1 || details.length < 5) {
      return json(res, 400, { ok: false, error: "Please provide complete event details." });
    }

    const normalizedPhone = normalizePhone(phone);
    const submittedAt = new Date().toISOString();
    const booking = {
      name, email, phone: normalizedPhone, eventType, date, time, venue,
      location, pay, attendance, details, submittedAt
    };

    const lines = [
      "BLK DMND BOOKING INQUIRY",
      "",
      `Name: ${name}`,
      `Email: ${email}`,
      `Phone: ${normalizedPhone}`,
      `Event type: ${eventType}`,
      `Date: ${date}`,
      `Start time: ${time}`,
      `Venue: ${venue}`,
      `City / location: ${location}`,
      `Offered pay / budget: ${pay}`,
      `Expected attendance: ${attendance}`,
      "",
      "Additional details:",
      details
    ];

    const gmailUser = process.env.GMAIL_USER;
    const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;
    const recipient = process.env.BOOKING_EMAIL || gmailUser;
    const webhookUrl = process.env.GOOGLE_SHEET_WEBHOOK_URL;
    const webhookSecret = process.env.GOOGLE_SHEET_WEBHOOK_SECRET;

    if (!gmailUser || !gmailAppPassword || !recipient) {
      console.error("Booking configuration error: Gmail environment variables are incomplete.");
      return json(res, 500, { ok: false, error: "Booking service is not configured yet." });
    }

    if (!webhookUrl || !webhookSecret) {
      console.error("Booking configuration error: Google Sheet webhook variables are incomplete.");
      return json(res, 500, { ok: false, error: "Booking service is not fully configured yet." });
    }

    const subject = `BLK DMND Booking Inquiry — ${date} — ${venue}`;
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: gmailUser, pass: gmailAppPassword }
    });

    try {
      await transporter.sendMail({
        from: gmailUser,
        to: recipient,
        replyTo: email,
        subject,
        text: lines.join("\n")
      });
    } catch (error) {
      console.error("Gmail booking notification failed:", error instanceof Error ? error.message : "unknown error");
      return json(res, 502, {
        ok: false,
        error: "We couldn't send your inquiry right now. Please try again."
      });
    }

    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-BLK-DMND-SECRET": webhookSecret
        },
        body: JSON.stringify(booking)
      });

      if (!response.ok) {
        console.error("Google Sheet webhook failed with status:", response.status);
        return json(res, 502, {
          ok: false,
          error: "Your inquiry reached BLK DMND email, but the booking tracker could not be updated. Please try again or contact BLK DMND directly."
        });
      }
    } catch (error) {
      console.error("Google Sheet sync error:", error instanceof Error ? error.message : "unknown error");
      return json(res, 502, {
        ok: false,
        error: "Your inquiry reached BLK DMND email, but the booking tracker could not be updated. Please try again or contact BLK DMND directly."
      });
    }

    return json(res, 200, { ok: true });
  } catch (error) {
    console.error("Booking form error:", error instanceof Error ? error.message : "unknown error");
    return json(res, 500, {
      ok: false,
      error: "Something went wrong while sending your inquiry."
    });
  }
}

import nodemailer from "nodemailer";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const body = req.body || {};
    const requiredFields = [
      "name",
      "email",
      "phone",
      "eventType",
      "date",
      "time",
      "venue",
      "location",
      "pay",
      "attendance",
      "details"
    ];

    const missing = requiredFields.filter((field) => {
      const value = body[field];
      return typeof value !== "string" || value.trim() === "";
    });

    if (missing.length) {
      return res.status(400).json({
        ok: false,
        error: "Please complete every field.",
        fields: missing
      });
    }

    if (typeof body.website === "string" && body.website.trim() !== "") {
      return res.status(400).json({ ok: false, error: "Spam check failed." });
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
      return res.status(400).json({ ok: false, error: "Please enter a valid name." });
    }

    if (!/^([^\s@]+)@([^\s@]+)\.([^\s@]{2,})$/.test(email) || email.length > 254) {
      return res.status(400).json({ ok: false, error: "Please enter a valid email address." });
    }

    const phoneDigits = phone.replace(/\D/g, "");
    if (phoneDigits.length !== 10) {
      return res.status(400).json({ ok: false, error: "Phone number must contain 10 digits." });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ ok: false, error: "Please enter a valid event date." });
    }

    const eventDate = new Date(date + "T00:00:00");
    const today = new Date();
    const todayLocal = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (Number.isNaN(eventDate.getTime()) || eventDate < todayLocal) {
      return res.status(400).json({ ok: false, error: "Event date cannot be in the past." });
    }

    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      return res.status(400).json({ ok: false, error: "Please enter a valid start time." });
    }

    if (!/^\d+$/.test(attendance) || Number(attendance) < 1 || Number(attendance) > 1000000) {
      return res.status(400).json({ ok: false, error: "Expected attendance must be a positive whole number." });
    }

    if (venue.length < 2 || location.length < 2 || pay.length < 1 || details.length < 5) {
      return res.status(400).json({
        ok: false,
        error: "Please provide complete event details."
      });
    }

    const lines = [
      "BLK DMND BOOKING INQUIRY",
      "",
      `Name: ${name}`,
      `Email: ${email}`,
      `Phone: ${phoneDigits.slice(0, 3)}-${phoneDigits.slice(3, 6)}-${phoneDigits.slice(6)}`,
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

    const sheetPayload = {
      bookingId: null,
      submittedAt: new Date().toISOString(),
      name,
      email,
      phone: phoneDigits.slice(0, 3) + "-" + phoneDigits.slice(3, 6) + "-" + phoneDigits.slice(6),
      eventType,
      date,
      time,
      venue,
      location,
      pay,
      attendance,
      details
    };

    async function syncToGoogleSheet() {
      const webhookUrl = process.env.GOOGLE_SHEET_WEBHOOK_URL;
      const webhookSecret = process.env.GOOGLE_SHEET_WEBHOOK_SECRET;

      if (!webhookUrl) {
        return { enabled: false };
      }

      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(webhookSecret ? { "X-BLK-DMND-SECRET": webhookSecret } : {})
        },
        body: JSON.stringify(sheetPayload)
      });

      if (!response.ok) {
        throw new Error("Google Sheet webhook returned " + response.status);
      }

      return { enabled: true, ok: true };
    }

    const gmailUser = process.env.GMAIL_USER || "newellrichardc@gmail.com";
    const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;
    const recipient = process.env.BOOKING_EMAIL || gmailUser;
    const subject = `BLK DMND Booking Inquiry — ${date} — ${venue}`;

    // Gmail is the primary sender. The authenticated Gmail account is also
    // used as the visible From address so the message is sent as that account.
    if (gmailAppPassword) {
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: gmailUser,
          pass: gmailAppPassword
        }
      });

      await transporter.sendMail({
        from: gmailUser,
        to: recipient,
        replyTo: email,
        subject,
        text: lines.join("\n")
      });

      try {
        await syncToGoogleSheet();
      } catch (sheetError) {
        console.error("Google Sheet sync error:", sheetError);
      }

      return res.status(200).json({ ok: true });
    }

    // Temporary fallback while the Gmail App Password is being added to Vercel.
    const resendKey = process.env.RESEND_API_KEY;
    const resendFrom = process.env.RESEND_FROM_EMAIL || "BLK DMND <onboarding@resend.dev>";

    if (!resendKey) {
      return res.status(500).json({
        ok: false,
        error: "Email service is not configured yet."
      });
    }

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: resendFrom,
        to: [recipient],
        reply_to: email,
        subject,
        text: lines.join("\n")
      })
    });

    if (!resendResponse.ok) {
      const errorText = await resendResponse.text();
      console.error("Resend fallback error:", errorText);
      return res.status(502).json({
        ok: false,
        error: "We couldn't send your inquiry right now. Please try again."
      });
    }

    try {
      await syncToGoogleSheet();
    } catch (sheetError) {
      console.error("Google Sheet sync error:", sheetError);
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Booking form error:", error);
    return res.status(500).json({
      ok: false,
      error: "Something went wrong while sending your inquiry."
    });
  }
}

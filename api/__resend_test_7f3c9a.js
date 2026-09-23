export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const key = process.env.RESEND_API_KEY;
  const to = process.env.BOOKING_EMAIL || "newellrichardc@gmail.com";
  const from = process.env.RESEND_FROM_EMAIL || "BLK DMND <onboarding@resend.dev>";

  if (!key) return res.status(500).json({ ok: false, error: "RESEND_API_KEY missing" });

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: "BLK DMND — Resend setup test",
        text: "This is a one-time automated test confirming the BLK DMND website can send booking emails through Resend."
      })
    });

    const body = await response.text();
    if (!response.ok) {
      console.error("Resend test error:", body);
      return res.status(502).json({ ok: false, error: "Resend rejected the test email." });
    }

    return res.status(200).json({ ok: true, resendAccepted: true });
  } catch (error) {
    console.error("Resend test exception:", error);
    return res.status(500).json({ ok: false, error: "Resend test failed." });
  }
}

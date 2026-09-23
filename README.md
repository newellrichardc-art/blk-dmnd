# BLK DMND

Bay Area live music — San Francisco / Oakland.

Your favorite songs. Our twist.

This repository contains the BLK DMND booking website, ready for Vercel deployment.

Vercel/Git integration is connected for automatic deployments from main.

## Booking email

The booking form uses the BLK DMND Gmail account as the sender through Gmail SMTP via Nodemailer.

Set these Vercel Environment Variables:
- `GMAIL_USER` = `newellrichardc@gmail.com`
- `GMAIL_APP_PASSWORD` = the Google App Password generated for this site
- `BOOKING_EMAIL` = `newellrichardc@gmail.com`

Never commit the real App Password to GitHub.

Until `GMAIL_APP_PASSWORD` is added, the API temporarily falls back to the existing Resend configuration. Once the Gmail App Password is present, Gmail is used as the sender.


## Google Sheet tracking

The booking API can also send each successful inquiry to a Google Apps Script webhook. Set these Vercel Environment Variables after the Google Sheet and Apps Script are created:
- `GOOGLE_SHEET_WEBHOOK_URL`
- `GOOGLE_SHEET_WEBHOOK_SECRET`

The email send remains independent of the sheet sync; a temporary sheet-sync failure is logged without blocking a successful booking email.

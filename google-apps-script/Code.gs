const CONFIG = {
  spreadsheetName: "BLK DMND Booking Tracker",
  sheetName: "Bookings",
  statusValues: [
    "New Inquiry", "Contacted", "In Conversation", "Quote Sent",
    "Awaiting Client", "Confirmed", "Completed", "Declined", "Cancelled", "Lost"
  ],
  yesNoValues: ["Yes", "No", "Not Yet"],
  eventTypes: ["Wedding", "Corporate", "Private Party", "Festival", "Birthday", "Nonprofit", "Holiday Party", "Concert", "Other"],
  cancellationReasons: ["Client Cancelled", "Band Unavailable", "Date Conflict", "Budget", "Client Chose Another Band", "Event Cancelled", "Other"]
};

const HEADERS = [
  "Booking ID","Submitted At","Name","Email","Phone","Event Type","Event Date","Start Time",
  "Venue","City / Location","Offered Budget","Expected Attendance","Additional Details","Status",
  "Last Contacted","Next Follow-Up","Contact Notes","BLK DMND Quote","Client Accepted Quote?",
  "Final Agreed Fee","Booking Confirmed?","Contract Sent?","Contract Signed?","Deposit Required?",
  "Deposit Paid?","Performance Completed?","Cancellation Reason","Internal Notes",
  "Days Until Event","Follow-Up Flag","Quote Difference"
];

function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, service: "BLK DMND booking webhook" }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const secret = PropertiesService.getScriptProperties().getProperty("GOOGLE_SHEET_WEBHOOK_SECRET");
    const supplied = e && e.parameter && e.parameter.secret
      ? e.parameter.secret
      : e && e.postData && e.postData.headers
        ? e.postData.headers["X-BLK-DMND-SECRET"]
        : null;

    // Apps Script Web Apps do not reliably expose arbitrary request headers in all deployments.
    // Prefer the JSON body secret only if configured by the Vercel implementation.
    const body = parseBody_(e);
    const requestSecret = supplied || body.webhookSecret;

    if (!secret || requestSecret !== secret) {
      return json_(401, { ok: false, error: "Unauthorized" });
    }

    delete body.webhookSecret;
    validateBooking_(body);

    const lock = LockService.getScriptLock();
    lock.waitLock(30000);

    try {
      const ss = getSpreadsheet_();
      const sheet = ss.getSheetByName(CONFIG.sheetName) || setupSpreadsheet_(ss);
      const bookingId = nextBookingId_(sheet);
      const row = buildRow_(body, bookingId);
      sheet.appendRow(row);
      const rowNumber = sheet.getLastRow();
      setRowFormulas_(sheet, rowNumber);
      return json_(200, { ok: true, bookingId });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    console.error(err);
    const message = err && err.message ? err.message : "Internal error";
    return json_(400, { ok: false, error: message });
  }
}

function setupSpreadsheet() {
  const ss = getSpreadsheet_();
  setupSpreadsheet_(ss);
  Logger.log("BLK DMND Booking Tracker: " + ss.getUrl());
  return ss.getUrl();
}

function setWebhookSecret(secret) {
  if (!secret || String(secret).length < 24) {
    throw new Error("Secret must be at least 24 characters.");
  }
  PropertiesService.getScriptProperties().setProperty("GOOGLE_SHEET_WEBHOOK_SECRET", String(secret));
}

function getSpreadsheet_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty("SPREADSHEET_ID");
  if (id) return SpreadsheetApp.openById(id);

  const existing = SpreadsheetApp.getActiveSpreadsheet();
  const ss = existing || SpreadsheetApp.create(CONFIG.spreadsheetName);
  props.setProperty("SPREADSHEET_ID", ss.getId());
  return ss;
}

function setupSpreadsheet_(ss) {
  ss.rename(CONFIG.spreadsheetName);

  const bookings = getOrCreateSheet_(ss, CONFIG.sheetName);
  const dashboard = getOrCreateSheet_(ss, "Dashboard");
  const lists = getOrCreateSheet_(ss, "Lists");
  const instructions = getOrCreateSheet_(ss, "Instructions");

  setupBookings_(bookings);
  setupLists_(lists);
  setupDashboard_(dashboard);
  setupInstructions_(instructions);

  return bookings;
}

function setupBookings_(sheet) {
  sheet.clear();
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, HEADERS.length)
    .setBackground("#1d1d1d")
    .setFontColor("#ffffff")
    .setFontWeight("bold")
    .setHorizontalAlignment("center");

  const widths = [110,145,150,220,130,130,105,110,180,180,120,125,300,140,110,110,260,120,140,120,140,120,120,120,120,150,180,260,120,130,120];
  widths.forEach((w, i) => sheet.setColumnWidth(i + 1, w));

  if (sheet.getFilter()) sheet.getFilter().remove();
  sheet.getRange(1, 1, Math.max(sheet.getMaxRows(), 2), HEADERS.length).createFilter();

  sheet.getRange("B:B").setNumberFormat("MM/dd/yyyy HH:mm");
  sheet.getRange("G:G").setNumberFormat("MM/dd/yyyy");
  sheet.getRange("H:H").setNumberFormat("hh:mm AM/PM");
  sheet.getRange("O:P").setNumberFormat("MM/dd/yyyy");
  sheet.getRange("K:K").setNumberFormat("$#,##0.00");
  sheet.getRange("R:R").setNumberFormat("$#,##0.00");
  sheet.getRange("T:T").setNumberFormat("$#,##0.00");
  sheet.getRange("AE:AE").setNumberFormat("$#,##0.00");
  sheet.getRange("M:M").setWrap(true);
  sheet.getRange("Q:Q").setWrap(true);
  sheet.getRange("AB:AB").setWrap(true);

  const lists = getOrCreateSheet_(SpreadsheetApp.getActiveSpreadsheet(), "Lists");
  const validationMap = [
    ["F:F", "EventTypes"],
    ["N:N", "Statuses"],
    ["S:S", "YesNo"],
    ["U:Z", "YesNo"],
    ["AA:AA", "CancellationReasons"]
  ];

  validationMap.forEach(([range, named]) => {
    const namedRange = SpreadsheetApp.getActiveSpreadsheet().getRangeByName(named);
    if (!namedRange) return;
    const rule = SpreadsheetApp.newDataValidation()
      .requireValueInRange(namedRange, true)
      .setAllowInvalid(false)
      .build();
    sheet.getRange(range).setDataValidation(rule);
  });

  applyConditionalFormatting_(sheet);
}

function setRowFormulas_(sheet, row) {
  sheet.getRange(row, 29).setFormula(`=IF(G${row}="","",G${row}-TODAY())`);
  sheet.getRange(row, 30).setFormula(`=IF(AND(P${row}<TODAY(),P${row}<>"",NOT(OR(N${row}="Confirmed",N${row}="Completed",N${row}="Cancelled",N${row}="Declined",N${row}="Lost"))),"FOLLOW UP","")`);
  sheet.getRange(row, 31).setFormula(`=IF(OR(K${row}="",R${row}=""),"",R${row}-K${row})`);
}

function applyConditionalFormatting_(sheet) {
  const range = sheet.getRange("N2:N");
  const rules = [
    ["New Inquiry", "#f4c542"], ["Contacted", "#eeeeee"], ["In Conversation", "#d9d2ff"],
    ["Quote Sent", "#f8dfb0"], ["Awaiting Client", "#fff2cc"], ["Confirmed", "#d9ead3"],
    ["Completed", "#cfe2f3"], ["Declined", "#eeeeee"], ["Cancelled", "#eeeeee"], ["Lost", "#eeeeee"]
  ].map(([value, color]) => SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo(value).setBackground(color).setRanges([range]).build());

  rules.push(
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo("FOLLOW UP")
      .setBackground("#f4cccc")
      .setFontWeight("bold")
      .setRanges([sheet.getRange("AD2:AD")])
      .build()
  );
  sheet.setConditionalFormatRules(rules);
}

function setupLists_(sheet) {
  sheet.clear();
  sheet.getRange("A1:F1").setValues([["Statuses","Yes/No/Not Yet","Event Types","Cancellation Reasons","Next Action","Payment Status"]])
    .setBackground("#1d1d1d").setFontColor("#ffffff").setFontWeight("bold");

  const max = Math.max(CONFIG.statusValues.length, CONFIG.yesNoValues.length, CONFIG.eventTypes.length, CONFIG.cancellationReasons.length);
  const rows = Array.from({length: max}, (_, i) => [
    CONFIG.statusValues[i] || "",
    CONFIG.yesNoValues[i] || "",
    CONFIG.eventTypes[i] || "",
    CONFIG.cancellationReasons[i] || "",
    ["Review Inquiry","Call Client","Send Quote","Follow Up","Send Contract","Request Deposit","Confirm Details","Post-Event Follow Up"][i] || "",
    ["Not Yet","Required","Paid","Refunded"][i] || ""
  ]);
  sheet.getRange(2,1,rows.length,6).setValues(rows);
  sheet.setFrozenRows(1);

  const ss = sheet.getParent();
  setNamedRange_(ss, "Statuses", sheet.getRange(2,1,CONFIG.statusValues.length,1));
  setNamedRange_(ss, "YesNo", sheet.getRange(2,2,CONFIG.yesNoValues.length,1));
  setNamedRange_(ss, "EventTypes", sheet.getRange(2,3,CONFIG.eventTypes.length,1));
  setNamedRange_(ss, "CancellationReasons", sheet.getRange(2,4,CONFIG.cancellationReasons.length,1));
  setNamedRange_(ss, "NextActions", sheet.getRange(2,5,8,1));
  setNamedRange_(ss, "PaymentStatus", sheet.getRange(2,6,4,1));
}

function setupDashboard_(sheet) {
  sheet.clear();
  sheet.getRange("A1:H1").merge().setValue("BLK DMND BOOKING DASHBOARD")
    .setBackground("#1d1d1d").setFontColor("#ffffff").setFontSize(18).setFontWeight("bold");
  const metrics = [
    ["Total Inquiries", '=COUNTA(Bookings!A2:A)'],
    ["New Inquiries", '=COUNTIF(Bookings!N:N,"New Inquiry")'],
    ["In Conversation", '=COUNTIF(Bookings!N:N,"In Conversation")'],
    ["Quotes Sent", '=COUNTIF(Bookings!N:N,"Quote Sent")'],
    ["Confirmed", '=COUNTIF(Bookings!N:N,"Confirmed")'],
    ["Completed", '=COUNTIF(Bookings!N:N,"Completed")'],
    ["Confirmed Revenue", '=SUMIF(Bookings!N:N,"Confirmed",Bookings!T:T)'],
    ["Follow-Ups Due", '=COUNTIF(Bookings!AD:AD,"FOLLOW UP")'],
    ["Awaiting Client", '=COUNTIF(Bookings!N:N,"Awaiting Client")'],
    ["Upcoming Confirmed Events", '=COUNTIFS(Bookings!N:N,"Confirmed",Bookings!G:G,">="&TODAY())'],
    ["Events Next 30 Days", '=COUNTIFS(Bookings!G:G,">="&TODAY(),Bookings!G:G,"<="&TODAY()+30)']
  ];
  sheet.getRange(3,1,metrics.length,2).setValues(metrics);
  sheet.getRange(3,2,metrics.length,1).setNumberFormat("0");
  sheet.getRange(9,2).setNumberFormat("$#,##0.00");

  sheet.getRange("D3:F3").setValues([["Status","Count","% of Total"]]).setBackground("#1d1d1d").setFontColor("#ffffff").setFontWeight("bold");
  sheet.getRange(4,4,CONFIG.statusValues.length,1).setValues(CONFIG.statusValues.map(x => [x]));
  sheet.getRange(4,5,CONFIG.statusValues.length,1).setFormulas(CONFIG.statusValues.map((x,i) => [`=COUNTIF(Bookings!N:N,D${i+4})`]));
  sheet.getRange(4,6,CONFIG.statusValues.length,1).setFormulas(CONFIG.statusValues.map((x,i) => [`=IFERROR(E${i+4}/$B$3,0)`]));
  sheet.getRange(4,6,CONFIG.statusValues.length,1).setNumberFormat("0.0%");

  sheet.setColumnWidth(1, 210);
  sheet.setColumnWidth(2, 140);
  sheet.setColumnWidth(4, 160);
  sheet.setColumnWidth(5, 90);
  sheet.setColumnWidth(6, 110);
}

function setupInstructions_(sheet) {
  sheet.clear();
  const rows = [
    ["BLK DMND Booking Tracker — Instructions"],
    ["Purpose","This sheet is the source of truth for website booking inquiries and the manual booking pipeline."],
    ["Status","Use the controlled Status dropdown to show where the inquiry is in the pipeline. Do not use Confirmed merely because a quote was accepted."],
    ["Last Contacted","Enter the date you last contacted the client."],
    ["Next Follow-Up","Enter the date you want to contact the client again. Overdue active dates produce FOLLOW UP."],
    ["BLK DMND Quote","Enter the amount BLK DMND quoted. Quote Difference is calculated automatically."],
    ["Client Accepted Quote?","Use Yes / No / Not Yet. This does not automatically confirm the booking."],
    ["Booking Confirmed?","Manually mark when the booking is officially confirmed."],
    ["Contracts","Track Contract Sent? and Contract Signed? independently."],
    ["Deposits","Track Deposit Required? and Deposit Paid? independently."],
    ["Performance","Mark Performance Completed? after the event occurs."],
    ["Internal Notes","Use for private operational notes; do not put passwords or secrets here."],
    ["Automatic import","The website POSTs to /api/booking. Vercel sends the validated booking to this Apps Script webhook, which creates the Booking ID and row."],
    ["Dashboard","Dashboard metrics are formulas calculated from the Bookings tab; no fake production data is used."],
    ["Webhook troubleshooting","Check Vercel runtime logs for webhook status errors. Confirm GOOGLE_SHEET_WEBHOOK_URL and GOOGLE_SHEET_WEBHOOK_SECRET in Vercel and the same secret in Apps Script Properties."],
    ["Security","Never store Gmail App Passwords, webhook secrets, API keys, or other credentials in this spreadsheet."]
  ];
  sheet.getRange(1,1,rows.length,2).setValues(rows);
  sheet.getRange("A1:B1").merge().setBackground("#1d1d1d").setFontColor("#ffffff").setFontSize(16).setFontWeight("bold");
  sheet.getRange("A:B").setWrap(true);
  sheet.setColumnWidth(1, 190);
  sheet.setColumnWidth(2, 650);
}

function validateBooking_(b) {
  ["name","email","phone","eventType","date","time","venue","location","pay","attendance","details","submittedAt"]
    .forEach(k => { if (!b[k] || String(b[k]).trim() === "") throw new Error("Missing required booking field: " + k); });
}

function parseBody_(e) {
  if (!e || !e.postData || !e.postData.contents) throw new Error("Invalid request body.");
  try { return JSON.parse(e.postData.contents); }
  catch (_) { throw new Error("Request body must be valid JSON."); }
}

function buildRow_(b, id) {
  return [
    id, new Date(b.submittedAt), b.name, b.email, b.phone, b.eventType,
    parseDate_(b.date), b.time, b.venue, b.location, parseMoney_(b.pay),
    Number(b.attendance), b.details, "New Inquiry", "", "", "", "", "Not Yet",
    "", "Not Yet", "Not Yet", "Not Yet", "Not Yet", "Not Yet", "Not Yet", "", "", "", "", ""
  ];
}

function parseDate_(value) {
  const [y,m,d] = String(value).split("-").map(Number);
  return new Date(y, m - 1, d);
}

function parseMoney_(value) {
  const cleaned = String(value).replace(/[$,\s]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : value;
}

function nextBookingId_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return "BLK-0001";
  const ids = sheet.getRange(2,1,lastRow-1,1).getValues().flat();
  let max = 0;
  ids.forEach(id => {
    const match = String(id).match(/^BLK-(\d+)$/);
    if (match) max = Math.max(max, Number(match[1]));
  });
  return "BLK-" + String(max + 1).padStart(4, "0");
}

function getOrCreateSheet_(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function setNamedRange_(ss, name, range) {
  const existing = ss.getNamedRanges().find(r => r.getName() === name);
  if (existing) existing.setRange(range);
  else ss.setNamedRange(name, range);
}

function json_(status, payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

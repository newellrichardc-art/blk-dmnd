const CONFIG = {
  spreadsheetName: "BLK DMND Booking Tracker",
  sheetName: "Bookings",
  statusValues: [
    "New Inquiry", "Contacted", "In Conversation", "Quote Sent",
    "Awaiting Client", "Confirmed", "Completed", "Declined", "Cancelled", "Lost"
  ],
  yesNoValues: ["Yes", "No", "Not Yet"],
  eventTypes: ["Wedding", "Corporate", "Private Party", "Festival", "Birthday", "Nonprofit", "Holiday Party", "Concert", "Other"],
  cancellationReasons: ["Client Cancelled", "Band Unavailable", "Date Conflict", "Budget", "Client Chose Another Band", "Event Cancelled", "Other"],
  nextActions: ["Review Inquiry", "Call Client", "Send Quote", "Follow Up", "Send Contract", "Request Deposit", "Confirm Details", "Post-Event Follow Up"],
  paymentStatus: ["Not Yet", "Required", "Paid", "Refunded"]
};

const HEADERS = [
  "Booking ID", "Submitted At", "Name", "Email", "Phone", "Event Type", "Event Date", "Start Time",
  "Venue", "City / Location", "Offered Budget", "Expected Attendance", "Additional Details", "Status",
  "Last Contacted", "Next Follow-Up", "Contact Notes", "BLK DMND Quote", "Client Accepted Quote?",
  "Final Agreed Fee", "Booking Confirmed?", "Contract Sent?", "Contract Signed?", "Deposit Required?",
  "Deposit Paid?", "Performance Completed?", "Cancellation Reason", "Internal Notes",
  "Days Until Event", "Follow-Up Flag", "Quote Difference"
];

function doGet() {
  return json_({ ok: true, service: "BLK DMND booking webhook" });
}

function doPost(e) {
  const body = parseBody_(e);
  const configuredSecret = PropertiesService.getScriptProperties().getProperty("GOOGLE_SHEET_WEBHOOK_SECRET");

  if (!configuredSecret || body.webhookSecret !== configuredSecret) {
    return json_({ ok: false, error: "Unauthorized" });
  }
  delete body.webhookSecret;

  try {
    validateBooking_(body);

    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      const ss = getSpreadsheet_();
      const sheet = getOrCreateBookings_(ss);
      const bookingId = nextBookingId_(sheet);
      const row = buildRow_(body, bookingId);
      sheet.appendRow(row);
      const rowNumber = sheet.getLastRow();
      setRowFormulas_(sheet, rowNumber);
      return json_({ ok: true, bookingId });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    console.error("Booking webhook error:", err && err.message ? err.message : "unknown error");
    return json_({ ok: false, error: "Invalid booking request." });
  }
}

function setupSpreadsheet() {
  const ss = getSpreadsheet_();
  setupAllSheets_(ss);
  Logger.log("BLK DMND Booking Tracker: " + ss.getUrl());
  return ss.getUrl();
}

function setWebhookSecret(secret) {
  if (!secret || String(secret).length < 24) {
    throw new Error("Secret must be at least 24 characters.");
  }
  PropertiesService.getScriptProperties().setProperty("GOOGLE_SHEET_WEBHOOK_SECRET", String(secret));
}

function setSpreadsheetId(spreadsheetId) {
  if (!spreadsheetId) throw new Error("Spreadsheet ID is required.");
  SpreadsheetApp.openById(String(spreadsheetId));
  PropertiesService.getScriptProperties().setProperty("SPREADSHEET_ID", String(spreadsheetId));
}

function getSpreadsheet_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty("SPREADSHEET_ID");
  if (id) return SpreadsheetApp.openById(id);

  const active = SpreadsheetApp.getActiveSpreadsheet();
  const ss = active || SpreadsheetApp.create(CONFIG.spreadsheetName);
  props.setProperty("SPREADSHEET_ID", ss.getId());
  return ss;
}

function setupAllSheets_(ss) {
  ss.rename(CONFIG.spreadsheetName);
  const bookings = getOrCreateSheet_(ss, "Bookings");
  const dashboard = getOrCreateSheet_(ss, "Dashboard");
  const lists = getOrCreateSheet_(ss, "Lists");
  const instructions = getOrCreateSheet_(ss, "Instructions");

  setupLists_(lists);
  setupBookings_(bookings, lists);
  setupDashboard_(dashboard);
  setupInstructions_(instructions);
}

function getOrCreateBookings_(ss) {
  const requiredSheets = ["Bookings", "Dashboard", "Lists", "Instructions"];
  const missing = requiredSheets.some(name => !ss.getSheetByName(name));
  if (missing) setupAllSheets_(ss);
  return ss.getSheetByName("Bookings");
}

function setupBookings_(sheet, lists) {
  const firstRow = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  const isHeaderMissing = sheet.getLastRow() === 0 || firstRow.every(v => String(v).trim() === "");
  if (isHeaderMissing) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  } else if (firstRow.join("|") !== HEADERS.join("|")) {
    throw new Error("Bookings sheet headers do not match the required CRM schema.");
  }

  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, HEADERS.length)
    .setBackground("#1d1d1d").setFontColor("#ffffff").setFontWeight("bold")
    .setHorizontalAlignment("center");

  const widths = [110,145,150,220,130,130,105,110,180,180,120,125,300,140,110,110,260,120,140,120,140,120,120,120,120,150,180,260,120,130,120];
  widths.forEach((w, i) => sheet.setColumnWidth(i + 1, w));

  if (sheet.getFilter()) sheet.getFilter().remove();
  const filterRows = Math.max(sheet.getMaxRows(), 2);
  sheet.getRange(1, 1, filterRows, HEADERS.length).createFilter();

  sheet.getRange("B:B").setNumberFormat("MM/dd/yyyy HH:mm");
  sheet.getRange("G:G").setNumberFormat("MM/dd/yyyy");
  sheet.getRange("H:H").setNumberFormat("hh:mm AM/PM");
  sheet.getRange("O:P").setNumberFormat("MM/dd/yyyy");
  sheet.getRange("K:K").setNumberFormat("$#,##0.00");
  sheet.getRange("R:R").setNumberFormat("$#,##0.00");
  sheet.getRange("T:T").setNumberFormat("$#,##0.00");
  sheet.getRange("AE:AE").setNumberFormat("$#,##0.00");
  ["C:C","I:M","Q:Q","AB:AB"].forEach(range => sheet.getRange(range).setWrap(true));

  applyValidation_(sheet, "F:F", lists.getRange(2, 3, CONFIG.eventTypes.length, 1));
  applyValidation_(sheet, "N:N", lists.getRange(2, 1, CONFIG.statusValues.length, 1));
  applyValidation_(sheet, "S:S", lists.getRange(2, 2, CONFIG.yesNoValues.length, 1));
  applyValidation_(sheet, "U:Z", lists.getRange(2, 2, CONFIG.yesNoValues.length, 1));
  applyValidation_(sheet, "AA:AA", lists.getRange(2, 4, CONFIG.cancellationReasons.length, 1));

  applyConditionalFormatting_(sheet);
}

function applyValidation_(sheet, rangeA1, sourceRange) {
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInRange(sourceRange, true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(rangeA1).setDataValidation(rule);
}

function setRowFormulas_(sheet, row) {
  sheet.getRange(row, 29).setFormula('=IF(G' + row + '="","",G' + row + '-TODAY())');
  sheet.getRange(row, 30).setFormula('=IF(AND(P' + row + '<TODAY(),P' + row + '<>"",NOT(OR(N' + row + '="Confirmed",N' + row + '="Completed",N' + row + '="Cancelled",N' + row + '="Declined",N' + row + '="Lost"))),"FOLLOW UP","")');
  sheet.getRange(row, 31).setFormula('=IF(OR(K' + row + '="",R' + row + '=""),"",R' + row + '-K' + row + ')');
}

function applyConditionalFormatting_(sheet) {
  const rules = CONFIG.statusValues.map(value =>
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo(value)
      .setBackground(statusColor_(value))
      .setRanges([sheet.getRange("N2:N")])
      .build()
  );

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

function statusColor_(status) {
  const colors = {
    "New Inquiry": "#f4c542",
    "Contacted": "#eeeeee",
    "In Conversation": "#d9d2ff",
    "Quote Sent": "#f8dfb0",
    "Awaiting Client": "#fff2cc",
    "Confirmed": "#d9ead3",
    "Completed": "#cfe2f3",
    "Declined": "#eeeeee",
    "Cancelled": "#eeeeee",
    "Lost": "#eeeeee"
  };
  return colors[status] || "#ffffff";
}

function setupLists_(sheet) {
  const header = ["Statuses", "Yes/No/Not Yet", "Event Types", "Cancellation Reasons", "Next Action", "Payment Status"];
  const existingHeader = sheet.getRange(1, 1, 1, 6).getValues()[0];
  if (sheet.getLastRow() === 0 || existingHeader.every(v => String(v).trim() === "")) {
    sheet.getRange(1, 1, 1, 6).setValues([header]);
    sheet.getRange(2, 1, CONFIG.statusValues.length, 1).setValues(CONFIG.statusValues.map(x => [x]));
    sheet.getRange(2, 2, CONFIG.yesNoValues.length, 1).setValues(CONFIG.yesNoValues.map(x => [x]));
    sheet.getRange(2, 3, CONFIG.eventTypes.length, 1).setValues(CONFIG.eventTypes.map(x => [x]));
    sheet.getRange(2, 4, CONFIG.cancellationReasons.length, 1).setValues(CONFIG.cancellationReasons.map(x => [x]));
    sheet.getRange(2, 5, CONFIG.nextActions.length, 1).setValues(CONFIG.nextActions.map(x => [x]));
    sheet.getRange(2, 6, CONFIG.paymentStatus.length, 1).setValues(CONFIG.paymentStatus.map(x => [x]));
  }
  sheet.getRange(1, 1, 1, 6).setBackground("#1d1d1d").setFontColor("#ffffff").setFontWeight("bold");
  sheet.setFrozenRows(1);
  [1,2,3,4,5,6].forEach(c => sheet.setColumnWidth(c, 210));
}

function setupDashboard_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange("A1:H1").merge().setValue("BLK DMND BOOKING DASHBOARD");
    sheet.getRange("A3:B13").setValues([
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
    ]);
    sheet.getRange("D3:F3").setValues([["Status", "Count", "% of Total"]]);
    sheet.getRange(4, 4, CONFIG.statusValues.length, 1).setValues(CONFIG.statusValues.map(x => [x]));
    sheet.getRange(4, 5, CONFIG.statusValues.length, 1).setFormulas(CONFIG.statusValues.map((_, i) => ['=COUNTIF(Bookings!N:N,D' + (i + 4) + ')']));
    sheet.getRange(4, 6, CONFIG.statusValues.length, 1).setFormulas(CONFIG.statusValues.map((_, i) => ['=IFERROR(E' + (i + 4) + '/$B$3,0)']));
  }
  sheet.getRange("A1:H1").setBackground("#1d1d1d").setFontColor("#ffffff").setFontSize(18).setFontWeight("bold");
  sheet.getRange("D3:F3").setBackground("#1d1d1d").setFontColor("#ffffff").setFontWeight("bold");
  sheet.getRange("B9").setNumberFormat("$#,##0.00");
  sheet.getRange("F4:F13").setNumberFormat("0.0%");
  sheet.setColumnWidth(1, 210);
  sheet.setColumnWidth(2, 140);
  sheet.setColumnWidth(4, 170);
  sheet.setColumnWidth(5, 90);
  sheet.setColumnWidth(6, 110);
}

function setupInstructions_(sheet) {
  if (sheet.getLastRow() === 0) {
    const rows = [
      ["BLK DMND Booking Tracker — Instructions", ""],
      ["Purpose", "Source of truth for website booking inquiries and the manual booking pipeline."],
      ["Status", "Use the controlled Status dropdown to show the current pipeline stage. Client quote acceptance does not automatically mean the booking is confirmed."],
      ["Last Contacted", "Enter the date you last contacted the client."],
      ["Next Follow-Up", "Enter the date you want to contact the client again. Overdue active dates produce FOLLOW UP."],
      ["BLK DMND Quote", "Enter the amount BLK DMND quoted. Quote Difference is calculated automatically."],
      ["Client Accepted Quote?", "Use Yes / No / Not Yet. Keep Booking Confirmed? separate."],
      ["Booking Confirmed?", "Manually mark when the booking is officially confirmed."],
      ["Contracts", "Track Contract Sent? and Contract Signed? independently."],
      ["Deposits", "Track Deposit Required? and Deposit Paid? independently."],
      ["Performance", "Mark Performance Completed? after the event occurs."],
      ["Internal Notes", "Use for private operational notes. Never put passwords or secrets here."],
      ["Automatic import", "The website posts to /api/booking. Vercel sends the validated booking to this secured Apps Script webhook, which generates the Booking ID and appends the row."],
      ["Dashboard", "Dashboard metrics are formulas calculated from Bookings. No sample production data is created."],
      ["Webhook troubleshooting", "Check Vercel runtime logs for webhook errors. Confirm GOOGLE_SHEET_WEBHOOK_URL and GOOGLE_SHEET_WEBHOOK_SECRET in Vercel and the same secret in Apps Script Properties."],
      ["Security", "Never store Gmail App Passwords, webhook secrets, API keys, or other credentials in this spreadsheet."]
    ];
    sheet.getRange(1, 1, rows.length, 2).setValues(rows);
    sheet.getRange("A1:B1").merge();
  }
  sheet.getRange("A1:B1").setBackground("#1d1d1d").setFontColor("#ffffff").setFontSize(16).setFontWeight("bold");
  sheet.getRange("A:B").setWrap(true);
  sheet.setColumnWidth(1, 210);
  sheet.setColumnWidth(2, 680);
}

function validateBooking_(b) {
  const required = ["name","email","phone","eventType","date","time","venue","location","pay","attendance","details","submittedAt"];
  required.forEach(key => {
    if (typeof b[key] !== "string" || b[key].trim() === "") throw new Error("Missing field");
  });

  if (b.name.trim().length < 2 || b.name.trim().length > 100) throw new Error("Invalid name");
  if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$/.test(b.email.trim()) || b.email.trim().length > 254) throw new Error("Invalid email");
  if (b.phone.replace(/\\D/g, "").length !== 10) throw new Error("Invalid phone");
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(b.date)) throw new Error("Invalid date");

  const [y,m,d] = b.date.split("-").map(Number);
  const eventDate = new Date(y, m - 1, d);
  if (eventDate.getFullYear() !== y || eventDate.getMonth() !== m - 1 || eventDate.getDate() !== d) throw new Error("Invalid date");
  const today = new Date();
  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (eventDate < todayDate) throw new Error("Past date");

  if (!/^([01]\\d|2[0-3]):[0-5]\\d$/.test(b.time)) throw new Error("Invalid time");
  if (!/^\\d+$/.test(b.attendance) || Number(b.attendance) < 1 || Number(b.attendance) > 1000000) throw new Error("Invalid attendance");
  if (b.venue.trim().length < 2 || b.location.trim().length < 2 || b.details.trim().length < 5) throw new Error("Incomplete event details");
}

function parseBody_(e) {
  if (!e || !e.postData || !e.postData.contents) throw new Error("Invalid request body");
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (_) {
    throw new Error("Request body must be valid JSON");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid JSON");
  return body;
}

function buildRow_(b, id) {
  return [
    id,
    new Date(b.submittedAt),
    b.name.trim(),
    b.email.trim().toLowerCase(),
    normalizePhone_(b.phone),
    b.eventType.trim(),
    parseDate_(b.date),
    b.time,
    b.venue.trim(),
    b.location.trim(),
    parseMoney_(b.pay),
    Number(b.attendance),
    b.details.trim(),
    "New Inquiry",
    "", "", "",
    parseMoneyOrBlank_(b.quote),
    "", "", "", "", "", "", "", "",
    "", "", "", ""
  ];
}

function normalizePhone_(phone) {
  const digits = String(phone).replace(/\\D/g, "");
  return digits.slice(0,3) + "-" + digits.slice(3,6) + "-" + digits.slice(6);
}

function parseDate_(value) {
  const [y,m,d] = String(value).split("-").map(Number);
  return new Date(y, m - 1, d);
}

function parseMoney_(value) {
  const n = Number(String(value).replace(/[$,\\s]/g, ""));
  return Number.isFinite(n) ? n : String(value).trim();
}

function parseMoneyOrBlank_(value) {
  if (value === undefined || value === null || String(value).trim() === "") return "";
  return parseMoney_(value);
}

function nextBookingId_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return "BLK-0001";

  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues().flat();
  let max = 0;
  ids.forEach(id => {
    const match = String(id).match(/^BLK-(\\d+)$/);
    if (match) max = Math.max(max, Number(match[1]));
  });
  return "BLK-" + String(max + 1).padStart(4, "0");
}

function getOrCreateSheet_(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function json_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

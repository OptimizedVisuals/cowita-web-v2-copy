/**
 * ============================================================================
 *  CoWiTa — Form submissions database + email confirmations
 * ============================================================================
 *
 *  WHAT THIS DOES
 *
 *  1. Receives every website form submission (talent, learn, mentor,
 *     collaborate, partner, contact, support) via a POST request.
 *  2. Saves each submission as a new row in a Google Sheet tab that matches
 *     the form type ("Talent", "Learn", "Mentor", ...). Each tab starts with
 *     a Timestamp column, then one column per form field, using friendly
 *     headers. New fields added to the website later are appended as new
 *     columns automatically, so no data is ever dropped.
 *  3. Sends a confirmation email to the person who submitted the form.
 *  4. Sends a notification email to your team with the submission details.
 *
 *  SETUP (once, about 5 minutes) — full walkthrough in apps-script/SETUP.md
 *
 *  1. Create a Google Sheet, e.g. "CoWiTa Form Submissions".
 *  2. Extensions -> Apps Script. Replace the default code with this file.
 *  3. Set TEAM_EMAIL below to the inbox that should receive notifications.
 *  4. Run setUp() once from the editor (it creates the tabs and sends a
 *     test notification so you can confirm email delivery works).
 *  5. Deploy -> New deployment -> Web app.
 *        Execute as: Me
 *        Who has access: Anyone
 *     Copy the /exec URL into js/config.js on the website.
 * ============================================================================
 */

var APP_NAME = 'CoWiTa';

/** Inbox that receives a notification for every submission. */
var TEAM_EMAIL = 'info@cowita.org';

/** Display name used on outgoing emails. */
var FROM_NAME = 'CoWiTa';

/** Contact address shown in email footers. */
var CONTACT_EMAIL = 'info@cowita.org';

/** Where the live website lives (used in email links). */
var SITE_URL = 'https://cowita.org';

/**
 * Form registry: one Google Sheet tab per form.
 * sheet   – tab name (acts as the database table)
 * label   – human-readable form name used in emails
 * subject – subject line of the applicant's confirmation email
 * message – opening paragraph of the applicant's confirmation email
 */
var FORM_CONFIG = {
  talent: {
    sheet: 'Talent',
    label: 'I Have Talent',
    subject: 'We have received your application — CoWiTa',
    message:
      'Thank you for telling us about your talent. We have received your application and it is now being processed. Our team will review it and get back to you at this email address.',
  },
  learn: {
    sheet: 'Learn',
    label: 'I Want to Learn',
    subject: 'We have received your learning request — CoWiTa',
    message:
      'Thank you for telling us what you want to learn. We have received your request and it is being processed. Our team will review it and reach out using the details you shared.',
  },
  mentor: {
    sheet: 'Mentor',
    label: 'I Want to Mentor',
    subject: 'Thank you for offering to mentor — CoWiTa',
    message:
      'Thank you for offering to share your experience with young people. We have received your details and they are being processed. Our team will review them and be in touch.',
  },
  collaborate: {
    sheet: 'Collaborate',
    label: 'I Want to Collaborate',
    subject: 'We have received your collaboration idea — CoWiTa',
    message:
      'Thank you for wanting to build something meaningful with CoWiTa. We have received your submission and it is being processed. Our team will review it and respond soon.',
  },
  partner: {
    sheet: 'Partner',
    label: 'I Want to Partner',
    subject: 'We have received your partnership interest — CoWiTa',
    message:
      'Thank you for your interest in partnering with CoWiTa. We have received your details and they are being processed. Our team will review them and respond soon.',
  },
  contact: {
    sheet: 'Contact',
    label: 'General Enquiry',
    subject: 'We have received your message — CoWiTa',
    message:
      'Thank you for getting in touch with CoWiTa. We have received your message and it is being processed. Our team will reply to this email address as soon as we can.',
  },
  support: {
    sheet: 'Support',
    label: 'Financial Support',
    subject: 'Thank you for supporting CoWiTa',
    message:
      'Thank you for your generosity. We have received your offer of support and it is being processed. Our team will review the details and contact you about the next steps.',
  },
  test: {
    sheet: 'Test',
    label: 'Connection Test',
    subject: 'CoWiTa forms test submission',
    message: 'This is a test submission to verify the form pipeline works.',
  },
};

/**
 * Fields that control submission routing only and are not stored as data
 * columns (form type goes into the tab name; honeypot filters spam).
 */
var META_FIELDS = ['form_type', 'honeypot', 'debug'];

/**
 * Friendly column headers / email labels for known fields. Anything not
 * listed is stored under a prettified version of its raw field name.
 */
var COLUMN_LABELS = {
  full_name: 'Full name',
  name: 'Name',
  email: 'Email',
  phone: 'Phone',
  location: 'Location',
  age: 'Age / age range',
  age_range: 'Age range',
  discipline: 'Main creative area',
  specific_talent: 'Specific talent / skill',
  experience_level: 'Experience level',
  current_level: 'Current level',
  talent_description: 'Talent description',
  portfolio: 'Portfolio / social link',
  development_goal: 'What would you like to develop?',
  availability: 'Availability',
  preferred_format: 'Preferred way to participate',
  other_information: 'Other information',
  talent_preview: 'Talent area (quick pick)',
  learning_area: 'Learning areas',
  learning_goal: 'What would you like to learn or improve?',
  reason: 'Why do you want to learn this?',
  desired_outcome: 'Desired outcome',
  previous_experience: 'Previous experience',
  additional_information: 'Additional information',
  profession: 'Profession / role',
  organisation: 'Organisation / company',
  years_experience: 'Years of experience',
  website: 'Portfolio / LinkedIn / website',
  expertise: 'Areas of expertise',
  mentoring_format: 'Preferred mentoring format',
  mentoring_motivation: 'Why do you want to mentor?',
  reference: 'How did you hear about us?',
  bringing: 'What are you bringing?',
  collaboration_idea: 'Collaboration idea',
  partnership_type: 'Partnership type',
  support_area: 'Area of interest',
  message: 'Message',
  subject_field: 'Subject',
  enquiry_type: 'Reason for contact',
  support_type: 'How would you like to support?',
  support_amount: 'Contribution amount',
  contribution_frequency: 'Frequency',
  consent: 'Consent',
};

/* ==========================================================================
   WEB APP ENTRY POINT
   ========================================================================== */

function doPost(request) {
  return handleSubmission(request);
}

/**
 * Accepts submissions sent either as regular form data (request.parameter)
 * or as JSON (request.postData.contents). Handles both so the same backend
 * can serve the website, tests and integrations.
 */
function handleSubmission(request) {
  var data = readRequestData_(request);

  if (!data) {
    return json_({ ok: false, error: 'Invalid request body.' });
  }

  // Honeypot: hidden field that only bots fill in. Pretend success.
  if (data.honeypot) {
    return json_({ ok: true });
  }

  var typeKey = String(data.form_type || 'contact').trim();
  var typeConfig = FORM_CONFIG[typeKey];

  if (!typeConfig) {
    return json_({ ok: false, error: 'Unknown form type: ' + typeKey });
  }

  if (!isValidEmail_(data.email)) {
    return json_({ ok: false, error: 'A valid email address is required.' });
  }

  var storedData = buildStoredData_(data);

  try {
    var rowNumber = appendToSheet_(typeConfig.sheet, storedData);
    sendEmails_(storedData, typeConfig, rowNumber);
  } catch (error) {
    console.error('CoWiTa submission failed: ' + error);
    return json_({ ok: false, error: 'Could not record the submission.' });
  }

  return json_({ ok: true, type: typeKey });
}

/** Normalises form-encoded or JSON bodies into one flat object. */
function readRequestData_(request) {
  if (!request) {
    return null;
  }

  if (request.parameter && Object.keys(request.parameter).length) {
    return request.parameter;
  }

  if (
    request.postData &&
    request.postData.contents &&
    String(request.postData.mimeType || '').indexOf('json') !== -1
  ) {
    try {
      return JSON.parse(request.postData.contents);
    } catch (error) {
      return null;
    }
  }

  return null;
}

/** Flattens arrays ("a", "b") and trims strings before storing. */
function buildStoredData_(data) {
  var stored = {};

  Object.keys(data).forEach(function (field) {
    if (META_FIELDS.indexOf(field) !== -1) {
      return;
    }

    var value = data[field];

    if (value === null || typeof value === 'undefined') {
      value = '';
    }

    if (Object.prototype.toString.call(value) === '[object Array]') {
      value = value
        .map(function (item) {
          return String(item).trim();
        })
        .filter(String);

      value = value.join(', ');
    }

    value = String(value).trim();

    if (field === 'consent') {
      value = 'Yes';
    }

    stored[field] = value;
  });

  return stored;
}

/* ==========================================================================
   "DATABASE" — ONE SHEET TAB PER FORM
   ========================================================================== */

/**
 * Appends a submission row to the given tab. The first column is always a
 * timestamp; data columns are created on demand so newly added website
 * fields are picked up without any maintenance.
 */
function appendToSheet_(tabName, data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(tabName);

  if (!sheet) {
    sheet = ss.insertSheet(tabName);
    sheet.appendRow(['Timestamp']);
  }

  var lastColumn = sheet.getLastColumn();
  var headers =
    lastColumn > 0
      ? sheet.getRange(1, 1, 1, lastColumn).getValues()[0]
      : ['Timestamp'];

  var newFields = Object.keys(data).filter(function (field) {
    return headers.indexOf(headerLabel_(field)) === -1;
  });

  newFields.forEach(function (field, index) {
    sheet
      .getRange(1, lastColumn + 1 + index)
      .setValue(headerLabel_(field));
  });

  headers = headers.concat(
    newFields.map(function (field) {
      return headerLabel_(field);
    })
  );

  var row = headers.map(function (header) {
    if (header === 'Timestamp') {
      return new Date();
    }

    var field = fieldForHeader_(header, data);
    return field ? data[field] : '';
  });

  sheet.appendRow(row);

  formatHeaderRow_(sheet, headers.length);

  return sheet.getLastRow();
}

/** Maps a stored field name to its column header label. */
function headerLabel_(field) {
  return COLUMN_LABELS[field] || prettifyFieldName(field);
}

/** Reverse lookup: finds the raw field name behind a column header. */
function fieldForHeader_(header, data) {
  var keys = Object.keys(data);

  for (var i = 0; i < keys.length; i++) {
    if (headerLabel_(keys[i]) === header) {
      return keys[i];
    }
  }

  return null;
}

function prettifyFieldName(name) {
  return String(name)
    .replace(/\[\]$/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, function (letter) {
      return letter.toUpperCase();
    });
}

function formatHeaderRow_(sheet, columnCount) {
  try {
    if (sheet.getLastRow() === 1) {
      var headerRange = sheet.getRange(1, 1, 1, columnCount);

      headerRange.setFontWeight('bold');
      headerRange.setBackground('#0b2926');
      headerRange.setFontColor('#f5f0e7');
      sheet.setFrozenRows(1);
    }
  } catch (error) {
    // Formatting is cosmetic; never let it break a submission.
  }
}

/* ==========================================================================
   EMAILS
   ========================================================================== */

function sendEmails_(data, typeConfig, rowNumber) {
  sendApplicantEmail_(data, typeConfig);
  sendTeamEmail_(data, typeConfig, rowNumber);
}

function sendApplicantEmail_(data, typeConfig) {
  var firstName =
    String(data.full_name || data.name || '')
      .trim()
      .split(/\s+/)[0] || 'there';

  var html =
    emailShell_(
      'Hi ' + escapeHtml_(firstName) + ',',
      typeConfig.message,
      submissionSummary_(data)
    ) +
    '<p style="margin:0 0 6px;color:#5a5a52;font-size:12px;">' +
    'You are receiving this email because you submitted the ' +
    escapeHtml_(typeConfig.label) +
    ' form on our website. If this was not you, you can ignore this message.' +
    '</p>';

  try {
    MailApp.sendEmail({
      to: data.email,
      subject: typeConfig.subject,
      htmlBody: html,
      name: FROM_NAME,
      replyTo: TEAM_EMAIL,
    });
  } catch (error) {
    console.error('Applicant email failed: ' + error);
  }
}

function sendTeamEmail_(data, typeConfig, rowNumber) {
  var html =
    emailShell_(
      'New ' + escapeHtml_(typeConfig.label) + ' submission',
      'A new submission has been recorded in the <strong>' +
        escapeHtml_(typeConfig.sheet) +
        '</strong> tab (row ' +
        rowNumber +
        ').',
      submissionSummary_(data)
    ) +
    '<p style="margin:0;color:#5a5a52;font-size:12px;">' +
    'Open the spreadsheet to follow up: ' +
    SpreadsheetApp.getActiveSpreadsheet().getUrl() +
    '</p>';

  try {
    MailApp.sendEmail({
      to: TEAM_EMAIL,
      subject:
        '[CoWiTa website] New ' +
        typeConfig.label +
        ' submission — ' +
        (data.full_name || data.name || data.email || ''),
      htmlBody: html,
      name: FROM_NAME,
    });
  } catch (error) {
    console.error('Team email failed: ' + error);
  }
}

/** Styled summary table of the submitted values. */
function submissionSummary_(data) {
  var rows = '';

  Object.keys(data).forEach(function (field) {
    var value = String(data[field] || '').trim();

    if (!value || field === 'consent' || field === 'honeypot') {
      return;
    }

    rows +=
      '<tr>' +
      '<td style="padding:8px 14px 8px 0;color:#5a5a52;font-size:13px;vertical-align:top;white-space:nowrap;">' +
      escapeHtml_(COLUMN_LABELS[field] || prettifyFieldName(field)) +
      '</td>' +
      '<td style="padding:8px 0;color:#1d1b15;font-size:13px;font-weight:600;">' +
      escapeHtml_(value) +
      '</td>' +
      '</tr>';
  });

  if (!rows) {
    return '';
  }

  return (
    '<div style="margin:26px 0;padding:18px 20px;background:#f5f0e7;border-left:4px solid #d8a83e;">' +
    '<strong style="display:block;margin-bottom:10px;">Submission summary</strong>' +
    '<table role="presentation" style="border-collapse:collapse;">' +
    rows +
    '</table>' +
    '</div>'
  );
}

/** Shared email layout: header, paragraphs, summary, footer. */
function emailShell_(heading) {
  var paragraphs = Array.prototype.slice.call(arguments, 1);
  var body = '';

  paragraphs.forEach(function (paragraph) {
    if (paragraph) {
      body +=
        '<p style="margin:0 0 16px;color:#1d1b15;font-size:15px;line-height:1.65;">' +
        paragraph +
        '</p>';
    }
  });

  return (
    '<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;">' +
    '<div style="background:#0b2926;color:#f5f0e7;padding:22px 26px;">' +
    '<span style="font-size:20px;font-weight:bold;letter-spacing:1px;">' +
    APP_NAME +
    '</span>' +
    '<span style="display:block;margin-top:4px;color:#e2bb59;font-size:12px;">' +
    'Turning talent into opportunity' +
    '</span>' +
    '</div>' +
    '<div style="padding:26px;border:1px solid #e5ded0;border-top:0;">' +
    '<h2 style="margin:0 0 18px;font-size:20px;color:#0b2926;">' +
    heading +
    '</h2>' +
    body +
    '</div>' +
    '<div style="padding:18px 26px;color:#5a5a52;font-size:12px;line-height:1.6;">' +
    'Questions? Email us at <a href="mailto:' +
    CONTACT_EMAIL +
    '" style="color:#0b2926;">' +
    CONTACT_EMAIL +
    '</a> or visit ' +
    SITE_URL +
    '.' +
    '</div>' +
    '</div>'
  );
}

/* ==========================================================================
   HELPERS
   ========================================================================== */

function json_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function isValidEmail_(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function escapeHtml_(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ==========================================================================
   ONE-TIME SETUP + MAINTENANCE
   ========================================================================== */

/**
 * Run once from the Apps Script editor: creates every tab used by the
 * website and emails a test notification so you can confirm email sending
 * works before going live.
 */
function setUp() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  Object.keys(FORM_CONFIG).forEach(function (key) {
    var tabName = FORM_CONFIG[key].sheet;

    if (!ss.getSheetByName(tabName)) {
      var sheet = ss.insertSheet(tabName);
      sheet.appendRow(['Timestamp']);
    }
  });

  MailApp.sendEmail({
    to: TEAM_EMAIL,
    subject: '[CoWiTa website] Form pipeline test',
    htmlBody: emailShell_(
      'Form pipeline is live',
      'This is a test notification from the CoWiTa form backend. If you are reading this, email sending works.'
    ),
    name: FROM_NAME,
  });
}

/** Deletes the Test tab rows — handy after setup. */
function clearTestData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Test');

  if (!sheet) {
    return;
  }

  var lastRow = sheet.getLastRow();

  if (lastRow > 1) {
    sheet.deleteRows(2, lastRow - 1);
  }
}

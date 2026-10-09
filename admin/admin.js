/**
 * CoWiTa admin dashboard.
 *
 * Sign-in is an emailed magic link followed by a TOTP code, so the session
 * reaches AAL2 before any submission data is requested. Every API call sends
 * the Supabase access token, and the server re-checks the role on each one.
 *
 * User-supplied data is rendered with textContent / createElement only —
 * never innerHTML — so stored answers cannot inject markup.
 */

(function () {
  'use strict';

  var CONFIG = window.COWITA_ADMIN_CONFIG || {};
  var FIELD_LABELS = {
    full_name: 'Full name',
    name: 'Name',
    email: 'Email',
    phone: 'Phone',
    age: 'Age',
    location: 'Location',
    organisation: 'Organisation',
    website: 'Website',
    profession: 'Profession',
    discipline: 'Discipline',
    specific_talent: 'Specific talent',
    experience_level: 'Experience level',
    talent_description: 'About their talent',
    development_goal: 'Development goal',
    availability: 'Availability',
    preferred_format: 'Preferred format',
    interest: 'Enquiry type',
    subject: 'Subject',
    message: 'Message',
    years_experience: 'Years of experience',
    expertise: 'Expertise',
    mentoring_focus: 'Mentoring focus',
    preferred_age_group: 'Preferred age group',
    preferred_commitment: 'Preferred commitment',
    introduction: 'Introduction',
    why_mentor: 'Why they want to mentor',
    partnership_title: 'Partnership title',
    partner_type: 'Organisation type',
    can_bring: 'Can bring',
    looking_for: 'Looking for',
    audience: 'Audience',
    description: 'Description',
    contribution: 'Contribution',
    support_needed: 'Support needed',
    participants: 'Participants',
    project_location: 'Project location',
    timeline: 'Timeline',
    relevant_links: 'Relevant links',
    additional_information: 'Additional information',
    bringing: 'Bringing',
    needs: 'Needs',
    collaboration_title: 'Collaboration title',
    target_audience: 'Target audience',
    expected_participants: 'Expected participants',
    proposed_location: 'Proposed location',
    proposed_timeline: 'Proposed timeline',
    age_range: 'Age range',
    learning_area: 'Learning area',
    current_level: 'Current level',
    learning_goal: 'Learning goal',
    reason: 'Reason',
    desired_outcome: 'Desired outcome',
    previous_experience: 'Previous experience',
    support_type: 'Support type',
    amount: 'Amount',
    frequency: 'Frequency',
    support_purpose: 'Support purpose',
    anonymous: 'Give anonymously',
    other_information: 'Other information',
    talent_preview: 'Quick-pick discipline',
  };

  var state = {
    client: null,
    session: null,
    role: null,
    email: null,
    page: 1,
    perPage: 25,
    totalPages: 1,
    submissions: [],
    selected: null,
    filters: {},
  };

  var els = {};

  document.addEventListener('DOMContentLoaded', init);

  /* =========================================================
     BOOTSTRAP
     ========================================================= */

  function init() {
    els = {
      authPanel: document.getElementById('admin-auth'),
      loginForm: document.getElementById('admin-login-form'),
      loginButton: document.getElementById('admin-login-button'),
      email: document.getElementById('admin-email'),
      authMessage: document.getElementById('admin-auth-message'),
      mfa: document.getElementById('admin-mfa'),
      mfaTitle: document.getElementById('admin-mfa-title'),
      mfaEnrol: document.getElementById('admin-mfa-enrol'),
      mfaQr: document.getElementById('admin-mfa-qr'),
      mfaSecret: document.getElementById('admin-mfa-secret'),
      mfaVerify: document.getElementById('admin-mfa-verify'),
      mfaForm: document.getElementById('admin-mfa-form'),
      mfaCode: document.getElementById('admin-mfa-code'),
      mfaButton: document.getElementById('admin-mfa-button'),
      mfaMessage: document.getElementById('admin-mfa-message'),
      shell: document.getElementById('admin-shell'),
      who: document.getElementById('admin-who'),
      signOut: document.getElementById('admin-signout'),
      filters: document.getElementById('admin-filters'),
      filterQ: document.getElementById('filter-q'),
      filterType: document.getElementById('filter-type'),
      filterStatus: document.getElementById('filter-status'),
      filterFrom: document.getElementById('filter-from'),
      filterTo: document.getElementById('filter-to'),
      exportButton: document.getElementById('admin-export'),
      listMessage: document.getElementById('admin-list-message'),
      rows: document.getElementById('admin-rows'),
      prev: document.getElementById('admin-prev'),
      next: document.getElementById('admin-next'),
      pageInfo: document.getElementById('admin-page-info'),
      detailBody: document.getElementById('admin-detail-body'),
      detailEmpty: document.getElementById('admin-detail-empty'),
      answers: document.getElementById('admin-answers'),
      status: document.getElementById('admin-status'),
      notes: document.getElementById('admin-notes'),
      save: document.getElementById('admin-save'),
      reply: document.getElementById('admin-reply'),
      remove: document.getElementById('admin-delete'),
      detailMessage: document.getElementById('admin-detail-message'),
      history: document.getElementById('admin-history'),
    };

    if (!window.supabase || !CONFIG.SUPABASE_URL || CONFIG.SUPABASE_URL.includes('your-project')) {
      setMessage(
        'auth',
        'The dashboard is not configured yet. Set SUPABASE_URL and SUPABASE_ANON_KEY in /admin/config.js.'
      );
      return;
    }

    state.client = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });

    els.loginForm.addEventListener('submit', onSendLink);
    els.mfaForm.addEventListener('submit', onVerifyCode);
    els.signOut.addEventListener('click', onSignOut);
    els.filters.addEventListener('submit', onApplyFilters);
    els.prev.addEventListener('click', function () {
      if (state.page > 1) {
        state.page -= 1;
        loadSubmissions();
      }
    });
    els.next.addEventListener('click', function () {
      if (state.page < state.totalPages) {
        state.page += 1;
        loadSubmissions();
      }
    });
    els.exportButton.addEventListener('click', onExport);
    els.save.addEventListener('click', onSave);
    els.remove.addEventListener('click', onDelete);

    resumeSession();
  }

  /* =========================================================
     AUTH
     ========================================================= */

  function resumeSession() {
    state.client.auth
      .getSession()
      .then(function (result) {
        var session = result.data && result.data.session;

        if (!session) {
          return checkAssurance();
        }

        state.session = session;
        return ensureMfa();
      })
      .catch(function (error) {
        console.error('session check failed', error);
        checkAssurance();
      });
  }

  function checkAssurance() {
    return state.client.auth.mfa
      .getAuthenticatorAssuranceLevel()
      .then(function (result) {
        var data = result.data || {};

        if (data.currentLevel === 'aal2') {
          return showDashboard();
        }

        if (data.nextLevel === 'aal2' && data.currentLevel === 'aal1') {
          els.mfa.hidden = false;
          els.mfaEnrol.hidden = true;
          els.mfaVerify.hidden = false;
          els.mfaTitle.textContent = 'Two-factor authentication';
          return null;
        }

        if (data.currentLevel === 'aal1' && data.nextLevel !== 'aal2') {
          els.mfa.hidden = false;
          els.mfaEnrol.hidden = false;
          els.mfaVerify.hidden = false;
          els.mfaTitle.textContent = 'Set up two-factor authentication';
          return startEnrolment();
        }

        return null;
      })
      .catch(function (error) {
        console.error('assurance check failed', error);
      });
  }

  function ensureMfa() {
    return state.client.auth.mfa.listFactors().then(function (result) {
      var factors = (result.data && result.data.totp) || [];
      var verified = factors.filter(function (factor) {
        return factor.status === 'verified';
      });

      els.mfa.hidden = false;

      if (verified.length) {
        els.mfaEnrol.hidden = true;
        els.mfaVerify.hidden = false;
        els.mfaTitle.textContent = 'Two-factor authentication';
        return null;
      }

      return startEnrolment();
    });
  }

  function startEnrolment() {
    return state.client.auth.mfa
      .enroll({ factorType: 'totp', friendlyName: 'CoWiTa dashboard ' + Date.now() })
      .then(function (result) {
        if (result.error) throw result.error;

        var totp = result.data.totp;

        els.mfaEnrol.hidden = false;
        els.mfaVerify.hidden = false;
        els.mfaQr.textContent = '';
        els.mfaSecret.textContent = totp.secret;

        if (totp.qr_code) {
          var img = document.createElement('img');
          img.src = totp.qr_code;
          img.alt = 'Two-factor authentication QR code';
          img.width = 180;
          img.height = 180;
          els.mfaQr.appendChild(img);
        }
      })
      .catch(function (error) {
        setMessage('mfa', 'Could not start two-factor setup: ' + describe(error));
      });
  }

  function onSendLink(event) {
    event.preventDefault();

    var email = els.email.value.trim();

    if (!email) {
      setMessage('auth', 'Enter your work email address.');
      return;
    }

    els.loginButton.disabled = true;
    setMessage('auth', 'Sending your sign-in link…');

    state.client.auth
      .signInWithOtp({
        email: email,
        options: { emailRedirectTo: window.location.origin + '/admin/' },
      })
      .then(function (result) {
        els.loginButton.disabled = false;

        if (result.error) {
          setMessage('auth', 'Could not send the link: ' + describe(result.error));
          return;
        }

        setMessage('auth', 'Check your inbox — open the link on this device to continue.');
      })
      .catch(function (error) {
        els.loginButton.disabled = false;
        setMessage('auth', 'Could not send the link: ' + describe(error));
      });
  }

  function onVerifyCode(event) {
    event.preventDefault();

    var code = els.mfaCode.value.trim();
    var factors = state.pendingFactorId;

    els.mfaButton.disabled = true;
    setMessage('mfa', 'Checking your code…');

    var withFactor = factors
      ? Promise.resolve({ data: { id: factors }, error: null })
      : state.client.auth.mfa.listFactors().then(function (result) {
          var list = (result.data && result.data.totp) || [];
          var verified = list.find(function (factor) {
            return factor.status === 'verified';
          });
          var unverified = list.find(function (factor) {
            return factor.status === 'unverified';
          });
          return { data: { id: (verified || unverified || {}).id }, error: null };
        });

    withFactor
      .then(function (result) {
        var factorId = result.data && result.data.id;

        if (!factorId) {
          throw new Error('No authentication factor found. Reload the page.');
        }

        return state.client.auth.mfa
          .challenge({ factorId: factorId, code: code })
          .then(function (challenge) {
            if (challenge.error) throw challenge.error;

            return state.client.auth.mfa.verify({
              factorId: factorId,
              challengeId: challenge.data.id,
              code: code,
            });
          });
      })
      .then(function (verify) {
        els.mfaButton.disabled = false;

        if (verify.error) {
          setMessage('mfa', 'That code was not accepted. Please try again.');
          els.mfaCode.value = '';
          return;
        }

        return state.client.auth.getSession().then(function (result) {
          state.session = result.data.session;
          return showDashboard();
        });
      })
      .catch(function (error) {
        els.mfaButton.disabled = false;
        setMessage('mfa', 'Verification failed: ' + describe(error));
      });
  }

  function onSignOut() {
    state.client.auth.signOut().then(function () {
      window.location.reload();
    });
  }

  function showDashboard() {
    return api('GET', '/me').then(function (result) {
      if (!result.ok) {
        setMessage('mfa', result.error || 'Access denied.');
        return;
      }

      state.role = result.role;
      state.email = result.email;

      els.authPanel.hidden = true;
      els.shell.hidden = false;
      els.who.textContent = result.email + ' (' + result.role + ')';

      return loadSubmissions();
    });
  }

  /* =========================================================
     DATA
     ========================================================= */

  function api(method, path, body) {
    return fetch(CONFIG.API_BASE + path, {
      method: method,
      headers: {
        Authorization: 'Bearer ' + (state.session ? state.session.access_token : ''),
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    }).then(function (response) {
      return response
        .json()
        .catch(function () {
          return null;
        })
        .then(function (payload) {
          if (payload) return payload;
          return { ok: false, error: 'Unexpected response from the server (' + response.status + ').' };
        });
    });
  }

  function queryString() {
    var params = new URLSearchParams();
    var filters = state.filters;

    Object.keys(filters).forEach(function (key) {
      if (filters[key]) params.set(key, filters[key]);
    });

    params.set('page', String(state.page));
    params.set('per_page', String(state.perPage));

    return params.toString();
  }

  function loadSubmissions() {
    setMessage('list', 'Loading…');

    return api('GET', '/submissions?' + queryString()).then(function (result) {
      if (!result.ok) {
        setMessage('list', result.error || 'Could not load submissions.');
        if (result.code === 'mfa_required') requireReauth();
        return;
      }

      state.submissions = result.submissions || [];
      state.totalPages = result.total_pages || 1;

      renderRows();
      els.pageInfo.textContent =
        'Page ' + result.page + ' of ' + state.totalPages + ' · ' + result.total + ' total';
      els.prev.disabled = result.page <= 1;
      els.next.disabled = result.page >= state.totalPages;

      setMessage('list', state.submissions.length ? '' : 'No submissions match these filters.');
    });
  }

  function requireReauth() {
    state.session = null;
    els.shell.hidden = true;
    els.authPanel.hidden = false;
    setMessage('auth', 'Your session needs to be re-verified. Please sign in again.');
  }

  function renderRows() {
    els.rows.textContent = '';

    state.submissions.forEach(function (submission) {
      var row = document.createElement('tr');
      row.tabIndex = 0;
      row.className = 'admin-row';
      row.dataset.id = submission.id;

      row.appendChild(cell(formatDate(submission.created_at)));
      row.appendChild(cell(submission.full_name || '—'));
      row.appendChild(cell(submission.email || '—'));
      row.appendChild(cell(labelForForm(submission.form_type)));
      row.appendChild(cell(statusLabel(submission.status)));

      function open() {
        selectSubmission(submission.id);
      }

      row.addEventListener('click', open);
      row.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          open();
        }
      });

      els.rows.appendChild(row);
    });
  }

  function cell(text) {
    var td = document.createElement('td');
    td.textContent = text;
    return td;
  }

  function selectSubmission(id) {
    Array.prototype.forEach.call(els.rows.querySelectorAll('.admin-row'), function (row) {
      row.classList.toggle('is-selected', row.dataset.id === id);
    });

    setMessage('detail', 'Loading…');

    api('GET', '/submissions/' + id).then(function (result) {
      if (!result.ok) {
        setMessage('detail', result.error || 'Could not load that submission.');
        return;
      }

      state.selected = result.submission;

      els.detailEmpty.hidden = true;
      els.detailBody.hidden = false;

      els.answers.textContent = '';

      var payload = result.submission.payload || {};
      var keys = Object.keys(payload).filter(function (key) {
        return key !== 'consent' && key !== 'honeypot';
      });

      keys.forEach(function (key) {
        var dt = document.createElement('dt');
        dt.textContent = FIELD_LABELS[key] || key;

        var dd = document.createElement('dd');
        dd.textContent = formatValue(payload[key]);

        els.answers.appendChild(dt);
        els.answers.appendChild(dd);
      });

      var meta = [
        ['Received', formatDate(result.submission.created_at)],
        ['Form', labelForForm(result.submission.form_type)],
        ['Phone', result.submission.phone || '—'],
        ['Age', result.submission.age == null ? '—' : String(result.submission.age)],
      ];

      meta.forEach(function (pair) {
        var dt = document.createElement('dt');
        dt.className = 'admin-meta-key';
        dt.textContent = pair[0];
        var dd = document.createElement('dd');
        dd.textContent = pair[1];
        els.answers.appendChild(dt);
        els.answers.appendChild(dd);
      });

      els.status.value = result.submission.status;
      els.notes.value = result.submission.internal_notes || '';
      els.reply.href = result.submission.email
        ? 'mailto:' + result.submission.email
        : '#';

      els.history.textContent = '';
      (result.events || []).forEach(function (event) {
        var item = document.createElement('li');
        var parts = [
          formatDate(event.created_at),
          event.action.replace(/_/g, ' '),
          event.to_status ? '→ ' + statusLabel(event.to_status) : '',
          event.actor_email || '',
        ].filter(Boolean);
        item.textContent = parts.join(' · ');
        els.history.appendChild(item);
      });

      setMessage('detail', '');
    });
  }

  function onSave() {
    if (!state.selected) return;

    els.save.disabled = true;
    setMessage('detail', 'Saving…');

    api('PATCH', '/submissions/' + state.selected.id, {
      status: els.status.value,
      internal_notes: els.notes.value,
    })
      .then(function (result) {
        els.save.disabled = false;

        if (!result.ok) {
          setMessage('detail', result.error || 'Could not save changes.');
          return;
        }

        setMessage('detail', 'Saved.');
        return loadSubmissions().then(function () {
          return selectSubmission(state.selected.id);
        });
      })
      .catch(function () {
        els.save.disabled = false;
        setMessage('detail', 'Could not save changes.');
      });
  }

  function onDelete() {
    if (!state.selected) return;

    if (!window.confirm('Delete this submission? It will be hidden from the list.')) {
      return;
    }

    api('DELETE', '/submissions/' + state.selected.id).then(function (result) {
      if (!result.ok) {
        setMessage('detail', result.error || 'Could not delete.');
        return;
      }

      state.selected = null;
      els.detailBody.hidden = true;
      els.detailEmpty.hidden = false;
      setMessage('detail', 'Submission deleted.');
      return loadSubmissions();
    });
  }

  function onExport() {
    var params = new URLSearchParams();

    Object.keys(state.filters).forEach(function (key) {
      if (state.filters[key]) params.set(key, state.filters[key]);
    });

    fetch(CONFIG.API_BASE + '/export?' + params.toString(), {
      headers: { Authorization: 'Bearer ' + state.session.access_token },
    })
      .then(function (response) {
        if (!response.ok) throw new Error('Export failed (' + response.status + ')');
        return response.blob();
      })
      .then(function (blob) {
        var url = URL.createObjectURL(blob);
        var link = document.createElement('a');
        link.href = url;
        link.download = 'cowita-submissions-' + new Date().toISOString().slice(0, 10) + '.csv';
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        setMessage('list', 'Export downloaded.');
      })
      .catch(function (error) {
        setMessage('list', describe(error));
      });
  }

  function onApplyFilters(event) {
    event.preventDefault();

    state.filters = {
      q: els.filterQ.value.trim(),
      form_type: els.filterType.value,
      status: els.filterStatus.value,
      from: els.filterFrom.value,
      to: els.filterTo.value,
    };

    state.page = 1;
    loadSubmissions();
  }

  /* =========================================================
     FORMATTING
     ========================================================= */

  function setMessage(which, text) {
    var target =
      which === 'auth' ? els.authMessage : which === 'mfa' ? els.mfaMessage : which === 'detail' ? els.detailMessage : els.listMessage;

    if (target) target.textContent = text || '';
  }

  function describe(error) {
    if (!error) return 'Something went wrong.';
    return error.message || String(error);
  }

  function formatDate(value) {
    if (!value) return '—';
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function formatValue(value) {
    if (value === null || value === undefined || value === '') return '—';
    if (Array.isArray(value)) return value.join(', ');
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    return String(value);
  }

  function labelForForm(formType) {
    var labels = {
      contact: 'Contact',
      talent: 'Talent',
      mentor: 'Mentor',
      partner: 'Partner',
      collaborate: 'Collaborate',
      learn: 'Learn',
      support: 'Support',
    };
    return labels[formType] || formType;
  }

  function statusLabel(status) {
    var labels = {
      new: 'New',
      reviewed: 'Reviewed',
      contacted: 'Contacted',
      closed: 'Closed',
    };
    return labels[status] || status;
  }
})();

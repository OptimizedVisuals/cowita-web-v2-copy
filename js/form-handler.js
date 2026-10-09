/**
 * ============================================================================
 *  CoWiTa — form submission handler
 * ============================================================================
 *
 *  Takes over every <form data-cowita-form> on the site and submits the
 *  values to the CoWiTa API:
 *
 *      POST /api/forms/<form-type>          (see /api/README.md)
 *
 *  On success the visitor is sent to the confirmation page:
 *
 *      /get-involved/thank-you.html
 *
 *  Accessibility behaviour (WCAG 2.1 AA):
 *    - A error summary is rendered at the top of the form with links to each
 *      invalid field; focus is moved there when validation fails.
 *    - Every invalid field gets aria-invalid="true" and an associated inline
 *      error message linked via aria-describedby.
 *    - The honeypot field is never submitted and never blocks a human.
 *
 *  Also upgrades the talent quick-pick cards on have-talent.html so clicking
 *  one scrolls to the form and pre-selects the matching radio button.
 * ============================================================================
 */

(function () {
  'use strict';

  var CONFIRMATION_PAGE = '/get-involved/thank-you.html';
  var REQUEST_TIMEOUT_MS = 20000;
  var HONEYPOT_NAME = 'honeypot';
  var CONSENT_NAME = 'consent';
  var TURNSTILE_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  var TURNSTILE_RESPONSE_NAME = 'cf-turnstile-response';

  function apiBase() {
    return (
      window.COWITA_CONFIG &&
      typeof window.COWITA_CONFIG.API_BASE === 'string' &&
      window.COWITA_CONFIG.API_BASE
    ) || '/api/forms';
  }

  /* =========================================================
     BOOTSTRAP
     ========================================================= */

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    var forms = document.querySelectorAll('form[data-cowita-form]');

    Array.prototype.forEach.call(forms, function (form) {
      // Clear previous errors as soon as the user edits an errored field.
      form.addEventListener('input', function (event) {
        clearFieldError(event.target);
      });

      form.addEventListener('submit', function (event) {
        handleSubmit(event, form);
      });
    });

    initTurnstile();
    initTalentQuickPick();
  }

  /* =========================================================
     CAPTCHA (Cloudflare Turnstile)
     ========================================================= */

  function turnstileSiteKey() {
    return window.COWITA_CONFIG && window.COWITA_CONFIG.TURNSTILE_SITE_KEY;
  }

  function turnstileContainers(form) {
    return form.querySelectorAll('[data-cowita-turnstile]');
  }

  function initTurnstile() {
    var siteKey = turnstileSiteKey();

    if (!siteKey) {
      return;
    }

    var widgets = [];

    function render() {
      var forms = document.querySelectorAll('form[data-cowita-form]');

      Array.prototype.forEach.call(forms, function (form) {
        if (turnstileContainers(form).length) {
          return;
        }

        var container = document.createElement('div');
        container.className = 'form-turnstile';
        container.setAttribute('data-cowita-turnstile', '1');

        var consent = form.querySelector('.form-consent');

        if (consent && consent.parentNode) {
          consent.parentNode.insertBefore(container, consent);
        } else {
          form.appendChild(container);
        }

        try {
          var id = window.turnstile.render(container, {
            sitekey: siteKey,
            action: form.dataset.formType || 'contact',
          });

          widgets.push({ form: form, container: container, id: id });
        } catch (error) {
          console.error('CoWiTa Turnstile render failed:', error);
        }
      });

      window.__cowitaTurnstileWidgets = widgets;
    }

    if (window.turnstile) {
      render();
      return;
    }

    var script = document.createElement('script');
    script.src = TURNSTILE_SCRIPT;
    script.async = true;
    script.defer = true;
    script.onload = render;
    script.onerror = function () {
      console.error('CoWiTa Turnstile script failed to load.');
    };
    document.head.appendChild(script);
  }

  function turnstileToken(form) {
    var field = form.querySelector('[name="' + TURNSTILE_RESPONSE_NAME + '"]');
    return field ? field.value : '';
  }

  function resetTurnstile(form) {
    var widgets = window.__cowitaTurnstileWidgets || [];

    widgets.forEach(function (widget) {
      if (widget.form === form && window.turnstile && typeof window.turnstile.reset === 'function') {
        window.turnstile.reset(widget.id);
      }
    });
  }

  /* =========================================================
     SUBMISSION
     ========================================================= */

  function handleSubmit(event, form) {
    event.preventDefault();

    if (isHoneypotFilled(form)) {
      // Bot: send them somewhere harmless without submitting anything.
      window.location.href = CONFIRMATION_PAGE;
      return;
    }

    clearAllErrors(form);

    // Client-side validation; mirrors the server-side rules.
    var invalid = getInvalidFields(form);

    if (invalid.length) {
      showFieldErrors(form, invalid);
      return;
    }

    var payload = buildPayload(form);

    if (turnstileSiteKey()) {
      var token = turnstileToken(form);

      if (!token) {
        showGeneralError(
          form,
          'Please complete the verification challenge below before sending your form.'
        );
        resetTurnstile(form);
        return;
      }

      payload.turnstile_token = token;
    }

    var submitButton = form.querySelector('[type="submit"]');

    setBusyState(form, submitButton, true);

    fetchSubmission(form, payload)
      .then(function () {
        window.location.href = form.dataset.thankYouUrl || CONFIRMATION_PAGE;
      })
      .catch(function (error) {
        setBusyState(form, submitButton, false);
        resetTurnstile(form);

        if (error && error.fieldErrors) {
          showFieldErrors(form, serverProblems(form, error.fieldErrors));
          return;
        }

        var message =
          error && error.message
            ? error.message
            : 'Sorry — we could not submit your application just now. ' +
              'Please check your internet connection and try again, or ' +
              'email us at info@cowita.org.';

        showGeneralError(form, message);
        console.error('CoWiTa form submission failed:', error);
      });
  }

  /**
   * Validates the form against native constraints plus the explicit consent
   * rule, returning [{ field, message }] for every problem found.
   */
  function getInvalidFields(form) {
    var problems = [];

    Array.prototype.forEach.call(collectControls(form), function (field) {
      if (field.disabled || !field.name) {
        return;
      }

      if (field.type === 'file') {
        return;
      }

      if (typeof field.checkValidity === 'function' && !field.checkValidity()) {
        problems.push({
          field: field,
          message: validationMessage(field),
        });
      }
    });

    var consent = getConsentCheckbox(form);

    if (consent && !consent.checked && !problems.some(function (p) {
      return p.field === consent;
    })) {
      problems.push({
        field: consent,
        message:
          'You must confirm you have read and agree to the Privacy Policy.',
      });
    }

    return problems;
  }

  /**
   * Human-readable label for a field, used in the error summary.
   *
   * Prefers aria-label when present, because card-style checkboxes
   * (learning_area[], partner_type[], can_bring[], looking_for[],
   * bringing[], needs[], expertise[]) wrap the whole card in the <label>,
   * so labels[0].textContent would be the whole card.
   */
  function fieldLabel(field) {
    var ariaLabel = field.getAttribute('aria-label');

    if (ariaLabel && ariaLabel.trim()) {
      return ariaLabel.trim();
    }

    if (field.labels && field.labels.length) {
      var text = field.labels[0].textContent
        .replace(/\s+/g, ' ')
        .replace(/\s*\*\s*$/, '')
        .trim();

      if (text) {
        return text;
      }
    }

    return field.name ? field.name.replace(/_/g, ' ') : 'This field';
  }

  function validationMessage(field) {
    var validity = field.validity;

    if (validity.valueMissing) {
      return field.type === 'checkbox' || field.type === 'radio'
        ? 'Please choose an option.'
        : 'This field is required.';
    }

    if (validity.typeMismatch) {
      return field.type === 'email'
        ? 'Please enter a valid email address.'
        : 'Please enter a valid value.';
    }

    if (validity.tooShort) {
      return (
        'Please use at least ' + field.minLength + ' characters.'
      );
    }

    if (validity.tooLong) {
      return (
        'Please use no more than ' + field.maxLength + ' characters.'
      );
    }

    if (validity.rangeUnderflow || validity.rangeOverflow) {
      return 'Please enter a value between ' + field.min + ' and ' + field.max + '.';
    }

    if (validity.patternMismatch) {
      return 'Please match the requested format.';
    }

    return field.validationMessage || 'This value is not valid.';
  }

  /**
   * Every control that belongs to the form: nested controls AND controls
   * elsewhere in the document bound with the form="" attribute.
   */
  function collectControls(form) {
    var controls = [];

    if (form.elements && form.elements.length) {
      Array.prototype.push.apply(controls, form.elements);
    }

    if (form.id) {
      var associated = document.querySelectorAll('[form="' + cssEscape(form.id) + '"]');
      Array.prototype.forEach.call(associated, function (control) {
        if (controls.indexOf(control) === -1) {
          controls.push(control);
        }
      });
    }

    return controls;
  }

  function buildPayload(form) {
    var payload = {
      form_type: form.dataset.formType || 'contact',
    };

    if (window.COWITA_CONFIG && window.COWITA_CONFIG.DEBUG) {
      payload.debug = true;
    }

    var controls = collectControls(form);

    // Count checkboxes per name so a lone checkbox (consent, anonymous) is
    // sent as a single value while a real multi-select group becomes an array.
    var checkboxCounts = {};

    Array.prototype.forEach.call(controls, function (field) {
      if (field.type === 'checkbox' && field.name) {
        var name = field.name.replace(/\[\]$/, '');
        checkboxCounts[name] = (checkboxCounts[name] || 0) + 1;
      }
    });

    var checkboxGroups = {};

    Array.prototype.forEach.call(controls, function (field) {
      if (field.disabled || !field.name || field.type === 'file') {
        return;
      }

      // The honeypot must never reach the API payload.
      if (field.name === HONEYPOT_NAME) {
        return;
      }

      if (field.type === 'checkbox') {
        var key = field.name.replace(/\[\]$/, '');

        if (checkboxCounts[key] <= 1) {
          // A single checkbox is a yes/no answer, not a list.
          payload[key] = field.checked ? field.value : '';
          return;
        }

        if (!checkboxGroups[key]) {
          checkboxGroups[key] = [];
        }

        if (field.checked) {
          checkboxGroups[key].push(field.value);
        }

        return;
      }

      if (field.type === 'radio') {
        if (field.checked) {
          payload[field.name] = field.value;
        }

        return;
      }

      payload[field.name] = field.value;
    });

    Object.keys(checkboxGroups).forEach(function (key) {
      payload[key] = checkboxGroups[key];
    });

    return payload;
  }

  function fetchSubmission(form, payload) {
    var controller =
      typeof AbortController === 'function' ? new AbortController() : null;
    var timeoutId = controller
      ? setTimeout(function () {
          controller.abort();
        }, REQUEST_TIMEOUT_MS)
      : null;

    return fetch(apiBase() + '/' + encodeURIComponent(form.dataset.formType || 'contact'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller ? controller.signal : undefined,
    })
      .then(function (response) {
        clearTimeout(timeoutId);
        return response
          .json()
          .catch(function () {
            return null;
          })
          .then(function (result) {
            return { response: response, result: result };
          });
      })
      .then(function (outcome) {
        var response = outcome.response;
        var result = outcome.result;

        if (response.ok && (!result || result.ok !== false)) {
          return result;
        }

        var error = new Error(
          (result && result.error) ||
            'Submission rejected by the server. Please try again, or email us at info@cowita.org.'
        );

        if (result && result.errors) {
          error.fieldErrors = result.errors;
        }

        throw error;
      })
      .catch(function (error) {
        clearTimeout(timeoutId);

        if (error && error.name === 'AbortError') {
          throw new Error(
            'The request timed out. Please check your connection and try again.'
          );
        }

        if (error instanceof TypeError) {
          throw new Error(
            'We could not reach the CoWiTa server. Please check your internet connection and try again, or email us at info@cowita.org.'
          );
        }

        throw error;
      });
  }

  function isHoneypotFilled(form) {
    var honeypot = form.querySelector('input[name="' + HONEYPOT_NAME + '"]');

    return Boolean(honeypot && honeypot.value);
  }

  function getConsentCheckbox(form) {
    var controls = collectControls(form);
    var match = null;

    Array.prototype.forEach.call(controls, function (field) {
      if (!match && field.name === CONSENT_NAME && field.type === 'checkbox') {
        match = field;
      }
    });

    return match;
  }

  /* =========================================================
     ERROR UI (accessible field errors + summary)
     ========================================================= */

  /**
   * Turn the API's { fieldName: message } error map into the internal
   * [{ field, message }] shape, matching each name to its form control.
   */
  function serverProblems(form, errors) {
    var problems = [];

    Object.keys(errors || {}).forEach(function (name) {
      problems.push({
        field: findControl(form, name),
        message: String(errors[name]),
      });
    });

    return problems;
  }

  function findControl(form, name) {
    var controls = collectControls(form);
    var candidates = [name, name + '[]'];
    var found = null;

    Array.prototype.forEach.call(controls, function (field) {
      if (!found && field.name && candidates.indexOf(field.name) !== -1) {
        found = field;
      }
    });

    return found;
  }

  function showFieldErrors(form, problems) {
    var summary = document.createElement('div');
    summary.className = 'form-error-summary';
    summary.setAttribute('role', 'alert');
    summary.setAttribute('tabindex', '-1');

    var heading = document.createElement('h2');
    heading.className = 'form-error-summary-title';
    heading.textContent = 'There is a problem';
    summary.appendChild(heading);

    var list = document.createElement('ul');

    problems.forEach(function (problem) {
      var field = problem.field;
      var message = problem.message;

      // A server error may name a field we cannot locate in the DOM.
      if (!field || !field.setAttribute) {
        var orphan = document.createElement('li');
        orphan.textContent = message;
        list.appendChild(orphan);
        return;
      }

      paintFieldError(field, message);

      if (field.id) {
        var item = document.createElement('li');
        var link = document.createElement('a');
        link.href = '#' + field.id;
        link.textContent = fieldLabel(field) + ': ' + message;

        link.addEventListener('click', function (event) {
          event.preventDefault();
          field.focus();
          field.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });

        item.appendChild(link);
        list.appendChild(item);
      }
    });

    if (list.childNodes.length) {
      summary.appendChild(list);
    }

    form.insertBefore(summary, form.firstChild);

    // Focus management: move focus to the error summary.
    summary.focus();

    if (typeof summary.scrollIntoView === 'function') {
      summary.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function paintFieldError(field, message) {
    field.setAttribute('aria-invalid', 'true');

    var errorId = (field.id || field.name) + '-error';
    var existing = document.getElementById(errorId);

    if (existing) {
      existing.textContent = message;
    } else {
      var note = document.createElement('span');
      note.className = 'field-error-message';
      note.id = errorId;
      note.textContent = message;

      var host =
        field.closest('.talent-field, .partner-form-field, .form-field, .form-group') ||
        field.parentNode;

      if (host && host !== field) {
        host.appendChild(note);
      } else if (field.parentNode) {
        field.parentNode.appendChild(note);
      }
    }

    var describedBy = field.getAttribute('aria-describedby') || '';
    var parts = describedBy
      .split(/\s+/)
      .filter(function (token) {
        return token && token !== errorId;
      });

    parts.push(errorId);
    field.setAttribute('aria-describedby', parts.join(' '));
  }

  function clearFieldError(field) {
    if (!field || !field.name || field.name === HONEYPOT_NAME) {
      return;
    }

    if (field.getAttribute('aria-invalid') !== 'true') {
      return;
    }

    field.removeAttribute('aria-invalid');

    var errorId = (field.id || field.name) + '-error';
    var note = document.getElementById(errorId);

    if (note) {
      note.remove();
    }

    var describedBy = (field.getAttribute('aria-describedby') || '')
      .split(/\s+/)
      .filter(function (token) {
        return token && token !== errorId;
      })
      .join(' ');

    if (describedBy) {
      field.setAttribute('aria-describedby', describedBy);
    } else {
      field.removeAttribute('aria-describedby');
    }
  }

  function clearAllErrors(form) {
    var summary = form.querySelector('.form-error-summary');

    if (summary) {
      summary.remove();
    }

    // Two passes: the first clears errors on controls nested inside the
    // form; the second clears them on external controls bound with form="".
    Array.prototype.forEach.call(form.querySelectorAll('[aria-invalid="true"]'), function (
      field
    ) {
      clearFieldError(field);
    });

    Array.prototype.forEach.call(
      collectControls(form),
      function (field) {
        if (field.getAttribute && field.getAttribute('aria-invalid') === 'true') {
          clearFieldError(field);
        }
      }
    );

    Array.prototype.forEach.call(
      form.querySelectorAll('.field-error-message'),
      function (note) {
        note.remove();
      }
    );

    var general = form.querySelector('.form-error');

    if (general) {
      general.remove();
    }
  }

  function showGeneralError(form, message) {
    var errorBox = document.createElement('div');

    errorBox.className = 'form-error';
    errorBox.setAttribute('role', 'alert');
    errorBox.setAttribute('tabindex', '-1');
    errorBox.style.cssText =
      'margin-top:18px;padding:14px 16px;border-left:3px solid #b3432b;' +
      'background:rgba(179,67,43,0.08);color:#7c2d1a;font-size:0.9rem;line-height:1.6;';
    errorBox.textContent = message;

    var actions = form.querySelector('[type="submit"]');

    if (actions && actions.parentNode) {
      actions.parentNode.insertBefore(errorBox, actions.nextSibling);
    } else {
      form.appendChild(errorBox);
    }

    errorBox.focus();

    if (typeof errorBox.scrollIntoView === 'function') {
      errorBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function setBusyState(form, submitButton, busy) {
    form.classList.toggle('is-submitting', busy);

    if (submitButton) {
      submitButton.disabled = busy;

      if (busy) {
        submitButton.dataset.originalLabel = submitButton.textContent;
        submitButton.textContent = 'Submitting…';
      } else if (submitButton.dataset.originalLabel) {
        submitButton.textContent = submitButton.dataset.originalLabel;
      }
    }
  }

  function cssEscape(value) {
    if (window.CSS && window.CSS.escape) {
      return window.CSS.escape(value);
    }

    return value.replace(/["\\\]]/g, '\\$&');
  }

  /* =========================================================
     TALENT QUICK-PICK CARDS
     ========================================================= */

  /**
   * have-talent.html has radio cards ("talent_preview") bound to the form
   * via the form attribute. Selecting one now scrolls to the form and
   * mirrors the choice into the form's discipline radios.
   */
  function initTalentQuickPick() {
    var quickPicks = document.querySelectorAll('input[name="talent_preview"]');

    if (!quickPicks.length) {
      return;
    }

    Array.prototype.forEach.call(quickPicks, function (input) {
      input.addEventListener('change', function () {
        if (!input.checked) {
          return;
        }

        var form = document.getElementById('talent-intake-form');
        var discipline = form
          ? form.querySelector('input[name="discipline"][value="' + input.value + '"]')
          : null;

        if (discipline) {
          discipline.checked = true;
        }

        var formSection = document.getElementById('talent-form');

        if (formSection && typeof formSection.scrollIntoView === 'function') {
          formSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });
  }
})();
/* Bizosto Embed v1.0 — https://www.bizosto.com
   Paste this script into any website to automatically
   capture form submissions as leads in Bizosto CRM. */
(function () {
  'use strict';

  var script =
    document.currentScript ||
    document.querySelector('script[data-bizosto-key]') ||
    document.querySelector('script[data-key]');

  var key =
    (script && script.getAttribute('data-key')) ||
    (script && script.getAttribute('data-bizosto-key'));

  if (!key) {
    console.warn(
      '[Bizosto Embed] No embed key found. ' + 'Add data-key="YOUR_KEY" to your script tag.',
    );
    return;
  }

  var ENDPOINT = 'https://app.bizosto.com/api/embed/leads';

  var NAME_FIELDS = ['full_name', 'fullname', 'your-name', 'first_name', 'name', 'fname'];
  var EMAIL_FIELDS = ['your-email', 'email_address', 'email', 'e-mail'];
  var PHONE_FIELDS = ['telephone', 'mobile', 'phone', 'tel', 'phone_number'];
  var COMPANY_FIELDS = ['organization', 'company_name', 'business', 'company', 'firm'];
  var MESSAGE_FIELDS = ['description', 'comments', 'message', 'notes', 'inquiry', 'enquiry'];

  function matchField(fieldName, patterns) {
    var lower = fieldName.toLowerCase();
    for (var i = 0; i < patterns.length; i++) {
      if (lower.indexOf(patterns[i]) !== -1) return true;
    }
    return false;
  }

  function sendLead(data) {
    if (!data.email) return;
    try {
      fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-embed-key': key,
        },
        body: JSON.stringify({
          name: data.name || 'Unknown',
          email: data.email,
          phone: data.phone || undefined,
          company: data.company || undefined,
          message: data.message || 'Embed lead from ' + window.location.href,
          source: 'Embed',
          page: window.location.href,
          meta: {
            referrer: document.referrer || undefined,
            userAgent: navigator.userAgent,
          },
        }),
      }).catch(function () {});
    } catch (e) {}
  }

  function attachToForm(form) {
    if (form.__bizostoAttached) return;
    form.__bizostoAttached = true;

    form.addEventListener('submit', function () {
      var result = { name: '', email: '', phone: '', company: '', message: '' };

      try {
        var inputs = form.querySelectorAll('input, select, textarea');
        for (var i = 0; i < inputs.length; i++) {
          var el = inputs[i];
          var name = el.name || el.id || '';
          var val = (el.value || '').trim();
          if (!val || !name) continue;

          if (!result.email && matchField(name, EMAIL_FIELDS)) result.email = val.toLowerCase();
          else if (!result.name && matchField(name, NAME_FIELDS)) result.name = val;
          else if (!result.phone && matchField(name, PHONE_FIELDS)) result.phone = val;
          else if (!result.company && matchField(name, COMPANY_FIELDS)) result.company = val;
          else if (!result.message && matchField(name, MESSAGE_FIELDS)) result.message = val;
        }
      } catch (e) {}

      if (result.email) sendLead(result);
    });
  }

  function scanForms() {
    var forms = document.querySelectorAll('form');
    for (var i = 0; i < forms.length; i++) {
      attachToForm(forms[i]);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scanForms);
  } else {
    scanForms();
  }

  if (window.MutationObserver) {
    var observer = new MutationObserver(function () {
      scanForms();
    });
    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  console.info('[Bizosto Embed] Loaded. Watching for form submissions.');
})();

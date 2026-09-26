/**
 * KeepUpCoding API client — the single owner of session state and API access.
 *
 * Security model:
 *  - The browser NEVER holds platform keys, provider keys, or master secrets.
 *  - Sessions are HttpOnly cookies managed entirely by the server.
 *  - Virtual API key secrets are shown exactly once by the server and are
 *    never stored by this client (only copied to the clipboard on demand).
 *  - Protected UI is gated here for usability; the backend enforces it for real.
 */
(function () {
  'use strict';

  // Same-origin by default (reverse proxy routes /api and /v1 to the backend).
  // Optional override for local development against a separate API port.
  var API_BASE = (window.KEEPUP_API_BASE || '').replace(/\/$/, '');
  var PUBLIC_API_URL = window.KEEPUP_PUBLIC_API_URL || window.location.origin;

  var SESSION_KEY = 'keepup_session_state_v1';

  var session = {
    state: 'unknown', // unknown | authenticated | unauthenticated
    user: null,
    organization: null,
    role: null,
  };

  var sessionPromise = null;

  function readCachedState() {
    try {
      var cached = localStorage.getItem(SESSION_KEY);
      return cached === 'authenticated' || cached === 'unauthenticated' ? cached : 'unknown';
    } catch (e) {
      return 'unknown';
    }
  }

  function persistState() {
    try {
      if (session.state !== 'unknown') {
        localStorage.setItem(SESSION_KEY, session.state);
      }
    } catch (e) { /* storage unavailable — state stays in memory */ }
  }

  /**
   * Resolves the current session from the server (/api/me).
   * Deduplicated so concurrent callers share one request.
   */
  function getSession(force) {
    if (!force && session.state !== 'unknown' && sessionPromise) return sessionPromise;
    if (!force && session.state !== 'unknown') return Promise.resolve(session);
    if (sessionPromise && !force) return sessionPromise;

    session.state = readCachedState(); // optimistic hint while the request runs
    sessionPromise = api('/api/me', { allow401: true })
      .then(function (me) {
        session.state = 'authenticated';
        session.user = me.user;
        session.organization = me.organization;
        session.role = me.role;
        persistState();
        document.dispatchEvent(new CustomEvent('keepup:session', { detail: session }));
        return session;
      })
      .catch(function () {
        session.state = 'unauthenticated';
        session.user = null;
        session.organization = null;
        session.role = null;
        persistState();
        document.dispatchEvent(new CustomEvent('keepup:session', { detail: session }));
        return session;
      });
    return sessionPromise;
  }

  /**
   * Typed fetch wrapper. Parses the standard error envelope
   * { error: { code, message } } and rejects with an Error carrying status/code.
   */
  function api(path, opts) {
    opts = opts || {};
    return fetch(API_BASE + path, {
      method: opts.method || 'GET',
      headers: opts.body ? { 'Content-Type': 'application/json' } : {},
      credentials: 'include', // session cookie must flow to the API domain (cross-origin in production)
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    }).then(function (res) {
      return res.text().then(function (text) {
        var json = null;
        try { json = text ? JSON.parse(text) : null; } catch (e) { /* non-JSON */ }
        if (res.ok) return json;
        var err = (json && json.error) || {};
        var e = new Error(err.message || 'Request failed (' + res.status + ')');
        e.status = res.status;
        e.code = err.code || 'error';
        // A 403 may mean the session went stale (cookie expired/revoked
        // server-side while views keep firing). Revalidate ONCE: a dead
        // session redirects to sign-in exactly once instead of every view
        // retrying its loaders against an expired cookie; a live session
        // (genuine permission denial) surfaces the error normally.
        if (res.status === 403) reconcileSessionAfter403();
        throw e;
      });
    });
  }

  // Single-flight revalidation after a 403. One per page, deduplicated:
  // concurrent 403s share the same check and never loop.
  var revalidatingAfter403 = null;
  function reconcileSessionAfter403() {
    if (revalidatingAfter403) return revalidatingAfter403;
    revalidatingAfter403 = getSession(true)
      .then(function (s) {
        revalidatingAfter403 = null;
        if (s.state !== 'authenticated') {
          try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
          document.dispatchEvent(new CustomEvent('keepup:session', { detail: s }));
          if (typeof window.showSection === 'function') {
            window.showSection('login');
          }
        }
      })
      .catch(function () { revalidatingAfter403 = null; });
    return revalidatingAfter403;
  }

  // ------------------------------------------------------------------
  // Authentication
  // ------------------------------------------------------------------
  var Auth = {
    register: function (payload) {
      return api('/api/auth/register', { method: 'POST', body: payload }).then(function () {
        return getSession(true);
      });
    },
    login: function (email, password) {
      return api('/api/auth/login', { method: 'POST', body: { email: email, password: password } }).then(function (resp) {
        // A TOTP-mandated account gets 200 { totpRequired, challenge } with NO
        // session — surface the two-factor step instead of pretending to log in.
        if (resp && resp.totpRequired) {
          var err = new Error('Two-factor authentication required.');
          err.totpRequired = true;
          err.challenge = resp.challenge;
          throw err;
        }
        return getSession(true);
      });
    },
    totpChallenge: function (challenge, code) {
      return api('/api/auth/totp/challenge', { method: 'POST', body: { challenge: challenge, code: code } }).then(function () {
        return getSession(true);
      });
    },
    logout: function () {
      return api('/api/auth/logout', { method: 'POST' }).catch(function () { /* best effort */ }).then(function () {
        session.state = 'unauthenticated';
        session.user = null;
        session.organization = null;
        session.role = null;
        try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
        document.dispatchEvent(new CustomEvent('keepup:session', { detail: session }));
      });
    },
    requestPasswordReset: function (email) {
      return api('/api/auth/forgot-password', { method: 'POST', body: { email: email } });
    },
    resetPassword: function (token, password) {
      return api('/api/auth/reset-password', { method: 'POST', body: { token: token, password: password } });
    },
    verifyEmail: function (token) {
      return api('/api/auth/verify-email', { method: 'POST', body: { token: token } });
    },
    changePassword: function (currentPassword, newPassword) {
      return api('/api/auth/change-password', { method: 'POST', body: { currentPassword: currentPassword, newPassword: newPassword } });
    },
    resendVerification: function () {
      return api('/api/auth/resend-verification', { method: 'POST' });
    },
  };

  // ------------------------------------------------------------------
  // Authenticated app data (all tenant-scoped server-side)
  // ------------------------------------------------------------------
  var App = {
    me: function () { return api('/api/me'); },
    orgCurrent: function () { return api('/api/org/current'); },
    orgSummary: function () { return api('/api/org/dashboard/summary'); },
    orgSettings: function () { return api('/api/org/settings'); },
    updateOrgSettings: function (payload) { return api('/api/org/settings', { method: 'PUT', body: payload }); },
    members: function () { return api('/api/org/members'); },
    inviteMember: function (payload) { return api('/api/org/members', { method: 'POST', body: payload }); },
    updateMember: function (id, payload) { return api('/api/org/members/' + id, { method: 'PATCH', body: payload }); },
    removeMember: function (id) { return api('/api/org/members/' + id, { method: 'DELETE' }); },
    auditLogs: function (limit) { return api('/api/org/audit-logs?limit=' + (limit || 50)); },

    // Account deletion (data protection): request, status, cancel.
    requestDeletion: function () { return api('/api/org/deletion-request', { method: 'POST' }); },
    deletionStatus: function () { return api('/api/org/deletion-request'); },
    cancelDeletion: function () { return api('/api/org/deletion-request', { method: 'DELETE' }); },

    keys: function () { return api('/api/keys'); },
    createKey: function (payload) { return api('/api/keys', { method: 'POST', body: payload }); },
    rotateKey: function (id) { return api('/api/keys/' + id + '/rotate', { method: 'POST' }); },
    revokeKey: function (id) { return api('/api/keys/' + id, { method: 'DELETE' }); },
    /** Short-lived studio credential: minted server-side, expires quickly. */
    studioToken: function () { return api('/api/keys/studio-token', { method: 'POST' }); },

    balance: function () { return api('/api/billing/balance'); },
    transactions: function (limit) { return api('/api/billing/transactions?limit=' + (limit || 50)); },
    invoices: function () { return api('/api/billing/invoices'); },
    payments: function () { return api('/api/billing/payments'); },
    invoiceDownloadUrl: function (invoiceId) { return API_BASE + '/api/billing/invoices/' + encodeURIComponent(invoiceId) + '/download'; },
    budgets: function () { return api('/api/billing/budgets'); },
    saveBudgets: function (payload) { return api('/api/billing/budgets', { method: 'PUT', body: payload }); },
    checkoutSession: function (payload) {
      // payload: { amount, methodId?, country?, promoCode?, invoiceDetails? }
      return api('/api/billing/checkout-session', {
        method: 'POST',
        body: payload,
      });
    },
    checkoutQuote: function (payload) {
      return api('/api/billing/checkout-quote', { method: 'POST', body: payload });
    },
    paymentMethods: function (currency) {
      return api('/api/billing/payment-methods' + (currency ? `?currency=${encodeURIComponent(currency)}` : ''));
    },
    enterpriseRequest: function (payload) {
      return api('/api/billing/enterprise-request', { method: 'POST', body: payload });
    },

    guardrails: function () { return api('/api/org/settings/guardrails'); },
    saveGuardrails: function (payload) { return api('/api/org/settings/guardrails', { method: 'PUT', body: payload }); },
    saveGuardrailRule: function (payload) { return api('/api/org/settings/guardrails/rules', { method: 'POST', body: payload }); },
    deleteGuardrailRule: function (id) { return api('/api/org/settings/guardrails/rules/' + id, { method: 'DELETE' }); },
    previewGuardrails: function (text) { return api('/api/org/settings/guardrails/preview', { method: 'POST', body: { text: text } }); },
  };

  /**
   * Internal super-admin API (never linked from customer navigation; the
   * backend enforces the platform-super-admin role on every call).
   */
  var AdminPayments = {
    overview: function () { return api('/internal-admin/payments'); },
    transactions: function () { return api('/internal-admin/payments/transactions'); },
    refund: function (txId, payload) { return api('/internal-admin/payments/transactions/' + txId + '/refund', { method: 'POST', body: payload }); },
    diagnostics: function () { return api('/internal-admin/payments/diagnostics'); },
    updateProvider: function (providerKey, payload) {
      return api('/internal-admin/payments/' + providerKey, { method: 'PUT', body: payload });
    },
    methods: function (providerKey) { return api('/internal-admin/payments/' + providerKey + '/methods'); },
    updateMethod: function (providerKey, methodKey, payload) {
      return api('/internal-admin/payments/' + providerKey + '/methods/' + methodKey, { method: 'PUT', body: payload });
    },
    legalEntities: function () { return api('/internal-admin/payments/legal-entities'); },
    createLegalEntity: function (payload) { return api('/internal-admin/payments/legal-entities', { method: 'POST', body: payload }); },
    updateLegalEntity: function (id, payload) { return api('/internal-admin/payments/legal-entities/' + id, { method: 'PUT', body: payload }); },
    activateLegalEntity: function (id) { return api('/internal-admin/payments/legal-entities/' + id + '/activate', { method: 'POST' }); },
    bindProviderToEntity: function (entityId, providerKey) {
      return api('/internal-admin/payments/legal-entities/' + entityId + '/providers/' + providerKey, { method: 'PUT', body: { enabled: true } });
    },
  };

  /** Super-admin: LLM provider onboarding (wholesale API keys -> routed models).
   * API keys are write-only: responses never include them. */
  var AdminProviders = {
    list: function () { return api('/internal-admin/providers'); },
    create: function (payload) { return api('/internal-admin/providers', { method: 'POST', body: payload }); },
    update: function (id, payload) { return api('/internal-admin/providers/' + id, { method: 'PATCH', body: payload }); },
    remove: function (id) { return api('/internal-admin/providers/' + id, { method: 'DELETE' }); },
    test: function (id) { return api('/internal-admin/providers/' + id + '/test', { method: 'POST' }); },
    sync: function (id) { return api('/internal-admin/providers/' + id + '/sync', { method: 'POST' }); },
    reconcile: function () { return api('/internal-admin/providers/routes/reconcile', { method: 'POST' }); },
  };

  /** Catalog price management (cost/sell per model; sell >= cost + margin). */
  var AdminCatalog = {
    models: function () { return api('/internal-admin/models'); },
    updateModel: function (id, payload) { return api('/internal-admin/models/' + encodeURIComponent(id), { method: 'PUT', body: payload }); },
  };

  /** Public model catalog served by OUR gateway (OpenAI-compatible shape). */
  function listModels() {
    return fetch(API_BASE + '/v1/models', { credentials: 'omit' }).then(function (res) {
      if (!res.ok) throw new Error('Model catalog unavailable (' + res.status + ')');
      return res.json().then(function (body) { return body.data || []; });
    });
  }

  // ------------------------------------------------------------------
  // Route guarding (usability layer; the backend is the enforcement layer)
  // ------------------------------------------------------------------
  var PROTECTED_SECTIONS = ['dashboard', 'playground', 'keys', 'billing', 'budget', 'guardrails', 'account', 'onboarding'];
  var BILLING_SECTIONS = ['billing', 'budget']; // additionally require a billing-capable role client-side

  function isProtected(sectionId) {
    return PROTECTED_SECTIONS.indexOf(sectionId) !== -1;
  }

  /**
   * Returns a promise resolving to the section the user may view:
   * the requested one, or a redirect target ('login' / 'dashboard').
   */
  function authorizeSection(sectionId) {
    if (!isProtected(sectionId)) return Promise.resolve(sectionId);
    return getSession().then(function (s) {
      if (s.state !== 'authenticated') return 'login';
      if (BILLING_SECTIONS.indexOf(sectionId) !== -1 &&
          ['org_owner', 'org_admin', 'billing_manager'].indexOf(s.role) === -1) {
        return 'dashboard';
      }
      return sectionId;
    });
  }

  // ------------------------------------------------------------------
  // Header rendering — real states only, no fake identity before login
  // ------------------------------------------------------------------
  function initials(name) {
    if (!name) return '?';
    return name.trim().split(/\s+/).map(function (p) { return p[0]; }).join('').substring(0, 2).toUpperCase();
  }

  function renderAuthHeader() {
    var container = document.getElementById('auth-nav-container');
    if (!container) return;

    if (session.state === 'unknown') {
      container.innerHTML =
        '<div class="h-7 w-24 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse"></div>';
      return;
    }

    if (session.state === 'unauthenticated') {
      // Never show a balance while signed out — it is not the visitor's data.
      var balPill = document.getElementById('nav-balance');
      if (balPill) balPill.style.display = 'none';
      container.innerHTML =
        '<a href="#login" onclick="showSection(\'login\')" class="px-3 py-1.5 rounded-xl text-xs font-extrabold text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white cursor-pointer whitespace-nowrap">Sign in</a>' +
        '<button onclick="showSection(\'register\')" class="btn-soft-primary px-3.5 py-1.5 rounded-xl text-xs font-extrabold shadow-soft-primary flex items-center gap-1.5 cursor-pointer whitespace-nowrap">' +
        '<i class="fa-solid fa-user-plus text-[10px]"></i><span>Create account</span></button>';
      return;
    }

    var name = (session.user && session.user.name) || 'Account';
    var orgName = (session.organization && session.organization.name) || '';
    container.innerHTML =
      '<div class="flex items-center gap-2">' +
      '  <div class="flex items-center gap-2 bg-slate-100 dark:bg-slate-800/80 px-2.5 py-1 rounded-xl border border-slate-200 dark:border-slate-700">' +
      '    <div class="h-7 w-7 rounded-lg bg-gradient-primary text-white flex items-center justify-center font-extrabold text-xs shadow-soft-primary">' + initials(name) + '</div>' +
      '    <div class="hidden sm:flex flex-col text-left leading-none">' +
      '      <span class="text-xs font-extrabold text-slate-900 dark:text-white max-w-[140px] truncate">' + escapeHtml(name) + '</span>' +
      '      <span class="text-[9px] font-bold text-fuchsia-600 dark:text-fuchsia-400 max-w-[140px] truncate">' + escapeHtml(orgName || 'Personal workspace') + '</span>' +
      '    </div>' +
      '  </div>' +
      '  <button onclick="showSection(\'account\')" class="p-1.5 rounded-lg text-slate-500 hover:text-fuchsia-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer" title="Settings">' +
      '    <i class="fa-solid fa-gear text-xs"></i></button>' +
      '  <button onclick="apiLogout()" class="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer" title="Sign out">' +
      '    <i class="fa-solid fa-right-from-bracket text-xs"></i></button>' +
      '</div>';
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function apiLogout() {
    return Auth.logout().then(function () {
      if (window.showToast) showToast('Signed out');
      showSection('landing');
    });
  }

  document.addEventListener('keepup:session', renderAuthHeader);

  // Expose a minimal, intentional surface.
  window.KeepupAPI = {
    Auth: Auth,
    App: App,
    AdminPayments: AdminPayments,
    AdminProviders: AdminProviders,
    AdminCatalog: AdminCatalog,
    listModels: listModels,
    getSession: getSession,
    authorizeSection: authorizeSection,
    isProtected: isProtected,
    renderAuthHeader: renderAuthHeader,
    escapeHtml: escapeHtml,
    apiLogout: apiLogout,
    PUBLIC_API_URL: PUBLIC_API_URL,
    get session() { return session; },
  };
})();

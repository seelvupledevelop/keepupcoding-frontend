/**
 * KeepUpCoding Soft UI Client Application
 * Handles Real-time SSE Streaming, REST API Calls, Multi-Language i18n, and Theme Switching
 */

function getGatewayBaseUrl() {
  // Same-origin by default; KEEPUP_PUBLIC_API_URL wins (two-domain deploys:
  // app.<domain> frontend + api.<domain> gateway), then KEEPUP_API_BASE.
  return (window.KEEPUP_PUBLIC_API_URL || window.KEEPUP_API_BASE || window.location.origin).replace(/\/$/, '');
}

// Resolve the selected playground model, falling back to the first real option
// (skips the empty "Loading…" placeholder) so Stream buttons never send an
// undefined model.
function currentPlaygroundModel() {
  const sel = document.getElementById('play-model-select');
  if (!sel) return undefined;
  let v = sel.value;
  if (!v || sel.dataset.pendingDefault) {
    const first = sel.querySelector('option[value]:not([value=""])');
    if (first) { v = first.value; sel.value = first.value; }
    delete sel.dataset.pendingDefault;
  }
  return v || undefined;
}

const MODELS_DATA = [
  { id: 'nvidia/nemotron-nano-12b-v2-vl:free', name: 'Nemotron Nano 12B VL', provider: 'NVIDIA', context: '128k', cost: 'Free', badge: 'Ultra Fast', icon: 'fa-bolt', color: 'from-emerald-500 to-teal-400' },
  { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B Instruct', provider: 'Meta', context: '128k', cost: '$0.20 / 1M', badge: 'High Precision', icon: 'fa-network-wired', color: 'from-blue-600 to-cyan-400' },
  { id: 'openai/gpt-4o-mini', name: 'OpenAI GPT-4o Mini', provider: 'OpenAI', context: '128k', cost: '$0.15 / 1M', badge: 'Fast & Smart', icon: 'fa-robot', color: 'from-fuchsia-600 to-pink-500' },
  { id: 'deepseek/deepseek-chat', name: 'DeepSeek V3 Chat', provider: 'DeepSeek', context: '64k', cost: '$0.14 / 1M', badge: 'Reasoning', icon: 'fa-microchip', color: 'from-cyan-500 to-blue-600' },
  { id: 'anthropic/claude-3-5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'Anthropic', context: '200k', cost: '$3.00 / 1M', badge: 'Code & Logic', icon: 'fa-brain', color: 'from-purple-600 to-indigo-500' },
  { id: 'google/gemini-1.5-pro', name: 'Gemini 1.5 Pro', provider: 'Google', context: '2M', cost: '$1.25 / 1M', badge: 'Ultra Context', icon: 'fa-sparkles', color: 'from-amber-500 to-orange-500' }
];


// ==========================================
// Cookie & GDPR Consent (Soft UI banner)
// Essential cookies are always on (session).
// Analytics stay off until explicitly accepted.
// ==========================================
const CONSENT_KEY = 'keepup_cookie_consent_v1';

function initCookieConsent() {
  let stored = null;
  try { stored = localStorage.getItem(CONSENT_KEY); } catch (e) {}
  const banner = document.getElementById('cookie-consent');
  if (!banner) return;
  if (stored) return; // already decided
  banner.classList.remove('hidden');
}

function acceptCookies(all) {
  try {
    localStorage.setItem(CONSENT_KEY, JSON.stringify({
      essential: true,
      analytics: all === true,
      decidedAt: new Date().toISOString()
    }));
  } catch (e) {}
  closeCookieConsent();
  showToast(all ? 'Preferences saved. Thank you!' : 'Preferences saved. Only essential cookies are used.');
}

function closeCookieConsent() {
  const banner = document.getElementById('cookie-consent');
  if (banner) banner.classList.add('hidden');
}

// ==========================================
// Theme Management (Light & Dark Mode)
// ==========================================
function setTailwindTheme(themeName, showNotification = true) {
  if (themeName === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
  localStorage.setItem('keepup_tailwind_theme', themeName);
  
  const toggle = document.getElementById('theme-toggle-chk');
  if (toggle) toggle.checked = (themeName === 'dark');
  
  if (showNotification) showToast('Theme set to: ' + themeName.toUpperCase());
}

function toggleDarkLight(checkbox) {
  const newTheme = checkbox.checked ? 'dark' : 'light';
  setTailwindTheme(newTheme);
}

// ==========================================
// SPA Section Navigation
// ==========================================
const PROTECTED_SECTIONS = ['dashboard', 'playground', 'keys', 'budget', 'billing', 'account', 'onboarding', 'guardrails'];

// Client-side guard for usability. The backend enforces authorization for real.
function guardSection(secId) {
  if (!PROTECTED_SECTIONS.includes(secId)) return Promise.resolve(secId);
  return KeepupAPI.getSession().then(function (s) {
    return s.state === 'authenticated' ? secId : 'login';
  });
}

// Renders the real signed-in identity into the existing header container.
function renderSessionHeader() {
  return KeepupAPI.getSession().then(function (s) {
    const balancePill = document.querySelector('header button[onclick="openTopUpModal()"]');
    if (s.state !== 'authenticated') {
      // Signed out: the balance pill is meaningless, so hide it (no fake balance).
      if (balancePill) balancePill.classList.add('hidden');
      return; // keep default Sign Up / Sign In buttons
    }
    if (balancePill) balancePill.classList.remove('hidden');
    const authDiv = document.getElementById('auth-nav-container');
    if (!authDiv) return;
    const name = (s.user && s.user.name) || 'Account';
    const org = (s.organization && s.organization.name) || 'Personal workspace';
    const initials = name.trim().split(/\s+/).map(function (p) { return p[0]; }).join('').substring(0, 2).toUpperCase();
    authDiv.innerHTML = `
      <div class="flex items-center gap-2">
        <div class="flex items-center gap-2 bg-slate-100 dark:bg-slate-800/80 px-2.5 py-1 rounded-xl border border-slate-200 dark:border-slate-700">
          <div class="h-7 w-7 rounded-lg bg-gradient-primary text-white flex items-center justify-center font-extrabold text-xs shadow-soft-primary">${initials}</div>
          <div class="hidden sm:flex flex-col text-left leading-none">
            <span class="text-xs font-extrabold text-slate-900 dark:text-white">${KeepupAPI.escapeHtml(name)}</span>
            <span class="text-[9px] font-bold text-fuchsia-600 dark:text-fuchsia-400">${KeepupAPI.escapeHtml(org)}</span>
          </div>
        </div>
        <button onclick="showSection('account')" class="p-1.5 rounded-lg text-slate-500 hover:text-fuchsia-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer" title="Settings">
          <i class="fa-solid fa-gear text-xs"></i>
        </button>
        <button onclick="logout()" class="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer" title="Sign Out">
          <i class="fa-solid fa-right-from-bracket text-xs"></i>
        </button>
      </div>`;
  });
}

// Support: deep-link into the Hermes Desk ticket form (separate service).
// One owner for the URL decision: KEEPUP_SUPPORT_URL wins (operator override),
// then support.<domain> in production (same registrable domain as the app),
// then the local dev desk on :8095. window.open keeps the app session intact.
function supportUrl() {
  const explicit = window.KEEPUP_SUPPORT_URL;
  if (explicit) return explicit;
  const host = window.location.hostname;
  if (/\.(test|localhost|local)$/.test(host) || /^\d+\.\d+\.\d+\.\d+$/.test(host) || host === 'localhost') {
    return 'http://127.0.0.1:8095/';
  }
  const parts = host.split('.');
  if (parts.length > 2) return 'https://support.' + parts.slice(-2).join('.') + '/';
  return 'https://support.' + host + '/';
}
function openSupport() { window.open(supportUrl(), '_blank', 'noopener'); }

function showSection(secId, updateHash = true, _alreadyGuarded = false) {
  const validSections = ['login', 'tos', 'dashboard', 'playground', 'models', 'guardrails', 'keys', 'budget', 'billing', 'onboarding', 'account', 'sitemap', 'docs', 'landing', 'register', 'forgot-password', 'reset-password', 'verify-email', 'mcp', '404'];
  if (!validSections.includes(secId)) secId = '404';

  // Single auth gate for EVERY entry path. The hash router already guarded,
  // but in-page nav buttons call showSection directly and pushState never
  // fires hashchange — so protected sections must gate here too, or a
  // signed-out user clicking Dashboard/Billing/Keys sees the shell. Nothing
  // renders until the session check resolves. The _alreadyGuarded flag stops
  // the resolved branch from re-gating itself (infinite /api/me loop).
  if (PROTECTED_SECTIONS.includes(secId) && !_alreadyGuarded) {
    return guardSection(secId).then(function (resolved) {
      if (resolved === secId) {
        showSection(secId, updateHash, true);
      } else if (resolved === 'login') {
        showToast('Please sign in to continue.');
        showSection('login', updateHash);
      }
    });
  }

  validSections.forEach(s => {
    const el = document.getElementById('sec-' + s);
    const side = document.getElementById('side-' + s);
    if (el) el.classList.add('hidden');
    if (side) side.classList.remove('active');
  });

  const activeEl = document.getElementById('sec-' + secId);
  const activeSide = document.getElementById('side-' + secId);
  
  if (activeEl) activeEl.classList.remove('hidden');
  if (activeSide) activeSide.classList.add('active');

  if (updateHash && window.location.hash !== '#' + secId) {
    history.pushState(null, '', '#' + secId);
  }

  // Animate the sliding indicator to the clicked button smoothly
  requestAnimationFrame(() => {
    updateSlidingIndicators(secId);
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (secId === 'models') { catalogFromUrl(); applyCatalogState(); }
  if (secId === 'docs') switchDocTab('py');
  if (['dashboard', 'keys', 'billing', 'budget'].includes(secId)) loadData();
  if (secId === 'account') renderSecurityTab();
  if (secId === 'mcp') renderMcpSetup();
}

function sideTopClassReset(topBtn) {
  if (!topBtn) return;
  topBtn.classList.remove('active');
}

function routeFromUrl() {
  const rawHash = window.location.hash.replace('#', '');
  const [hashPart, queryPart] = rawHash.split('?');
  const hash = (hashPart || '').toLowerCase();
  const routeQuery = new URLSearchParams(queryPart || '');
  const path = window.location.pathname.replace('/', '').toLowerCase();
  // Default to 'landing' for logged out / new visitors, or hash route
  const target = hash || (path && path !== 'index.html' ? path : 'landing');

  // Token-bearing routes (from emails) run their handler before the guard:
  // they are public one-shot pages and must work while signed out.
  if (target === 'reset-password') {
    showSection('reset-password', false);
    handleResetTokenFromUrl(routeQuery);
    return;
  }
  if (target === 'verify-email') {
    showSection('verify-email', false);
    handleVerifyTokenFromUrl(routeQuery);
    return;
  }
  if (target === 'register') applyInviteFromUrl(routeQuery);

  guardSection(target).then(function (resolved) {
    if (resolved === 'login' && target !== 'login') {
      showToast('Please sign in to continue.');
    }
    showSection(resolved, false);
    if (resolved === 'login') renderSessionHeader();
  });
}

window.addEventListener('hashchange', () => { routeFromUrl(); });
window.addEventListener('popstate', () => { routeFromUrl(); });

// ==========================================
// Toast Notifications
// ==========================================
function showToast(msg) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'soft-card px-4 py-3 text-xs font-bold flex items-center gap-2.5 shadow-soft-lg pointer-events-auto border border-white/80 dark:border-white/10 text-slate-800 dark:text-white transition-all transform duration-300';
  toast.innerHTML = `<div class="h-6 w-6 rounded-full bg-gradient-success text-white flex items-center justify-center text-[10px] shadow-sm"><i class="fa-solid fa-check"></i></div><span>${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => { toast.remove(); }, 300);
  }, 3200);
}

// ==========================================
// 15-Language Real-Time Localization
// ==========================================
const TRANSLATIONS = {
  en: {
    brand_sub: "AI Gateway :8080",
    signup: "Sign Up",
    stat_models: "Active Models",
    stat_latency: "Edge Latency",
    stat_balance: "Prepaid Balance",
    stat_health: "Gateway Health",
    nav_dash: "Overview Cockpit",
    nav_studio: "LLM Streaming Studio",
    nav_landing: "Public Landing Page",
    nav_models: "140+ Model Catalog",
        nav_keys: "Virtual API Keys",
    nav_ledger: "Prepaid Ledger",
    nav_settings: "Settings & Teams",
    nav_sitemap: "System Page Map",
    nav_docs: "SDKs & API Reference",
    nav_auth: "Auth & Onboarding",
    stream_btn: "Stream",
    launch_studio: "Launch Full Studio →",
    copy_key: "Copy Key",
    new_key: "+ New Key",
    deposit_10: "+ Deposit $10",
    active_safeguards: "Active Edge Safeguards"
  },
  ru: {
    brand_sub: "Шлюз ИИ :8080",
    signup: "Регистрация",
    stat_models: "Активные модели",
    stat_latency: "Задержка шлюза",
    stat_balance: "Баланс счета",
    stat_health: "Статус шлюза",
    nav_dash: "Панель управления",
    nav_studio: "Студия LLM потока",
    nav_landing: "Главная страница",
    nav_models: "Каталог 140+ моделей",
        nav_keys: "Виртуальные API ключи",
    nav_ledger: "Финансовый реестр",
    nav_settings: "Настройки и Команда",
    nav_sitemap: "Карта системы",
    nav_docs: "SDK и Документация",
    nav_auth: "Авторизация и Вход",
    stream_btn: "Запуск",
    launch_studio: "Открыть студию →",
    copy_key: "Копировать",
    new_key: "+ Новый ключ",
    deposit_10: "+ Пополнить $10",
    active_safeguards: "Активная защита шлюза"
  },
  uk: {
    brand_sub: "Шлюз ШІ :8080",
    signup: "Реєстрація",
    stat_models: "Активні моделі",
    stat_latency: "Затримка шлюзу",
    stat_balance: "Баланс рахунку",
    stat_health: "Статус шлюзу",
    nav_dash: "Панель огляду",
    nav_studio: "Студія LLM потоку",
    nav_landing: "Головна сторінка",
    nav_models: "Каталог 140+ моделей",
        nav_keys: "Віртуальні API ключі",
    nav_ledger: "Фінансовий реєстр",
    nav_settings: "Налаштування та Команда",
    nav_sitemap: "Карта системи",
    nav_docs: "SDK та Документація",
    nav_auth: "Авторизація та Вхід",
    stream_btn: "Запуск",
    launch_studio: "Відкрити студію →",
    copy_key: "Копіювати",
    new_key: "+ Новий ключ",
    deposit_10: "+ Поповнити $10",
    active_safeguards: "Активний захист шлюзу"
  },
  'zh-CN': {
    brand_sub: "AI 网关 :8080",
    signup: "注册账户",
    stat_models: "活跃模型数量",
    stat_latency: "边缘代理延迟",
    stat_balance: "预付钱包余额",
    stat_health: "网关健康状态",
    nav_dash: "总览控制台",
    nav_studio: "LLM 流式调试工作室",
    nav_landing: "公共主页",
    nav_models: "140+ 大模型目录",
        nav_keys: "虚拟 API 密钥",
    nav_ledger: "预付财务账本",
    nav_settings: "工作区与团队",
    nav_sitemap: "系统全页面地图",
    nav_docs: "SDK 与 API 文档",
    nav_auth: "登录与认证中心",
    stream_btn: "运行流",
    launch_studio: "启动完整工作室 →",
    copy_key: "复制密钥",
    new_key: "+ 新建密钥",
    deposit_10: "+ 充值 $10",
    active_safeguards: "边缘主动防护"
  },
  ja: {
    brand_sub: "AI ゲートウェイ :8080",
    signup: "新規登録",
    stat_models: "有効モデル数",
    stat_latency: "エッジ応答遅延",
    stat_balance: "プリペイド残高",
    stat_health: "ゲートウェイ状態",
    nav_dash: "コックピット概要",
    nav_studio: "LLM ストリーミング",
    nav_landing: "パブリックトップ",
    nav_models: "140+ AIモデル一覧",
        nav_keys: "仮想 API キー",
    nav_ledger: "残高元帳",
    nav_settings: "設定とチーム",
    nav_sitemap: "システムマップ",
    nav_docs: "SDK＆APIリファレンス",
    nav_auth: "認証・登録ポータル",
    stream_btn: "ストリーム実行",
    launch_studio: "フルスタジオを開く →",
    copy_key: "キーをコピー",
    new_key: "+ 新規キー",
    deposit_10: "+ $10 チャージ",
    active_safeguards: "アクティブ保護機能"
  },
  ar: {
    brand_sub: "بوابة الذكاء الاصطناعي :8080",
    signup: "تسجيل جديد",
    stat_models: "النماذج النشطة",
    stat_latency: "سرعة الاستجابة",
    stat_balance: "الرصيد المسبق",
    stat_health: "حالة البوابة",
    nav_dash: "لوحة التحكم",
    nav_studio: "استوديو البث الحي",
    nav_landing: "الصفحة الرئيسية",
    nav_models: "دليل 140+ نموذجاً",
        nav_keys: "مفاتيح API الافتراضية",
    nav_ledger: "دفتر الحسابات",
    nav_settings: "الإعدادات والفريق",
    nav_sitemap: "خريطة النظام",
    nav_docs: "حزم البرمجة والتوثيق",
    nav_auth: "بوابة التسجيل",
    stream_btn: "بدء البث",
    launch_studio: "فتح الاستوديو ←",
    copy_key: "نسخ المفتاح",
    new_key: "+ مفتاح جديد",
    deposit_10: "+ إيداع 10$",
    active_safeguards: "الحماية النشطة"
  },
  tr: {
    brand_sub: "AI Ağ Geçidi :8080",
    signup: "Kayıt Ol",
    stat_models: "Aktif Modeller",
    stat_latency: "Kenar Gecikmesi",
    stat_balance: "Ön Ödemeli Bakiye",
    stat_health: "Ağ Geçidi Durumu",
    nav_dash: "Genel Bakış Paneli",
    nav_studio: "LLM Akış Stüdyosu",
    nav_landing: "Genel Karşılama",
    nav_models: "140+ Model Kataloğu",
        nav_keys: "Sanal API Anahtarları",
    nav_ledger: "Bakiye Defteri",
    nav_settings: "Ayarlar ve Ekipler",
    nav_sitemap: "Sistem Sayfa Haritası",
    nav_docs: "SDK & Dokümantasyon",
    nav_auth: "Kimlik Doğrulama",
    stream_btn: "Akışı Başlat",
    launch_studio: "Tam Stüdyoyu Aç →",
    copy_key: "Anahtarı Kopyala",
    new_key: "+ Yeni Anahtar",
    deposit_10: "+ $10 Yükle",
    active_safeguards: "Aktif Güvenlik"
  },
  de: {
    brand_sub: "KI-Gateway :8080",
    signup: "Registrieren",
    stat_models: "Aktive Modelle",
    stat_latency: "Edge-Latenz",
    stat_balance: "Guthaben",
    stat_health: "Gateway-Status",
    nav_dash: "Übersicht Cockpit",
    nav_studio: "LLM Streaming Studio",
    nav_landing: "Startseite",
    nav_models: "140+ Modell-Katalog",
        nav_keys: "Virtuelle API-Schlüssel",
    nav_ledger: "Finanz-Hauptbuch",
    nav_settings: "Einstellungen & Teams",
    nav_sitemap: "Seitenübersicht",
    nav_docs: "SDK & Dokumentation",
    nav_auth: "Anmeldung & Registrierung",
    stream_btn: "Streamen",
    launch_studio: "Studio öffnen →",
    copy_key: "Kopieren",
    new_key: "+ Neuer Schlüssel",
    deposit_10: "+ $10 aufladen",
    active_safeguards: "Aktive Edge-Schutzmaßnahmen"
  },
  fr: {
    brand_sub: "Passerelle IA :8080",
    signup: "S'inscrire",
    stat_models: "Modèles Actifs",
    stat_latency: "Latence Edge",
    stat_balance: "Solde Prépayé",
    stat_health: "État Passerelle",
    nav_dash: "Tableau de bord",
    nav_studio: "Studio Streaming LLM",
    nav_landing: "Page Publique",
    nav_models: "Catalogue 140+ Modèles",
        nav_keys: "Clés API Virtuelles",
    nav_ledger: "Grand Livre Financier",
    nav_settings: "Paramètres & Équipes",
    nav_sitemap: "Plan du Système",
    nav_docs: "SDK & Documentation",
    nav_auth: "Authentification",
    stream_btn: "Lancer le flux",
    launch_studio: "Ouvrir le Studio →",
    copy_key: "Copier la clé",
    new_key: "+ Nouvelle Clé",
    deposit_10: "+ Créditer $10",
    active_safeguards: "Protections Actives"
  },
  es: {
    brand_sub: "Pasarela IA :8080",
    signup: "Registrarse",
    stat_models: "Modelos Activos",
    stat_latency: "Latencia Edge",
    stat_balance: "Saldo Prepago",
    stat_health: "Estado Pasarela",
    nav_dash: "Panel de Control",
    nav_studio: "Estudio Streaming LLM",
    nav_landing: "Página Pública",
    nav_models: "Catálogo 140+ Modelos",
        nav_keys: "Claves API Virtuales",
    nav_ledger: "Libro Contable",
    nav_settings: "Ajustes y Equipos",
    nav_sitemap: "Mapa del Sistema",
    nav_docs: "SDKs y Documentación",
    nav_auth: "Autenticación",
    stream_btn: "Ejecutar",
    launch_studio: "Abrir Estudio →",
    copy_key: "Copiar Clave",
    new_key: "+ Nueva Clave",
    deposit_10: "+ Cargar $10",
    active_safeguards: "Protecciones Activas"
  }
};

// ==========================================================================
// i18n core — locale files + selection order + fallback
//
// Selection order (per docs/I18N.md):
//   1. URL locale   (#/es/... or ?lang=es)   2. saved visitor preference
//   3. browser Accept-Language   4. geo hint (non-binding suggestion)
//   5. English fallback
// IP geolocation is NEVER the sole determinant — it only breaks ties.
// Missing keys fall back to English (applyTranslations merges dicts).
// ==========================================================================
window.I18N = window.I18N || {
  locales: {},
  supported: [],
  current: 'en',
  async init() {
    // The LANGUAGES menu is the source of truth for what a user may pick.
    // locales/index.json only ranks which locales ship full files first;
    // every menu language is eager-loaded so a choice is never reverted.
    this.supported = (typeof LANGUAGES !== 'undefined') ? LANGUAGES.map(l => l.code) : ['en'];
    try {
      const res = await fetch('/locales/index.json', { cache: 'no-cache' });
      const idx = await res.json();
      // Fully-shipped locales load first; the rest load lazily on pick.
      const shipped = (idx.supported || []).filter(c => this.supported.includes(c));
      const rest = this.supported.filter(c => !shipped.includes(c));
      await Promise.all(shipped.map(c => this.load(c)));
      rest.forEach(c => this.load(c));
    } catch {
      await Promise.all(this.supported.map(c => this.load(c)));
    }
  },
  async load(code) {
    if (this.locales[code]) return this.locales[code];
    try {
      const [common, auth, billing, dashboard] = await Promise.all([
        fetch(`/locales/${code}/common.json`).then(r => r.ok ? r.json() : {}),
        fetch(`/locales/${code}/auth.json`).then(r => r.ok ? r.json() : {}),
        fetch(`/locales/${code}/billing.json`).then(r => r.ok ? r.json() : {}),
        fetch(`/locales/${code}/dashboard.json`).then(r => r.ok ? r.json() : {}),
      ]);
      this.locales[code] = Object.assign({}, common, auth, billing, dashboard);
    } catch {
      this.locales[code] = {};
    }
    return this.locales[code];
  },
  urlLocale() {
    const qs = new URLSearchParams(location.search).get('lang');
    if (qs && this.isSelectable(qs)) return this.normalize(qs);
    const hash = location.hash || '';
    const m = hash.match(/^#\/([a-z]{2}(?:-[A-Za-z]{2})?)\b/);
    if (m && this.isSelectable(m[1])) return this.normalize(m[1]);
    return null;
  },
  browserLocale() {
    for (const l of navigator.languages || [navigator.language]) {
      const norm = this.normalize(l || '');
      if (norm && this.isSelectable(norm)) return norm;
      const base = (l || '').toLowerCase().split('-')[0];
      if (this.isSelectable(base)) return base;
    }
    return null;
  },
  storedLocale() {
    try {
      const v = localStorage.getItem('keepup_lang');
      return v && this.isSelectable(v) ? this.normalize(v) : null;
    } catch { return null; }
  },
  /** A language is selectable when it's in the LANGUAGES menu (has at least
   * the inline fallback dict). Menu choice must never be reverted. */
  isSelectable(code) {
    const c = this.normalize(code);
    return !!c && (typeof LANGUAGES !== 'undefined') && LANGUAGES.some(l => l.code === c);
  },
  normalize(code) {
    const c = String(code || '').trim();
    if (!c) return null;
    const lower = c.toLowerCase();
    if (lower === 'zh' || lower === 'zh-cn' || lower === 'zh_tw' || lower === 'zh-tw') return 'zh-CN';
    return lower;
  },
  async resolveInitial() {
    await this.init();
    // Non-binding geo hint (runs only if nothing else decided).
    const GEO_TO_LANG = { ru: ['RU','BY','KZ'], uk: ['UA','MD'], de: ['DE','AT'], fr: ['FR'], es: ['ES','MX','AR'], pt: ['PT','BR'], it: ['IT'], nl: ['NL'], hu: ['HU'], tr: ['TR'], ar: ['SA','AE','EG'], zh: ['CN','TW','SG'], ja: ['JP'], ko: ['KR'] };
    const geoToLang = (country) => {
      if (!country) return null;
      const c = String(country).toUpperCase();
      for (const [lang, list] of Object.entries(GEO_TO_LANG)) if (list.includes(c)) return lang;
      return null;
    };
    const geoHint = () => new Promise((resolve) => {
      let settled = false;
      const finish = (v) => { if (!settled) { settled = true; resolve(v); } };
      setTimeout(() => finish(null), 2500); // never block first paint
      fetch(window.location.href, { method: 'HEAD', cache: 'no-store' })
        .then(r => { const cf = r.headers.get('cf-ipcountry'); if (cf) return finish(geoToLang(cf)); throw new Error('no-hdr'); })
        .catch(() => fetch('https://ipapi.co/json/').then(r => r.json()).then(g => finish(geoToLang(g.country))).catch(() => finish(null)));
    });

    let lang = this.urlLocale();
    if (!lang) lang = this.storedLocale();
    if (!lang) lang = this.browserLocale();
    if (!lang) lang = await geoHint();
    this.current = lang || 'en';
    return this.current;
  }
};

function applyTranslations(lang) {
  const code = (window.I18N && window.I18N.normalize(lang)) || (window.I18N && window.I18N.current) || 'en';
  // Merge order: inline EN fallback < shipped locale files < inline dict for
  // the chosen language (instant, ships with the bundle). A language with no
  // locale files yet still gets its inline dict; keys missing everywhere stay
  // English by design.
  const dict = Object.assign({}, TRANSLATIONS['en'], (window.I18N.locales || {})[code] || {}, TRANSLATIONS[code] || {});
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (dict[key]) el.innerText = dict[key];
  });
  document.documentElement.setAttribute('lang', code);
  if (code === 'ar') document.documentElement.setAttribute('dir', 'rtl');
  else document.documentElement.removeAttribute('dir');
}

// ==========================================
// Language switcher UI (flags + native names) & geo auto-detection
// ==========================================
const LANGUAGES = [
  { code: 'en', flag: '🇬🇧', name: 'English' },
  { code: 'uk', flag: '🇺🇦', name: 'Українська' },
  { code: 'ru', flag: '🇷🇺', name: 'Русский' },
  { code: 'zh-CN', flag: '🇨🇳', name: '中文' },
  { code: 'de', flag: '🇩🇪', name: 'Deutsch' },
  { code: 'fr', flag: '🇫🇷', name: 'Français' },
  { code: 'es', flag: '🇪🇸', name: 'Español' },
  { code: 'pt', flag: '🇵🇹', name: 'Português' },
  { code: 'it', flag: '🇮🇹', name: 'Italiano' },
  { code: 'nl', flag: '🇳🇱', name: 'Nederlands' },
  { code: 'hu', flag: '🇭🇺', name: 'Magyar' },
  { code: 'tr', flag: '🇹🇷', name: 'Türkçe' },
  { code: 'pl', flag: '🇵🇱', name: 'Polski' },
  { code: 'ar', flag: '🇸🇦', name: 'العربية' },
  { code: 'hi', flag: '🇮🇳', name: 'हिन्दी' },
  { code: 'ja', flag: '🇯🇵', name: '日本語' },
  { code: 'ko', flag: '🇰🇷', name: '한국어' }
];

function langMeta(code) { return LANGUAGES.find(l => l.code === code) || LANGUAGES[0]; }

function buildLangMenu(current) {
  const menu = document.getElementById('lang-menu');
  if (!menu) return;
  menu.innerHTML = LANGUAGES.map(l => `
    <button role="option" aria-selected="${l.code === current}" onclick="pickLanguage('${l.code}')"
      class="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left text-xs font-bold cursor-pointer transition-colors
      ${l.code === current ? 'bg-fuchsia-50 dark:bg-fuchsia-900/30 text-fuchsia-700 dark:text-fuchsia-300' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/60'}">
      <span class="text-base leading-none">${l.flag}</span>
      <span class="flex-1">${l.name}</span>
      <span class="text-[9px] font-black text-slate-400">${l.code.toUpperCase()}</span>
      ${l.code === current ? '<i class=\"fa-solid fa-check text-[9px] text-fuchsia-500\"></i>' : ''}
    </button>`).join('');
}

function updateLangChrome(lang) {
  const meta = langMeta(lang);
  const flag = document.getElementById('lang-current-flag');
  const code = document.getElementById('lang-current-code');
  const mcode = document.getElementById('lang-mobile-code');
  if (flag) flag.textContent = meta.flag;
  if (code) code.textContent = meta.code.toUpperCase();
  if (mcode) mcode.textContent = meta.code.toUpperCase();
  buildLangMenu(lang);
}

function toggleLangMenu(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById('lang-menu');
  const btn = document.getElementById('lang-current');
  if (!menu || !btn) return;
  const open = !menu.classList.contains('hidden');
  menu.classList.toggle('hidden', open);
  btn.setAttribute('aria-expanded', String(!open));
}

function closeLangMenu() {
  const menu = document.getElementById('lang-menu');
  const btn = document.getElementById('lang-current');
  if (menu) menu.classList.add('hidden');
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

document.addEventListener('click', (e) => {
  if (!e.target.closest || !e.target.closest('#lang-switcher')) closeLangMenu();
});

document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLangMenu(); });

function pickLanguage(code) {
  closeLangMenu();
  changeLanguage(code);
}

// Mobile: cycle through the fully-shipped languages (en → uk → ru → zh-CN → de …)
function cycleLangMobile() {
  const cycle = ['en', 'uk', 'ru', 'zh-CN', 'de'];
  const cur = window.I18N.normalize(localStorage.getItem('keepup_lang') || 'en') || 'en';
  const idx = cycle.indexOf(cur);
  const next = cycle[(idx + 1) % cycle.length] || 'en';
  changeLanguage(next);
}

/**
 * Geo language SUGGESTION (non-binding). Used only when neither the URL,
 * saved preference, nor the browser locale decides — see I18N.resolveInitial.
 * A RU/UA IP therefore lands on a localized page on first visit, but an
 * explicit user choice always wins and is never overwritten.
 */
function detectGeoLanguage() {
  if (localStorage.getItem('keepup_lang')) return; // user already chose
  window.I18N.resolveInitial().then((lang) => {
    if (lang && lang !== 'en') {
      localStorage.setItem('keepup_lang', lang);
      changeLanguage(lang);
    }
  });
}

function changeLanguage(lang) {
  const code = (window.I18N && window.I18N.normalize(lang)) || 'en';
  localStorage.setItem('keepup_lang', code);
  applyTranslations(code);
  updateLangChrome(code);
  const sel = document.getElementById('lang-select');
  if (sel) sel.value = code;
  const meta = langMeta(code);
  showToast((meta ? meta.flag + ' ' : '') + 'Language: ' + (meta ? meta.name : code.toUpperCase()));
}

// ==========================================
// Authentication & Registration Logic
// ==========================================
function completeAuth(provider) {
  showToast(provider + ' sign-in is not enabled yet. Please use email and password.');
  const authDiv = document.getElementById('auth-nav-container');
  if (authDiv) {
    authDiv.innerHTML = `
      <div class="flex items-center gap-2">
        <div class="flex items-center gap-2 bg-slate-100 dark:bg-slate-800/80 px-2.5 py-1 rounded-xl border border-slate-200 dark:border-slate-700">
          <div class="h-7 w-7 rounded-lg bg-gradient-primary text-white flex items-center justify-center font-extrabold text-xs shadow-soft-primary">AD</div>
          <div class="hidden sm:flex flex-col text-left leading-none">
            <span class="text-xs font-extrabold text-slate-900 dark:text-white">Alexander Dev</span>
            <span class="text-[9px] font-bold text-fuchsia-600 dark:text-fuchsia-400">Admin</span>
          </div>
        </div>
        <button onclick="showSection('account')" class="p-1.5 rounded-lg text-slate-500 hover:text-fuchsia-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer" title="Admin Settings">
          <i class="fa-solid fa-gear text-xs"></i>
        </button>
        <button onclick="logout()" class="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer" title="Sign Out">
          <i class="fa-solid fa-right-from-bracket text-xs"></i>
        </button>
      </div>
    `;
  }
  showSection('dashboard');
}

let pendingTotpChallenge = null;

async function handleLoginForm(e) {
  e.preventDefault();
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  try {
    await KeepupAPI.Auth.login(email, password);
    showToast("Welcome back!");
    showSection('dashboard');
    loadData();
  } catch (err) {
    if (err && err.totpRequired && err.challenge) {
      pendingTotpChallenge = err.challenge;
      const step = document.getElementById('totp-step');
      if (step) {
        step.classList.remove('hidden');
        document.getElementById('totp-code')?.focus();
      }
      showToast('Enter the 6-digit code from your authenticator app.');
      return;
    }
    showToast(err.message || "Invalid email or password.");
  }
}

async function handleTotpChallenge(e) {
  if (e && e.preventDefault) e.preventDefault();
  const code = (document.getElementById('totp-code')?.value || '').trim();
  if (!code) { showToast('Enter the 6-digit code from your authenticator.'); return; }
  try {
    await KeepupAPI.Auth.totpChallenge(pendingTotpChallenge, code);
    pendingTotpChallenge = null;
    document.getElementById('totp-step')?.classList.add('hidden');
    const codeInput = document.getElementById('totp-code');
    if (codeInput) codeInput.value = '';
    showToast('Welcome back!');
    showSection('dashboard');
    loadData();
  } catch (err) {
    showToast(err.message || 'Invalid code.');
  }
}

// --- Account recovery: forgot / reset / verify -----------------------------
async function handleForgotForm(e) {
  e.preventDefault();
  const email = document.getElementById('forgot-email').value.trim();
  const btn = document.getElementById('forgot-submit');
  const status = document.getElementById('forgot-status');
  btn.disabled = true;
  btn.textContent = 'Sending…';
  try {
    await KeepupAPI.Auth.requestPasswordReset(email);
    // Always the same message: the backend never reveals whether the account exists.
    status.classList.remove('hidden');
    status.textContent = 'If an account exists for ' + email + ', a reset link is on its way. Check your inbox (and spam folder).';
    status.classList.remove('bg-red-50', 'dark:bg-red-950/40', 'text-red-700', 'dark:text-red-300');
    status.classList.add('bg-emerald-50', 'dark:bg-emerald-950/40', 'text-emerald-700', 'dark:text-emerald-300');
  } catch (err) {
    showToast(err.message || 'Could not send the reset email. Please try again.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Send reset link \u2192';
  }
}

let RESET_TOKEN = null;

function handleResetTokenFromUrl(query) {
  const errBox = document.getElementById('reset-token-error');
  const form = document.querySelector('#sec-reset-password form');
  RESET_TOKEN = query ? query.get('token') : null;
  if (!RESET_TOKEN) {
    if (errBox) {
      errBox.textContent = 'This page needs a reset link from your email. Request a new one below.';
      errBox.classList.remove('hidden');
    }
    if (form) form.classList.add('hidden');
    RESET_TOKEN = null;
    return;
  }
  if (errBox) errBox.classList.add('hidden');
  if (form) form.classList.remove('hidden');
}

async function handleResetForm(e) {
  e.preventDefault();
  const pw = document.getElementById('reset-password').value;
  const pw2 = document.getElementById('reset-password-confirm').value;
  const status = document.getElementById('reset-status');
  const btn = document.getElementById('reset-submit');
  if (pw !== pw2) {
    showToast('The two passwords do not match.');
    return;
  }
  if (!RESET_TOKEN) {
    showToast('Your reset link is missing or has expired. Please request a new one.');
    showSection('forgot-password');
    return;
  }
  btn.disabled = true;
  btn.textContent = 'Saving…';
  try {
    await KeepupAPI.Auth.resetPassword(RESET_TOKEN, pw);
    RESET_TOKEN = null;
    status.classList.remove('hidden');
    status.textContent = 'Password updated. You can now sign in with your new password.';
    showToast('Password updated — please sign in.');
    setTimeout(() => showSection('login'), 1200);
  } catch (err) {
    showToast(err.message || 'This reset link is invalid or has expired. Please request a new one.');
    showSection('forgot-password');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Set new password \u2192';
  }
}

function handleVerifyTokenFromUrl(query) {
  const statusEl = document.getElementById('verify-status');
  const iconEl = document.getElementById('verify-icon');
  const token = query ? query.get('token') : null;
  if (!token) {
    statusEl.textContent = 'This page needs a verification link from your email. Sign in and resend the verification email from Settings.';
    return;
  }
  KeepupAPI.Auth.verifyEmail(token).then(function () {
    statusEl.textContent = 'Your email address is verified. You can sign in now.';
    if (iconEl) iconEl.className = 'fa-solid fa-circle-check text-emerald-400';
  }).catch(function (err) {
    statusEl.textContent = (err && err.message) || 'This verification link is invalid or has expired. Sign in and resend the verification email from Settings.';
    if (iconEl) iconEl.className = 'fa-solid fa-circle-exclamation text-amber-400';
  });
}

// --- Settings: Security tab (password change, verification, deletion) ------
let SECURITY_TAB_RENDERED = false;

function renderSecurityTab() {
  if (SECURITY_TAB_RENDERED) return;
  SECURITY_TAB_RENDERED = true;
  const container = document.getElementById('security-tab-rows');
  if (container) {
    container.innerHTML = `
      <div class="soft-card p-5 space-y-4">
        <div>
          <h3 class="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2"><i class="fa-solid fa-key text-fuchsia-500"></i> Change password</h3>
          <p class="text-[11px] text-slate-500 mt-0.5">Use at least 10 characters. Other sessions stay signed in until you sign them out.</p>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input id="pw-current" type="password" placeholder="Current password" class="w-full bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-fuchsia-500 shadow-inner" />
          <input id="pw-new" type="password" placeholder="New password (min 10 characters)" minlength="10" class="w-full bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-fuchsia-500 shadow-inner" />
        </div>
        <button onclick="handleChangePassword()" class="btn-soft-primary px-4 py-2 rounded-xl text-xs font-extrabold shadow-soft-primary">Update password</button>
      </div>
      <div class="soft-card p-5 space-y-3">
        <div>
          <h3 class="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2"><i class="fa-solid fa-envelope-circle-check text-cyan-500"></i> Email verification</h3>
          <p id="email-verify-state" class="text-[11px] text-slate-500 mt-0.5">Checking verification status…</p>
        </div>
        <button id="resend-verify-btn" onclick="handleResendVerification()" class="hidden px-4 py-2 rounded-xl text-xs font-extrabold border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">Resend verification email</button>
      </div>
      <div class="soft-card p-5 space-y-3 border border-red-100 dark:border-red-950">
        <div>
          <h3 class="text-sm font-extrabold text-red-600 dark:text-red-400 flex items-center gap-2"><i class="fa-solid fa-user-slash"></i> Delete account</h3>
          <p class="text-[11px] text-slate-500 mt-0.5">Removes or anonymizes your profile data. Records required for accounting, fraud prevention, and security are retained per the Data Retention Policy. You can cancel while the request is open.</p>
        </div>
        <div id="deletion-state" class="text-xs font-bold text-slate-600 dark:text-slate-300">Checking deletion status…</div>
        <div class="flex items-center gap-2">
          <button id="deletion-request-btn" onclick="handleRequestDeletion()" class="hidden px-4 py-2 rounded-xl text-xs font-extrabold bg-red-600 hover:bg-red-700 text-white shadow">Request account deletion</button>
          <button id="deletion-cancel-btn" onclick="handleCancelDeletion()" class="hidden px-4 py-2 rounded-xl text-xs font-extrabold border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800">Cancel deletion request</button>
        </div>
      </div>`;
  }
  refreshDeletionStatus();
  refreshEmailVerification();
}

async function handleChangePassword() {
  const cur = document.getElementById('pw-current').value;
  const next = document.getElementById('pw-new').value;
  if (!cur || !next) { showToast('Enter your current and new password.'); return; }
  try {
    await KeepupAPI.Auth.changePassword(cur, next);
    showToast('Password updated.');
    document.getElementById('pw-current').value = '';
    document.getElementById('pw-new').value = '';
  } catch (err) {
    showToast(err.message || 'Could not update the password.');
  }
}

async function handleResendVerification() {
  try {
    await KeepupAPI.Auth.resendVerification();
    showToast('Verification email sent. Check your inbox.');
  } catch (err) {
    showToast(err.message || 'Could not resend the verification email.');
  }
}

function refreshEmailVerification() {
  const stateEl = document.getElementById('email-verify-state');
  const btn = document.getElementById('resend-verify-btn');
  KeepupAPI.App.me().then(function (me) {
    const verified = !!(me.user && (me.user.emailVerified || me.user.isEmailVerified));
    if (stateEl) stateEl.textContent = verified ? 'Your email address is verified.' : 'Your email address is not verified yet. Some features may be limited.';
    if (btn) btn.classList.toggle('hidden', verified);
  }).catch(function () { if (stateEl) stateEl.textContent = 'Could not load verification status.'; });
}

function refreshDeletionStatus() {
  const stateEl = document.getElementById('deletion-state');
  const reqBtn = document.getElementById('deletion-request-btn');
  const cancelBtn = document.getElementById('deletion-cancel-btn');
  KeepupAPI.App.deletionStatus().then(function (res) {
    const r = res.request;
    const open = r && (r.status === 'requested' || r.status === 'processing');
    if (stateEl) {
      stateEl.textContent = !r
        ? 'No deletion request is open for your account.'
        : open
          ? 'A deletion request is open (requested ' + new Date(r.requestedAt).toLocaleDateString() + '). You can still cancel it.'
          : 'Last request: ' + r.status + ' on ' + new Date(r.processedAt || r.requestedAt).toLocaleDateString() + '.';
    }
    if (reqBtn) reqBtn.classList.toggle('hidden', !!open);
    if (cancelBtn) cancelBtn.classList.toggle('hidden', !open);
  }).catch(function () { if (stateEl) stateEl.textContent = 'Could not load deletion status.'; });
}

async function handleRequestDeletion() {
  if (!window.confirm('Request account deletion? Your profile data will be removed or anonymized; records required for accounting and security are retained. You can cancel while the request is open.')) return;
  try {
    await KeepupAPI.App.requestDeletion();
    showToast('Deletion request recorded. Check your email for details.');
    refreshDeletionStatus();
  } catch (err) {
    showToast(err.message || 'Could not record the deletion request.');
  }
}

async function handleCancelDeletion() {
  try {
    await KeepupAPI.App.cancelDeletion();
    showToast('Deletion request cancelled.');
    refreshDeletionStatus();
  } catch (err) {
    showToast(err.message || 'Could not cancel the deletion request.');
  }
}

// Sub-account invitations: if the register link carried ?invite=<token>
// (from a member-invite email), prefill the email and mark the invite so the
// submission joins the inviting organization instead of creating a new one.
let PENDING_INVITE_TOKEN = null;
function applyInviteFromUrl(routeQuery) {
  const token = routeQuery?.get('invite') || null;
  const email = routeQuery?.get('email') || '';
  PENDING_INVITE_TOKEN = token && /^[A-Za-z0-9_-]{20,}$/.test(token) ? token : null;
  const emailEl = document.getElementById('reg-email');
  if (emailEl && email && !emailEl.value) emailEl.value = email;
  const banner = document.getElementById('reg-invite-banner');
  if (banner) {
    banner.classList.toggle('hidden', !PENDING_INVITE_TOKEN);
  }
}

async function handleRegistrationForm(e) {
  e.preventDefault();
  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const terms = document.getElementById('reg-terms').checked;
  if (!terms) {
    showToast('Please accept the Terms of Service to continue.');
    return;
  }
  try {
    const payload = {
      name,
      email,
      password,
      organizationName: name ? name + "'s Workspace" : 'My Workspace',
      acceptTerms: true,
    };
    // Sub-account invitations: the emailed link carries ?invite=<token>.
    // When present, the backend joins this account to the inviting org and
    // ignores the workspace name.
    if (PENDING_INVITE_TOKEN) payload.inviteToken = PENDING_INVITE_TOKEN;
    await KeepupAPI.Auth.register(payload);
    showToast('Welcome, ' + name + '! Check your inbox to verify your email.');
    showSection('dashboard');
    loadData();
  } catch (err) {
    showToast(err.message || 'Registration failed. Please try again.');
  }
}

function logout() {
  // Auth.logout() emits 'keepup:session', which re-renders the header
  // into the signed-out state (Sign in + Create account) in api.js.
  KeepupAPI.Auth.logout();
  showToast('Signed out');
  showSection('landing');
}

// ==========================================
// Model Catalog Rendering & Search Filter
// ==========================================
let ACTIVE_MODELS_DATA = [...MODELS_DATA];

// Interactive Single-Card Flip Manager (Touch & Smartphone Only)
function toggleCardFlip(cardEl, e) {
  // If clicked an interactive button or copy icon, ignore
  if (e.target.closest('button') || e.target.closest('a')) return;

  // On desktop with fine hover, hover handles flipping naturally
  const isDesktop = window.matchMedia('(hover: hover) and (pointer: fine)').matches && window.innerWidth >= 1024;
  if (isDesktop) return;

  const isCurrentlyFlipped = cardEl.classList.contains('is-flipped');
  
  // Close any other open cards on mobile
  document.querySelectorAll('.inspira-flip-card.is-flipped').forEach(c => {
    if (c !== cardEl) c.classList.remove('is-flipped');
  });
  
  // Toggle this card
  if (isCurrentlyFlipped) {
    cardEl.classList.remove('is-flipped');
  } else {
    cardEl.classList.add('is-flipped');
  }
}

// Landing Page Tier Flip Manager (Smartphone uses Card Stack sliding instead of rotation)
function toggleTierCardFlip(cardEl, e) {
  // Mobile resolution uses Inspira Card Stack sliding effect instead of 3D flipping
  return;
}

function formatCostPill(rawCost, isFree, colorClass) {
  if (isFree || !rawCost || String(rawCost).toLowerCase().includes('free')) {
    return `<div class="text-base font-black text-emerald-600 dark:text-emerald-400 font-mono leading-tight">Free</div>`;
  }
  const cleanStr = String(rawCost).replace(/\/ ?1[Mm]/g, '').trim();
  return `
    <div class="flex items-baseline gap-1 min-w-0">
      <span class="text-sm sm:text-base font-black ${colorClass || 'text-slate-900 dark:text-white'} font-mono leading-tight whitespace-nowrap">${cleanStr}</span>
      <span class="text-[10px] font-extrabold text-slate-400 font-sans shrink-0">/ 1M</span>
    </div>
  `;
}

function renderModels(list) {
  const container = document.getElementById('models-grid');
  if (!container) return;
  const countBadge = document.getElementById('model-count-badge');
  if (countBadge) countBadge.innerText = `${catalogState.total || (list || []).length} models`;

  // Pagination: render the current page slice + a pager row (spans the grid).
  // Server-driven mode: the list IS the current page and total/totalPages exact.
  const serverMode = catalogState.totalPages > 1 || catalogState.total > (list || []).length;
  const total = serverMode ? catalogState.total : (list || []).length;
  const pages = serverMode
    ? Math.max(1, catalogState.totalPages)
    : Math.max(1, Math.ceil(total / CATALOG_PAGE_SIZE));
  const page = Math.min(Math.max(1, catalogState.page), pages);
  const start = (page - 1) * CATALOG_PAGE_SIZE;
  const pageItems = serverMode ? (list || []) : list.slice(start, start + CATALOG_PAGE_SIZE);

  const pager = total === 0 ? `
      <div class="col-span-full p-8 rounded-2xl border border-dashed border-slate-300 dark:border-slate-600 text-center">
        <div class="text-sm font-extrabold text-slate-600 dark:text-slate-300">No models match your filters</div>
        <div class="text-xs text-slate-400 mt-1">Try a different search term or brand — or press All Models to reset.</div>
      </div>` : pages <= 1 ? '' : (() => {
    const btn = (label, target, opts) => `
        <button ${opts && opts.disabled ? 'disabled' : `onclick="catalogSetPage(${target})"`} class="px-3 py-1.5 rounded-xl text-xs font-extrabold border ${opts && opts.active ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'} ${opts && opts.disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}">${label}</button>`;
    const winStart = Math.max(1, page - 2);
    const winEnd = Math.min(pages, page + 2);
    let nums = '';
    if (winStart > 1) nums += btn('1', 1) + (winStart > 2 ? '<span class="px-1 text-slate-400">…</span>' : '');
    for (let p = winStart; p <= winEnd; p++) nums += btn(String(p), p, { active: p === page });
    if (winEnd < pages) nums += (winEnd < pages - 1 ? '<span class="px-1 text-slate-400">…</span>' : '') + btn(String(pages), pages);
    return `
      <div class="col-span-full flex flex-col sm:flex-row items-center justify-between gap-3 pt-3">
        <div class="text-[11px] font-bold text-slate-500">Showing ${total === 0 ? 0 : start + 1}–${start + pageItems.length} of ${total} models</div>
        <div class="flex items-center gap-1.5 flex-wrap justify-center">${btn('<i class=\"fa-solid fa-chevron-left\"></i>', page - 1, { disabled: page <= 1 })}${nums}${btn('<i class=\"fa-solid fa-chevron-right\"></i>', page + 1, { disabled: page >= pages })}</div>
      </div>`;
  })();

  container.innerHTML = pageItems.map(m => {
    const isNvidia = m.id.toLowerCase().includes('nvidia');
    const isFree = m.id.includes(':free') || m.cost === 'Free' || m.promptCost === 'Free';
    
    // Parse context from real metadata only (m.context like "1.0M", "128k", "2M").
    let ctxNum = 0;
    const ctxMatch = /^([\d.]+)\s*(M|k)?$/i.exec(String(m.context || '').trim());
    if (ctxMatch) ctxNum = parseFloat(ctxMatch[1]) * (ctxMatch[2] && ctxMatch[2].toLowerCase() === 'm' ? 1000000 : 1024);
    if (!ctxNum) ctxNum = 128000;
    const ctxTokensStr = ctxNum.toLocaleString('en-US');
    const ctxBadge = ctxNum >= 1000000 ? `${(ctxNum / 1000000).toFixed(1)}M` : `${Math.round(ctxNum / 1024)}k`;
    const ctxPercent = Math.min(100, Math.max(6, Math.round((ctxNum / 2000000) * 100)));

    // Real metadata only — no invented latency/throughput numbers.
    const modalityLabel = (m.modality === 'Vision + Text' || String(m.modality || '').includes('image')) ? 'Vision + Text' : 'Text';
    
    // Webpage matching gradient & border theme
    let cardGradientBg = 'bg-gradient-to-br from-fuchsia-50/70 via-white to-purple-50/40 border-fuchsia-200/90 dark:from-slate-800 dark:via-slate-800 dark:to-purple-950/30 dark:border-purple-800/60';
    let badgeAccent = 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200 dark:bg-fuchsia-950/40 dark:text-fuchsia-300 dark:border-fuchsia-800';
    
    if (isNvidia) {
      cardGradientBg = 'bg-gradient-to-br from-emerald-50/70 via-white to-teal-50/40 border-emerald-300/80 dark:from-slate-800 dark:via-slate-800 dark:to-emerald-950/30 dark:border-emerald-700/60';
      badgeAccent = 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800';
    } else if (isFree) {
      cardGradientBg = 'bg-gradient-to-br from-cyan-50/70 via-white to-blue-50/40 border-cyan-300/80 dark:from-slate-800 dark:via-slate-800 dark:to-cyan-950/30 dark:border-cyan-700/60';
      badgeAccent = 'bg-cyan-50 text-cyan-800 border-cyan-200 dark:bg-cyan-950/40 dark:text-cyan-300 dark:border-cyan-800';
    }

    return `
    <div class="inspira-flip-card group" onclick="toggleCardFlip(this, event)">
      <div class="inspira-flip-inner shadow-soft-xl">
        <!-- FRONT FACE (CLEAN WHITE WITH SAFE MARGINS & CONTAINED INNER TEXT) -->
        <div class="inspira-flip-front p-6 pb-4 flex flex-col justify-between border-2 ${cardGradientBg} rounded-[1.75rem] shadow-soft">
          <div>
            <!-- Header: Avatar & Badges -->
            <div class="flex items-start justify-between">
              <div class="h-12 w-12 rounded-2xl bg-gradient-to-br ${m.color || 'from-fuchsia-600 to-pink-500'} text-white flex items-center justify-center font-black text-lg shadow-soft-primary">
                <i class="fa-solid ${m.icon || 'fa-cubes'}"></i>
              </div>
              <div class="flex items-center gap-2">
                <span class="px-2.5 py-1 text-[10px] font-extrabold uppercase rounded-full bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-600">${m.provider || 'Provider'}</span>
                <span class="px-2.5 py-1 text-[10px] font-extrabold uppercase rounded-full border ${badgeAccent}">${m.badge}</span>
              </div>
            </div>

            <!-- Title & ID -->
            <div class="font-black text-lg text-slate-900 dark:text-white mt-3 tracking-tight truncate" title="${m.name}">${m.name}</div>
            <div class="text-[11px] text-slate-500 dark:text-slate-400 font-mono mt-1 px-2 py-0.5 rounded-md bg-slate-100/80 dark:bg-slate-900/60 w-fit max-w-full truncate" title="${m.id}">${m.id}</div>
          </div>

          <!-- Middle Metrics: Equidistant Grid Layout with Min Space Containment -->
          <div class="space-y-3 mt-3">
            <!-- Large Context Window Box with Capacity Bar -->
            <div class="p-3 rounded-2xl bg-white/95 dark:bg-slate-900/80 border border-slate-200/90 dark:border-slate-700/80 shadow-xs">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-1.5">
                  <i class="fa-solid fa-layer-group text-fuchsia-600 dark:text-fuchsia-400 text-xs"></i>
                  <span class="text-slate-500 dark:text-slate-400 text-xs font-extrabold uppercase tracking-wider">Context Memory</span>
                </div>
                <span class="px-2.5 py-0.5 rounded-md text-[10px] font-mono font-black bg-fuchsia-100 dark:bg-fuchsia-950/80 text-fuchsia-700 dark:text-fuchsia-300 border border-fuchsia-200 dark:border-fuchsia-800">${ctxBadge}</span>
              </div>
              <div class="flex items-baseline justify-between mt-1">
                <span class="text-2xl font-black text-slate-900 dark:text-white font-mono tracking-tight">${ctxTokensStr} <span class="text-xs font-bold text-slate-400">tok</span></span>
                <span class="text-xs font-extrabold text-emerald-600 dark:text-emerald-400 flex items-center gap-1"><i class="fa-solid fa-circle text-[6px] animate-pulse"></i>100% KV</span>
              </div>
              <!-- Context Visual Fill Bar -->
              <div class="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full mt-1.5 overflow-hidden">
                <div class="bg-gradient-to-r from-fuchsia-500 via-purple-500 to-indigo-600 h-full rounded-full shadow-xs" style="width: ${ctxPercent}%"></div>
              </div>
            </div>

            <!-- Row 1: Large Edge Latency & Bandwidth Speed Cards -->
            <div class="grid grid-cols-2 gap-3">
              <div class="inspira-metric-box bg-white/90 dark:bg-slate-900/70 border border-slate-200/90 dark:border-slate-700/70 flex flex-col justify-between shadow-xs">
                <div class="flex items-center justify-between">
                  <span class="text-slate-500 dark:text-slate-400 text-xs font-extrabold flex items-center gap-1.5"><i class="fa-solid fa-eye text-emerald-500"></i>Modality</span>
                  <span class="text-[9px] font-bold uppercase text-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded">I/O</span>
                </div>
                <div class="text-lg font-black text-emerald-700 dark:text-emerald-400 font-mono mt-1">${modalityLabel}</div>
                <div class="text-[10px] font-semibold text-slate-400 mt-0.5">Input → Output types</div>
              </div>

              <div class="inspira-metric-box bg-white/90 dark:bg-slate-900/70 border border-slate-200/90 dark:border-slate-700/70 flex flex-col justify-between shadow-xs">
                <div class="flex items-center justify-between">
                  <span class="text-slate-500 dark:text-slate-400 text-xs font-extrabold flex items-center gap-1.5"><i class="fa-solid fa-gauge-high text-cyan-500"></i>Speed</span>
                  <span class="text-[9px] font-bold uppercase text-cyan-600 bg-cyan-50 dark:bg-cyan-950/60 px-1.5 py-0.5 rounded">Median</span>
                </div>
                <div class="text-lg font-black ${m.speedP50Ms ? 'text-cyan-700 dark:text-cyan-400' : 'text-slate-400 dark:text-slate-500'} font-mono mt-1">${m.speedP50Ms ? `${m.speedP50Ms} ms` : '—'}</div>
                <div class="text-[10px] font-semibold text-slate-400 mt-0.5">${m.speedP50Ms ? 'Measured · last 7 days' : 'Not yet measured'}</div>
              </div>
            </div>

            <!-- Row 2: Prompt Input & Generation Output Pricing Cards (Contained Boundary Spacing) -->
            <div class="grid grid-cols-2 gap-3">
              <div class="inspira-metric-box bg-white/90 dark:bg-slate-900/70 border border-slate-200/90 dark:border-slate-700/70 flex flex-col justify-between shadow-xs">
                <div class="flex items-center justify-between">
                  <span class="text-slate-500 dark:text-slate-400 text-xs font-extrabold flex items-center gap-1.5"><i class="fa-solid fa-arrow-down-long text-purple-500"></i>Prompt In</span>
                  <span class="text-[9px] font-bold uppercase text-purple-600 bg-purple-50 dark:bg-purple-950/60 px-1.5 py-0.5 rounded">1M Tok</span>
                </div>
                <div class="mt-1">${formatCostPill(m.promptCost || m.cost, isFree, 'text-purple-700 dark:text-purple-400')}</div>
                <div class="text-[10px] font-semibold text-slate-400 mt-0.5">Input Billing Rate</div>
              </div>

              <div class="inspira-metric-box bg-white/90 dark:bg-slate-900/70 border border-slate-200/90 dark:border-slate-700/70 flex flex-col justify-between shadow-xs">
                <div class="flex items-center justify-between">
                  <span class="text-slate-500 dark:text-slate-400 text-xs font-extrabold flex items-center gap-1.5"><i class="fa-solid fa-arrow-up-long text-fuchsia-500"></i>Output Gen</span>
                  <span class="text-[9px] font-bold uppercase text-fuchsia-600 bg-fuchsia-50 dark:bg-fuchsia-950/60 px-1.5 py-0.5 rounded">1M Tok</span>
                </div>
                <div class="mt-1">${formatCostPill(m.completionCost || m.cost, isFree, 'text-fuchsia-700 dark:text-fuchsia-400')}</div>
                <div class="text-[10px] font-semibold text-slate-400 mt-0.5">Completion Rate</div>
              </div>
            </div>

            <!-- Footer Flip Hint (Padded & Safely Above Bottom Border) -->
            <div class="mt-3 pt-3 pb-1 border-t border-slate-200/90 dark:border-slate-700/80 flex items-center justify-between text-xs font-extrabold shrink-0">
              <span class="text-xs font-extrabold text-slate-500 dark:text-slate-400 flex items-center gap-1.5 shrink-0">
                <i class="fa-solid fa-microchip text-fuchsia-600 dark:text-fuchsia-400"></i><span>Edge AI Provider</span>
              </span>
              <span class="px-2.5 py-1 rounded-xl bg-fuchsia-50 dark:bg-fuchsia-950/60 text-fuchsia-700 dark:text-fuchsia-300 border border-fuchsia-200 dark:border-fuchsia-800 text-xs font-black flex items-center gap-1.5 shadow-2xs group-hover:bg-fuchsia-100 dark:group-hover:bg-fuchsia-900/60 transition-colors shrink-0">
                <span>Details & Launch</span><i class="fa-solid fa-arrow-rotate-right text-[10px] group-hover:rotate-180 transition-transform duration-500"></i>
              </span>
            </div>
          </div>
        </div>

        <!-- BACK FACE (LARGE HIGH-CONTRAST FLIPPED CARD) -->
        <div class="inspira-flip-back p-6 pb-4 flex flex-col justify-between bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 text-white border-2 border-fuchsia-500/50 rounded-[1.75rem] shadow-soft-xl">
          <div>
            <div class="flex items-center justify-between text-xs pb-3 border-b border-slate-700/70">
              <span class="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30">${m.badge}</span>
              <span class="text-xs text-emerald-400 font-mono font-extrabold flex items-center gap-1.5"><i class="fa-solid fa-circle text-[7px] animate-pulse"></i>Active Engine</span>
            </div>

            <div class="inspira-scroll-y max-h-72 overflow-y-auto mt-4 pr-2">
              <h4 class="font-black text-base text-white mb-2">${m.name}</h4>
              <p class="text-xs text-slate-300 leading-relaxed font-normal">${m.description || 'High-performance foundation engine optimized for inference, reasoning, and production workflows via KeepUpCoding Gateway.'}</p>
            </div>
          </div>

          <div class="pt-4 border-t border-slate-700/70 flex flex-col gap-2 shrink-0">
            <button onclick="openModelDetailModal('${m.id}', event)" class="w-full btn-soft-primary py-2 px-3 rounded-xl text-xs font-black shadow-soft-primary flex items-center justify-center gap-2 cursor-pointer">
              <i class="fa-solid fa-circle-info text-xs"></i><span>Deep-Dive & Live Studio</span>
            </button>
            <div class="flex items-center gap-2">
              <button onclick="selectModelAndGo('${m.id}')" class="flex-1 py-1.5 px-3 rounded-xl text-[11px] font-bold bg-white/10 hover:bg-white/20 text-slate-100 flex items-center justify-center gap-1.5 transition-colors cursor-pointer">
                <i class="fa-solid fa-play text-[10px]"></i><span>Studio Tab</span>
              </button>
              <button onclick="copyModelId('${m.id}', event)" class="py-1.5 px-3 rounded-xl text-[11px] font-bold bg-white/10 hover:bg-white/20 text-slate-100 flex items-center justify-center gap-1.5 transition-colors cursor-pointer" title="Copy Model ID">
                <i class="fa-solid fa-copy text-[10px]"></i><span>Copy ID</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  }).join('') + pager;
}

// Provider-neutral featured tiles: top picks from the live catalog.
function renderFeaturedTiles(list) {
  const box = document.getElementById('featured-model-tiles');
  if (!box) return;
  const picks = (list || []).filter(m => m && m.id).slice(0, 4);
  if (picks.length === 0) {
    box.innerHTML = '<div class="text-[11px] text-slate-400">Catalog loading…</div>';
    return;
  }
  box.innerHTML = picks.map(m => `
    <div onclick="selectModelAndGo('${m.id}')" class="p-3.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all cursor-pointer group">
      <div class="flex justify-between items-start">
        <span class="px-2 py-0.5 rounded text-[9px] font-extrabold bg-emerald-500/20 text-emerald-300">${m.provider || 'Provider'}</span>
        <span class="text-[9px] font-mono text-emerald-400 font-bold">${m.context || ''}</span>
      </div>
      <div class="font-bold text-xs text-white mt-2 group-hover:text-emerald-300 transition-colors truncate" title="${m.name}">${m.name}</div>
      <div class="text-[10px] text-slate-400 mt-1 truncate" title="${m.description || ''}">${(m.description || 'Routable via KeepUpCoding Gateway.').slice(0, 60)}</div>
    </div>
  `).join('');
}

let CURRENT_MODAL_MODEL = null;

function openModelDetailModal(id, e) {
  if (e) e.stopPropagation();
  const model = ACTIVE_MODELS_DATA.find(m => m.id === id) || MODELS_DATA.find(m => m.id === id) || {
    id: id,
    name: id.split('/').pop().replace(/-/g, ' ').toUpperCase(),
    provider: id.split('/')[0] || 'AI Engine',
    context: '128k',
    cost: '$0.20 / 1M',
    badge: 'Active Engine',
    icon: 'fa-cubes'
  };

  CURRENT_MODAL_MODEL = model;

  const modal = document.getElementById('model-detail-modal');
  if (!modal) return;

  document.getElementById('modal-model-title').innerText = model.name;
  document.getElementById('modal-model-id').innerText = model.id;
  document.getElementById('modal-model-badge').innerText = model.badge || 'Online';
  document.getElementById('modal-model-context').innerText = model.context || '128k';
  
  // Prices shown are the platform SELL price — the exact rows the billing
  // gateway meters (customer_price_versions). No client-side markup math:
  // what the card and this modal display is what a request costs.
  const isFree = model.id.includes(':free') || model.cost === 'Free' || model.promptCost === 'Free';
  document.getElementById('modal-model-wholesale').innerText = isFree ? 'Free' : `${model.promptCost || model.cost || '—'} / 1M`;
  document.getElementById('modal-model-surplus').innerText = isFree ? 'Free' : `${model.completionCost || model.cost || '—'} / 1M`;
  document.getElementById('modal-model-retail').innerText = isFree ? '$0.00 (Free Tier)' : `${model.promptCost || model.cost || '—'} in · ${model.completionCost || model.cost || '—'} out`;

  document.getElementById('modal-model-desc').innerText = model.description || 
    `${model.name} is a state-of-the-art multimodal reasoning engine by ${model.provider}, optimized on KeepUpCoding for sub-5ms proxy routing and high-throughput streaming.`;

  document.getElementById('modal-stream-status').innerText = 'Ready';
  document.getElementById('modal-stream-output').innerText = 'Click "Execute Live Streaming Request" to stream tokens directly from this model.';

  modal.showModal();
}

function closeModelDetailModal() {
  const modal = document.getElementById('model-detail-modal');
  if (modal) modal.close();
}

// Real streaming through the platform gateway (auth → balance → LiteLLM).
// The browser never talks to providers directly and never sees provider keys.
async function runModalPlaygroundStream() {
  const output = document.getElementById('modal-stream-output');
  const status = document.getElementById('modal-stream-status');
  const prompt = document.getElementById('modal-prompt-input').value;
  const model = CURRENT_MODAL_MODEL ? CURRENT_MODAL_MODEL.id : null;
  if (!model) { status.innerText = 'No model selected'; return; }

  output.innerText = '';
  status.innerText = 'Connecting to Gateway…';

  let studioSecret = null;
  try {
    const tok = await KeepupAPI.App.studioToken();
    studioSecret = tok.secret;
  } catch (err) {
    status.innerText = 'Sign in to use the Studio.';
    return;
  }

  try {
    const resp = await fetch(getGatewayBaseUrl() + '/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + studioSecret
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: prompt }],
        stream: true
      })
    });
    if (!resp.ok) {
      status.innerText = 'Error ' + resp.status;
      output.innerText = await resp.text();
      return;
    }
    status.innerText = 'Streaming tokens…';
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data: ')) {
          const str = trimmed.replace('data: ', '').trim();
          if (str === '[DONE]') { status.innerText = 'Complete ✅'; loadData(); return; }
          try {
            const parsed = JSON.parse(str);
            output.innerText += parsed.choices?.[0]?.delta?.content || '';
            output.scrollTop = output.scrollHeight;
          } catch (e) {}
        }
      }
    }
    status.innerText = 'Complete ✅';
    loadData();
  } catch (err) {
    status.innerText = 'Gateway Connection Error';
    output.innerText = err.message;
  }
}

// NOTE: the previous client-side "Superadmin 20-minute price sync" was removed
// (2026-09-11 playtest): it only recomputed display strings in the browser and
// logged misleading "price sync completed" messages. Real pricing is owned by
// the server (model_catalog + admin pricing APIs; LiteLLM catalog sync).

function copyModelId(id, e) {
  if (e) e.stopPropagation();
  navigator.clipboard.writeText(id).then(() => {
    showToast(`Copied model ID: ${id}`);
  }).catch(() => {
    showToast(`Model ID: ${id}`);
  });
}

// Catalog state (single owner). `page` is 1-based and clamped to the result
// count; `query` and `category` persist in the #models?... URL so filtered
// views can be shared and survive reloads.
const CATALOG_PAGE_SIZE = 24;
const catalogState = { query: '', category: 'all', page: 1, sort: 'name', totalPages: 1, total: 0, kind: 'all' };

/**
 * The catalog is a thin client over the server search engine (/api/models).
 * The Postgres catalog is the constant database: the worker re-syncs it from
 * LiteLLM (availability + provider cost) every 20 minutes, and this page
 * always reads the DB — there is no third-party browser fetch anymore.
 */
const CATEGORY_QUERY = { free: 'free', frontier: 'openai anthropic google deepseek' };
// Content-kind chips (TEXT / CODE / AUDIO / VISION): keyword routes over the
// real catalog ids/names — honest search, not fabricated capability fields.
const KIND_QUERY = { all: '', text: '', code: 'code', audio: 'audio', vision: 'vision' };

// Brand chip → server provider facet (chip key differs where the brand
// label is friendlier than the upstream provider id).
const BRAND_TO_PROVIDER = { meta: 'meta-llama', google: 'google', openai: 'openai', nvidia: 'nvidia', anthropic: 'anthropic', deepseek: 'deepseek', mistralai: 'mistralai', qwen: 'qwen' };

async function fetchCatalogPage() {
  const brand = catalogState.category;
  const params = new URLSearchParams();
  if (CATEGORY_QUERY[brand]) params.set('q', CATEGORY_QUERY[brand]);
  else if (brand !== 'all') params.set('provider', BRAND_TO_PROVIDER[brand] || brand);
  const kindQ = KIND_QUERY[catalogState.kind] || '';
  if (kindQ) params.set('q', catalogState.query ? `${catalogState.query} ${kindQ}` : kindQ);
  else if (catalogState.query) params.set('q', catalogState.query);
  params.set('sort', catalogState.sort);
  params.set('page', String(catalogState.page));
  params.set('perPage', String(CATALOG_PAGE_SIZE));
  try {
    const res = await fetch(`/api/models?${params}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const rows = (json.data || []).map(m => ({
      id: m.id,
      name: m.name || m.id,
      provider: m.provider,
      context: m.contextWindow ? (m.contextWindow >= 1000000 ? `${(m.contextWindow / 1000000).toFixed(1)}M` : `${Math.round(m.contextWindow / 1024)}k`) : '',
      promptCost: m.pricing ? (Number(m.pricing.inputUsdPerMillion) === 0 ? 'Free' : `$${Number(m.pricing.inputUsdPerMillion).toFixed(2)}`) : '—',
      completionCost: m.pricing ? (Number(m.pricing.outputUsdPerMillion) === 0 ? 'Free' : `$${Number(m.pricing.outputUsdPerMillion).toFixed(2)}`) : '—',
      cost: m.pricing ? (Number(m.pricing.inputUsdPerMillion) === 0 ? 'Free' : `$${Number(m.pricing.inputUsdPerMillion).toFixed(2)}`) : '—',
      modality: (m.modalities || []).join(', ') || 'Text → Text',
      speedP50Ms: m.speedP50Ms ?? null,
      description: m.description || 'Routable via KeepUpCoding Gateway. Pricing is the platform sell price — the exact amount the gateway meters.',
    }));
    ACTIVE_MODELS_DATA = rows;
    catalogState.totalPages = json.totalPages || 1;
    catalogState.total = json.total || rows.length;
    const countBadge = document.getElementById('model-count-badge');
    if (countBadge) countBadge.innerText = `${json.total} models`;
    renderModels(rows);
    renderFeaturedTiles(rows);
    populateModelDropdowns(rows);
  } catch (err) {
    console.warn('Catalog load failed:', err);
    renderModels([]);
  }
}

/** Kind chips (TEXT/CODE/AUDIO/VISION) — keyword routes over the catalog. */
function filterModelKind(kind) {
  catalogState.kind = KIND_QUERY[kind] != null ? kind : 'all';
  catalogState.page = 1;
  catalogSyncUrl();
  applyCatalogState();
  document.querySelectorAll('[data-kind-chip]').forEach(el => {
    const active = el.dataset.kindChip === catalogState.kind;
    el.className = active
      ? 'px-3 py-1.5 rounded-xl bg-slate-900 text-white shadow-sm font-extrabold text-[11px] cursor-pointer'
      : 'px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-extrabold text-[11px] cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700';
  });
}

function catalogFiltered() { return ACTIVE_MODELS_DATA; }

/** Re-renders the catalog from catalogState (server query → render). */
function applyCatalogState() {
  // Clamp against the last known server page count; the refresh corrects it.
  if (catalogState.totalPages > 0 && catalogState.page > catalogState.totalPages) catalogState.page = catalogState.totalPages;
  fetchCatalogPage();
  Object.keys(CATEGORY_FILTERS).forEach(b => {
    const el = document.getElementById('cat-' + b);
    if (!el) return;
    const active = b === catalogState.category;
    el.className = active
      ? 'model-cat-btn px-3.5 py-1.5 rounded-xl bg-slate-900 text-white shadow-sm font-bold text-xs flex items-center gap-1'
      : 'model-cat-btn px-3.5 py-1.5 rounded-xl text-slate-600 hover:text-slate-900 bg-slate-100 dark:bg-slate-800 font-bold text-xs flex items-center gap-1';
  });
  const sortEl = document.getElementById('catalog-sort');
  if (sortEl) sortEl.value = catalogState.sort;
}

/** Replaces the #models?query/brand/page portion of the URL (no history spam). */
function catalogSyncUrl() {
  const [base, prev] = window.location.hash.split('?');
  const sec = (base || '').replace(/^#/, '');
  if (sec !== 'models') return;
  const qs = new URLSearchParams(prev || '');
  if (catalogState.query) qs.set('q', catalogState.query); else qs.delete('q');
  if (catalogState.category && catalogState.category !== 'all') qs.set('brand', catalogState.category); else qs.delete('brand');
  if (catalogState.page > 1) qs.set('page', String(catalogState.page)); else qs.delete('page');
  if (catalogState.sort && catalogState.sort !== 'name') qs.set('sort', catalogState.sort); else qs.delete('sort');
  if (catalogState.kind && catalogState.kind !== 'all') qs.set('kind', catalogState.kind); else qs.delete('kind');
  const q = qs.toString();
  history.replaceState(null, '', q ? `#models?${q}` : '#models');
}

/** Restores filters from the current URL hash query (called on section entry). */
function catalogFromUrl() {
  const raw = window.location.hash.replace(/^#/, '');
  if (!raw.startsWith('models')) return;
  const qs = new URLSearchParams(raw.split('?')[1] || '');
  const brand = qs.get('brand') || 'all';
  catalogState.query = qs.get('q') || '';
  catalogState.category = CATEGORY_FILTERS[brand] ? brand : (facetsInclude(brand) ? brand : 'all');
  catalogState.sort = qs.get('sort') || 'name';
  catalogState.page = Math.max(1, parseInt(qs.get('page') || '1', 10) || 1);
  catalogState.kind = KIND_QUERY[qs.get('kind') || 'all'] != null ? (qs.get('kind') || 'all') : 'all';
  const box = document.getElementById('model-search-box');
  if (box) box.value = catalogState.query;
}

/** Arbitrary provider brands are valid filter targets (server facets). */
function facetsInclude(brand) {
  return /^[a-z0-9_-]+$/i.test(brand); 
}

function catalogSetPage(p) {
  catalogState.page = Math.max(1, p);
  catalogSyncUrl();
  applyCatalogState();
  const grid = document.getElementById('models-grid');
  if (grid) grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
}let filterDebounce;
function filterModels(query) {
  catalogState.query = query || '';
  catalogState.page = 1;
  catalogSyncUrl();
  clearTimeout(filterDebounce);
  filterDebounce = setTimeout(applyCatalogState, 200);
}

// Brand/provider filters for the catalog. Keys map 1:1 to the `cat-*` buttons;
// every other provider facet chip from the server is accepted dynamically.
const CATEGORY_FILTERS = { all: true, nvidia: true, openai: true, anthropic: true, google: true, deepseek: true, meta: true, mistral: true, qwen: true, free: true, frontier: true };
const CATEGORY_LABELS = {
  all: 'All', nvidia: 'NVIDIA', openai: 'OpenAI', anthropic: 'Anthropic', google: 'Google',
  deepseek: 'DeepSeek', meta: 'Meta Llama', mistral: 'Mistral', qwen: 'Qwen',
  free: 'Free Tier', frontier: 'Frontier'
};

function filterModelCategory(cat) {
  catalogState.category = CATEGORY_FILTERS[cat] || facetsInclude(cat) ? cat : 'all';
  catalogState.page = 1;
  catalogSyncUrl();
  applyCatalogState();
}

function filterModelSort(sort) {
  catalogState.sort = ['name', 'price_asc', 'price_desc', 'context'].includes(sort) ? sort : 'name';
  catalogState.page = 1;
  catalogSyncUrl();
  applyCatalogState();
}

async function populateModelDropdowns(models) {
  const select = document.getElementById('play-model-select');
  if (!select) return;

  const curVal = select.value || '';

  let html = '';

  // Platform catalog first: these model ids are actually routable on THIS
  // gateway (priced + active). Paged fetch — the search endpoint caps at
  // 100/page, so walk pages until the advertised total is consumed.
  try {
    const list = [];
    let page = 1;
    let totalPages = 1;
    do {
      const plat = await fetch(`/api/models?perPage=100&page=${page}`).then(r => (r.ok ? r.json() : null));
      if (!plat || !Array.isArray(plat.data)) break;
      list.push(...plat.data);
      totalPages = plat.totalPages || 1;
      page += 1;
    } while (page <= totalPages && page <= 5);
    if (list.length > 0) {
      html += `<optgroup label="🟢 Platform Models (Active on this Gateway)">`;
      list.forEach(m => {
        const p = m.pricing || {};
        const cost = p.inputUsdPerMillion != null
          ? (Number(p.inputUsdPerMillion) === 0 ? 'Free' : `$${Number(p.inputUsdPerMillion).toFixed(2)} / 1M`)
          : '';
        html += `<option value="${m.id}">${m.name} (${cost})</option>`;
      });
      html += `</optgroup>`;
      if (list.some(m => m.id === curVal)) select.value = curVal;
      else select.dataset.pendingDefault = '1';
    }
  } catch (e) { /* offline: platform group simply omitted */ }

  const freeModels = models.filter(m => m.id.includes(':free'));
  const frontier = models.filter(m => !m.id.includes(':free') && (m.id.includes('openai') || m.id.includes('anthropic') || m.id.includes('google') || m.id.includes('deepseek') || m.id.includes('meta-llama')));
  const others = models.filter(m => !freeModels.includes(m) && !frontier.includes(m));

  if (freeModels.length > 0) {
    html += `<optgroup label="🎁 Free Tier Models">`;
    freeModels.slice(0, 40).forEach(m => {
      html += `<option value="${m.id}">${m.name} (${m.cost})</option>`;
    });
    html += `</optgroup>`;
  }

  if (frontier.length > 0) {
    html += `<optgroup label="💎 Frontier & High-Capacity Reasoning">`;
    frontier.slice(0, 40).forEach(m => {
      html += `<option value="${m.id}">${m.name} (${m.cost})</option>`;
    });
    html += `</optgroup>`;
  }

  if (others.length > 0) {
    html += `<optgroup label="🚀 Open-Weight Community Models">`;
    others.slice(0, 40).forEach(m => {
      html += `<option value="${m.id}">${m.name} (${m.cost})</option>`;
    });
    html += `</optgroup>`;
  }

  select.innerHTML = html;
  if (curVal && models.some(m => m.id === curVal)) {
    select.value = curVal;
  }
}

// ==========================================
// Backend Data Fetching (Postgres + Redis)
// ==========================================
// Initial mock state for standalone mode
const DEFAULT_KEYS = [
  { id: 1, name: 'Production Backend Primary', key_prefix: 'sk-ku-prod-a8f1', rate_limit_rpm: 1200, is_active: true, created_at: new Date().toISOString() },
  { id: 2, name: 'Staging Integration Key', key_prefix: 'sk-ku-stag-9c42', rate_limit_rpm: 600, is_active: true, created_at: new Date(Date.now() - 86400000).toISOString() },
  { id: 3, name: 'Developer Sandbox (Legacy)', key_prefix: 'sk-ku-dev-11b0', rate_limit_rpm: 100, is_active: false, created_at: new Date(Date.now() - 172800000).toISOString() }
];

const DEFAULT_LEDGER = [
  { id: 1084, transaction_type: 'DEPOSIT_STRIPE', amountUsd: '50.00', balanceAfterUsd: '50.00', description: 'Stripe Instant Pre-fund Credit #ch_3N9x', created_at: new Date().toISOString() },
  { id: 1083, transaction_type: 'USAGE_INFERENCE', amountUsd: '0.0024', balanceAfterUsd: '0.00', description: 'Nemotron Nano 12B VL (1,240 tokens)', created_at: new Date(Date.now() - 3600000).toISOString() },
  { id: 1082, transaction_type: 'WELCOME_BONUS', amountUsd: '10.00', balanceAfterUsd: '10.00', description: 'KeepUpCoding Onboarding Welcome Grant', created_at: new Date(Date.now() - 86400000).toISOString() }
];

function getStoredBalance() {
  return parseFloat(localStorage.getItem('keepup_balance') || '50.00').toFixed(2);
}

function setStoredBalance(bal) {
  localStorage.setItem('keepup_balance', parseFloat(bal).toFixed(2));
}

function getStoredKeys() {
  const data = localStorage.getItem('keepup_virtual_keys');
  return data ? JSON.parse(data) : DEFAULT_KEYS;
}

function setStoredKeys(keys) {
  localStorage.setItem('keepup_virtual_keys', JSON.stringify(keys));
}

function getStoredLedger() {
  const data = localStorage.getItem('keepup_ledger_txs');
  return data ? JSON.parse(data) : DEFAULT_LEDGER;
}

function setStoredLedger(txs) {
  localStorage.setItem('keepup_ledger_txs', JSON.stringify(txs));
}

// Budget & usage page: pulls real org-scoped usage and budget policies.
async function loadBudgetPageData() {
  try {
    const usage = await fetch('/api/billing/usage?days=30').then(function (r) { return r.ok ? r.json() : null; });
    if (usage) {
      const fmt = function (n) { return n.toLocaleString('en-US'); };
      const el = function (id) { return document.getElementById(id); };
      if (el('budget-tokens-total')) el('budget-tokens-total').innerText = fmt(usage.totals.promptTokens + usage.totals.completionTokens);
      if (el('budget-prompt-tokens')) el('budget-prompt-tokens').innerText = 'Prompt: ' + fmt(usage.totals.promptTokens);
      if (el('budget-completion-tokens')) el('budget-completion-tokens').innerText = 'Completion: ' + fmt(usage.totals.completionTokens);
      if (el('budget-current-spend')) el('budget-current-spend').innerText = '$' + usage.totals.costUsd;
      if (el('budget-total-spend')) el('budget-total-spend').innerText = '$' + usage.totals.costUsd + ' USD';
      if (el('acct-tokens-total')) el('acct-tokens-total').innerText = fmt(usage.totals.promptTokens + usage.totals.completionTokens);
      if (el('acct-month-spend')) el('acct-month-spend').innerText = '$' + usage.totals.costUsd;
      // NOTE: mobile balance pill is set from the real wallet balance in
      // loadData() — spend totals must never be shown as "Prepaid Balance".
    }
    const budgets = await fetch('/api/billing/budgets').then(function (r) { return r.ok ? r.json() : null; });
    const orgPolicy = budgets && budgets.budgets ? budgets.budgets.find(function (b) { return !b.api_key_id; }) : null;
    const cap = orgPolicy && orgPolicy.monthly_cap_micros ? orgPolicy.monthly_cap_micros / 1e6 : null;
    const spend = usage ? usage.totals.costUsd : 0;
    if (cap != null) {
      const pct = Math.min((parseFloat(spend) / cap) * 100, 100);
      const badge = document.getElementById('budget-cap-badge');
      if (badge) badge.innerText = 'Cap: $' + cap.toFixed(2);
      const bar = document.getElementById('budget-progress-bar');
      if (bar) bar.style.width = pct.toFixed(1) + '%';
      const pctEl = document.getElementById('budget-cap-pct');
      if (pctEl) pctEl.innerText = pct.toFixed(1) + '% of Cap';
      const rem = document.getElementById('budget-cap-remaining');
      if (rem) rem.innerText = '$' + Math.max(cap - parseFloat(spend), 0).toFixed(2) + ' Remaining';
    } else {
      const badge = document.getElementById('budget-cap-badge');
      if (badge) badge.innerText = 'No cap set';
      const pctEl = document.getElementById('budget-cap-pct');
      if (pctEl) pctEl.innerText = 'Set a monthly cap below';
    }
  } catch (err) { /* page keeps honest zeros if APIs are unreachable */ }
}

async function loadData() {
  // 1. Balance Sync (real org-scoped API; same DOM elements)
  const navBal = document.getElementById('nav-balance');
  const statBal = document.getElementById('stat-balance');
  let orgLoaded = false;
  try {
    const s = await KeepupAPI.App.orgSummary();
    const balStr = '$' + s.balance.usd;
    if (navBal) navBal.innerText = balStr;
    if (statBal) statBal.innerText = balStr;
    // Mobile drawer balance pill mirrors the real prepaid balance.
    const mobBal = document.getElementById('mobile-balance');
    if (mobBal) mobBal.innerText = 'Prepaid Balance: $' + s.balance.usd;
    orgLoaded = true;
  } catch (err) {
    if (err && err.status === 401) return; // signed out; guard redirects
    if (navBal) navBal.innerText = '$0.00';
    if (statBal) statBal.innerText = '$0.00';
  }

  if (orgLoaded) {
    loadBudgetPageData();
    try {
      const org = await KeepupAPI.App.orgCurrent();
      const orgName = document.getElementById('acc-org-name');
      const orgEmail = document.getElementById('acc-org-email');
      if (orgName) orgName.value = org.organization.name || '';
      if (orgEmail) orgEmail.value = org.organization.billing_email || '';
    } catch (err) {}
  }

  // 2. Keys Sync (real tenant-scoped API; same table renderers)
  let keys = [];
  try {
    keys = (await KeepupAPI.App.keys()).keys || [];
  } catch (err) {
    if (err && err.status === 401) return;
  }

  const overviewTbody = document.getElementById('overview-keys-table');
  const fullTbody = document.getElementById('keys-table-body');

  const rowsHtml = keys.length ? keys.map(k => `
    <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
      <td class="py-2.5 font-bold font-sans text-slate-800 dark:text-white">${KeepupAPI.escapeHtml(k.name)}</td>
      <td class="py-2.5 text-fuchsia-600 dark:text-fuchsia-400 font-mono">${KeepupAPI.escapeHtml(k.keyPrefix)}...</td>
      <td class="py-2.5 font-mono">${k.rpmLimit}</td>
      <td class="py-2.5 font-mono">${(k.totalTokens ?? 0).toLocaleString('en-US')}</td>
      <td class="py-2.5 font-mono">${(k.usageCount ?? 0).toLocaleString('en-US')}</td>
      <td class="py-2.5"><span class="px-2 py-0.5 rounded-full text-[9px] font-extrabold ${k.status === 'active' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600' : 'bg-red-100 text-red-600'}">${k.status === 'active' ? 'ACTIVE' : 'REVOKED'}</span></td>
    </tr>
  `).join('') : '<tr><td colspan="6" class="py-4 text-center font-sans text-slate-400">No keys generated yet.</td></tr>';

  if (overviewTbody) overviewTbody.innerHTML = rowsHtml;

  if (fullTbody) {
    fullTbody.innerHTML = keys.length ? keys.map(k => {
      const fmtN = (n) => (n ?? 0).toLocaleString('en-US');
      return `
      <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
        <td class="py-3 font-bold font-sans text-slate-800 dark:text-white">${KeepupAPI.escapeHtml(k.name)}</td>
        <td class="py-3 text-fuchsia-600 dark:text-fuchsia-400 font-mono">${KeepupAPI.escapeHtml(k.keyPrefix)}...</td>
        <td class="py-3 font-mono">${k.rpmLimit}</td>
        <td class="py-3 font-mono" title="Exact per-key token usage (LiteLLM-attributed)">${fmtN(k.totalTokens)}</td>
        <td class="py-3 font-mono">${fmtN(k.usageCount)}</td>
        <td class="py-3 font-sans text-slate-400">${new Date(k.createdAt).toLocaleDateString()}</td>
        <td class="py-3"><span class="px-2.5 py-1 rounded-full text-[10px] font-extrabold ${k.status === 'active' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600' : 'bg-red-100 text-red-600'}">${k.status === 'active' ? 'ACTIVE' : 'REVOKED'}</span></td>
        <td class="py-3 text-right">
          ${k.status === 'active' ? `<button onclick="revokeKey('${k.id}')" class="px-2.5 py-1 rounded-lg text-xs font-bold text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">Revoke</button>
          <button onclick="rotateKey('${k.id}')" class="px-2.5 py-1 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">Rotate</button>` : '<span class="text-slate-400 text-xs">—</span>'}
        </td>
      </tr>
    `;}).join('') : '<tr><td colspan="8" class="py-6 text-center font-sans text-slate-400">No virtual keys created.</td></tr>';
  }

  // 3. Ledger Sync (real append-only ledger; same tables)
  let ledger = [];
  try {
    ledger = (await KeepupAPI.App.transactions(50)).transactions || [];
  } catch (err) {
    if (err && err.status === 401) return;
  }

  const overviewLedger = document.getElementById('overview-ledger-table');
  const fullLedger = document.getElementById('ledger-table-body');

  function fmtAmount(l) {
    const usd = Math.abs(Number(l.amount_micros)) / 1e6;
    // Sub-cent amounts (real usage debits) must not render as $0.00 —
    // show micro-precision so the ledger never displays misleading zeros.
    const text = usd > 0 && usd < 0.005 ? usd.toFixed(6) : usd.toFixed(2);
    return (l.side === 'credit' ? '+$' : '\u2212$') + text;
  }
  const ledgerHtml = ledger.length ? ledger.map(l => `
    <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
      <td class="py-2.5 font-bold text-slate-700 dark:text-slate-300 font-sans">${KeepupAPI.escapeHtml(l.entry_type)}</td>
      <td class="py-2.5 ${l.side === 'credit' ? 'text-emerald-600 font-extrabold' : 'text-slate-700 dark:text-slate-300 font-bold'} font-mono">${fmtAmount(l)}</td>
      <td class="py-2.5 font-mono">$${(Number(l.balance_after_micros) / 1e6).toFixed(2)}</td>
      <td class="py-2.5 font-sans text-slate-500 text-[11px] truncate max-w-xs">${KeepupAPI.escapeHtml(l.description || '')}</td>
    </tr>
  `).join('') : '<tr><td colspan="4" class="py-4 text-center font-sans text-slate-400">No transactions recorded.</td></tr>';

  if (overviewLedger) overviewLedger.innerHTML = ledgerHtml;

  if (fullLedger) {
    fullLedger.innerHTML = ledger.length ? ledger.map(l => `
      <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
        <td class="py-3 font-mono text-fuchsia-600 dark:text-fuchsia-400">#${KeepupAPI.escapeHtml(String(l.entry_id || '').slice(0, 8))}</td>
        <td class="py-3 font-bold font-sans text-slate-800 dark:text-white">${KeepupAPI.escapeHtml(l.entry_type)}</td>
        <td class="py-3 ${l.side === 'credit' ? 'text-emerald-600 font-extrabold' : 'text-slate-700 dark:text-slate-300 font-bold'} font-mono">${fmtAmount(l)}</td>
        <td class="py-3 font-mono">$${(Number(l.balance_after_micros) / 1e6).toFixed(2)}</td>
        <td class="py-3 font-sans text-slate-500 text-xs">${KeepupAPI.escapeHtml(l.description || '')}</td>
        <td class="py-3 font-mono text-[11px] text-slate-400">${new Date(l.created_at).toLocaleTimeString()}</td>
      </tr>
    `).join('') : '<tr><td colspan="6" class="py-6 text-center font-sans text-slate-400">No ledger transactions found.</td></tr>';
  }

  // 4. Invoices & receipts (org-scoped; PDF only when the archive has one)
  try {
    const invoices = (await KeepupAPI.App.invoices()).invoices || [];
    renderInvoices(invoices);
  } catch (err) {
    if (err && err.status === 401) return;
    renderInvoices(null); // render the error/empty state honestly
  }

  // 5. Payments & disputes (org-scoped; honest display states)
  try {
    const payments = (await KeepupAPI.App.payments()).payments || [];
    renderPayments(payments);
  } catch (err) {
    if (err && err.status === 401) return;
    renderPayments(null);
  }
}

const PAYMENT_BADGES = {
  disputed: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
  refunded: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  partially_refunded: 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400',
  manual_review: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400',
  succeeded: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600',
  pending: 'bg-sky-100 text-sky-600',
  failed: 'bg-rose-100 text-rose-600',
  cancelled: 'bg-slate-100 text-slate-500',
  expired: 'bg-slate-100 text-slate-500',
};

function renderPayments(payments) {
  const tbody = document.getElementById('payments-table-body');
  if (!tbody) return;
  if (payments === null) {
    tbody.innerHTML = '<tr><td colspan="7" class="py-6 text-center font-sans text-slate-400">Could not load payments. Please refresh.</td></tr>';
    return;
  }
  if (!payments.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="py-6 text-center font-sans text-slate-400">No payments yet. Your top-ups and their statuses appear here.</td></tr>';
    return;
  }
  tbody.innerHTML = payments.map(p => {
    const amount = (Number(p.amount_micros) / 1e6).toFixed(2);
    const display = String(p.displayStatus || p.status || 'pending').toLowerCase();
    const badge = PAYMENT_BADGES[display] || PAYMENT_BADGES.pending;
    const refundCell = Number(p.refundedMicros || 0) > 0
      ? `<span class="font-bold text-orange-600 dark:text-orange-400 font-mono">\u2212$${(Number(p.refundedMicros) / 1e6).toFixed(2)}</span>`
      : '<span class="text-slate-300 dark:text-slate-600">—</span>';
    const disputeCell = p.dispute_status
      ? `<span class="font-bold capitalize">${KeepupAPI.escapeHtml(String(p.dispute_status))}</span>`
      : '<span class="text-slate-300 dark:text-slate-600">—</span>';
    const evidenceCell = p.evidence_due_by
      ? new Date(p.evidence_due_by).toLocaleDateString()
      : '<span class="text-slate-300 dark:text-slate-600">—</span>';
    return `
      <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
        <td class="py-3 capitalize font-bold font-sans text-slate-800 dark:text-white">${KeepupAPI.escapeHtml(String(p.provider))}</td>
        <td class="py-3 font-mono font-bold">${KeepupAPI.escapeHtml(String(p.currency))} ${amount}</td>
        <td class="py-3"><span class="px-2.5 py-1 rounded-full text-[10px] font-extrabold ${badge}">${KeepupAPI.escapeHtml(display.replace(/_/g, ' '))}</span></td>
        <td class="py-3">${refundCell}</td>
        <td class="py-3">${disputeCell}</td>
        <td class="py-3 font-sans text-slate-500 text-xs">${evidenceCell}</td>
        <td class="py-3 font-sans text-slate-500 text-xs">${new Date(p.created_at).toLocaleDateString()}</td>
      </tr>`;
  }).join('');
}

function renderInvoices(invoices) {
  const tbody = document.getElementById('invoices-table-body');
  if (!tbody) return;
  if (invoices === null) {
    tbody.innerHTML = '<tr><td colspan="6" class="py-6 text-center font-sans text-slate-400">Could not load invoices. Please refresh.</td></tr>';
    return;
  }
  if (!invoices.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="py-6 text-center font-sans text-slate-400">No invoices yet. Receipts appear here after your first top-up.</td></tr>';
    return;
  }
  tbody.innerHTML = invoices.map(inv => {
    const amount = (Number(inv.amount_micros) / 1e6).toFixed(2);
    const paid = inv.status === 'paid';
    return `
      <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
        <td class="py-3 font-mono text-fuchsia-600 dark:text-fuchsia-400">${KeepupAPI.escapeHtml(inv.number)}</td>
        <td class="py-3 font-bold font-sans text-slate-800 dark:text-white">${inv.kind === 'receipt' ? 'Receipt' : inv.kind === 'credit_note' ? 'Credit note' : 'Invoice'}</td>
        <td class="py-3 font-mono font-bold ${inv.kind === 'credit_note' ? 'text-orange-600 dark:text-orange-400' : ''}">${inv.kind === 'credit_note' ? '\u2212' : ''}${KeepupAPI.escapeHtml(inv.currency)} ${amount}</td>
        <td class="py-3"><span class="px-2.5 py-1 rounded-full text-[10px] font-extrabold ${paid ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600' : 'bg-amber-100 text-amber-600'}">${KeepupAPI.escapeHtml(String(inv.status).toUpperCase())}</span></td>
        <td class="py-3 font-sans text-slate-500 text-xs">${new Date(inv.issued_at).toLocaleDateString()}</td>
        <td class="py-3 text-right">
          ${inv.has_pdf
            ? `<button onclick="downloadInvoice('${inv.id}')" class="px-2.5 py-1 rounded-lg text-xs font-bold text-fuchsia-600 hover:bg-fuchsia-50 dark:hover:bg-fuchsia-900/20 transition-colors"><i class="fa-solid fa-download mr-1"></i>Download</button>`
            : '<span class="text-slate-400 text-xs" title="The PDF is generated shortly after payment confirmation">Pending</span>'}
        </td>
      </tr>`;
  }).join('');
}

/**
 * Downloads the archived receipt PDF through the authenticated endpoint.
 * Uses fetch so the session cookie applies and errors surface as toasts;
 * the blob is handed to the browser's download manager.
 */
async function downloadInvoice(invoiceId) {
  try {
    const res = await fetch(KeepupAPI.App.invoiceDownloadUrl(invoiceId), { credentials: 'same-origin' });
    if (!res.ok) {
      showToast(res.status === 404
        ? 'The receipt PDF is not available yet. Please try again in a few minutes.'
        : 'Could not download the receipt. Please try again.');
      return;
    }
    const blob = await res.blob();
    const dispo = res.headers.get('content-disposition') || '';
    const m = dispo.match(/filename="([^"]+)"/);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = m ? m[1] : 'receipt.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  } catch {
    showToast('Could not download the receipt. Please try again.');
  }
}

// ==========================================
// Modal Operations (TopUp & Key Creation)
// ==========================================
// ============================================================================
// Add Prepaid Credits — 4-step wizard (amount+country → method → invoice →
// order summary). Every number shown in step 4 comes from the server's
// /checkout-quote; the client never computes VAT, fees, or discounts.
// ============================================================================
// Worldwide country list (ISO 3166-1 alpha-2, flag emoji + name). The flag is
// decorative; the server decides VAT from its own tax_rates table — the client
// list only has to be complete, never authoritative.
const TOPUP_COUNTRIES = [
  ['AD','🇦🇩 Andorra'],['AE','🇦🇪 United Arab Emirates'],['AF','🇦🇫 Afghanistan'],['AG','🇦🇬 Antigua & Barbuda'],
  ['AI','🇦🇮 Anguilla'],['AL','🇦🇱 Albania'],['AM','🇦🇲 Armenia'],['AO','🇦🇴 Angola'],['AR','🇦🇷 Argentina'],
  ['AS','🇦🇸 American Samoa'],['AT','🇦🇹 Austria'],['AU','🇦🇺 Australia'],['AW','🇦🇼 Aruba'],['AZ','🇦🇿 Azerbaijan'],
  ['BA','🇧🇦 Bosnia & Herzegovina'],['BB','🇧🇧 Barbados'],['BD','🇧🇩 Bangladesh'],['BE','🇧🇪 Belgium'],
  ['BF','🇧🇫 Burkina Faso'],['BG','🇧🇬 Bulgaria'],['BH','🇧🇭 Bahrain'],['BI','🇧🇮 Burundi'],['BJ','🇧🇯 Benin'],
  ['BM','🇧🇲 Bermuda'],['BN','🇧🇳 Brunei'],['BO','🇧🇴 Bolivia'],['BR','🇧🇷 Brazil'],['BS','🇧🇸 Bahamas'],
  ['BT','🇧🇹 Bhutan'],['BW','🇧🇼 Botswana'],['BY','🇧🇾 Belarus'],['BZ','🇧🇿 Belize'],['CA','🇨🇦 Canada'],
  ['CD','🇨🇩 DR Congo'],['CF','🇨🇫 Central African Republic'],['CG','🇨🇬 Congo'],['CH','🇨🇭 Switzerland'],
  ['CI','🇨🇮 Côte d’Ivoire'],['CL','🇨🇱 Chile'],['CM','🇨🇲 Cameroon'],['CN','🇨🇳 China'],['CO','🇨🇴 Colombia'],
  ['CR','🇨🇷 Costa Rica'],['CU','🇨🇺 Cuba'],['CV','🇨🇻 Cape Verde'],['CW','🇨🇼 Curaçao'],['CY','🇨🇾 Cyprus'],
  ['CZ','🇨🇿 Czechia'],['DE','🇩🇪 Germany'],['DJ','🇩🇯 Djibouti'],['DK','🇩🇰 Denmark'],['DM','🇩🇲 Dominica'],
  ['DO','🇩🇴 Dominican Republic'],['DZ','🇩🇿 Algeria'],['EC','🇪🇨 Ecuador'],['EE','🇪🇪 Estonia'],['EG','🇪🇬 Egypt'],
  ['ER','🇪🇷 Eritrea'],['ES','🇪🇸 Spain'],['ET','🇪🇹 Ethiopia'],['FI','🇫🇮 Finland'],['FJ','🇫🇯 Fiji'],
  ['FM','🇫🇲 Micronesia'],['FO','🇫🇴 Faroe Islands'],['FR','🇫🇷 France'],['GA','🇬🇦 Gabon'],['GB','🇬🇧 United Kingdom'],
  ['GD','🇬🇩 Grenada'],['GE','🇬🇪 Georgia'],['GH','🇬🇭 Ghana'],['GI','🇬🇮 Gibraltar'],['GL','🇬🇱 Greenland'],
  ['GM','🇬🇲 Gambia'],['GN','🇬🇳 Guinea'],['GP','🇬🇵 Guadeloupe'],['GQ','🇬🇶 Equatorial Guinea'],['GR','🇬🇷 Greece'],
  ['GT','🇬🇹 Guatemala'],['GU','🇬🇺 Guam'],['GW','🇬🇼 Guinea-Bissau'],['GY','🇬🇾 Guyana'],['HK','🇭🇰 Hong Kong'],
  ['HN','🇭🇳 Honduras'],['HR','🇭🇷 Croatia'],['HT','🇭🇹 Haiti'],['HU','🇭🇺 Hungary'],['ID','🇮🇩 Indonesia'],
  ['IE','🇮🇪 Ireland'],['IL','🇮🇱 Israel'],['IM','🇮🇲 Isle of Man'],['IN','🇮🇳 India'],['IQ','🇮🇶 Iraq'],
  ['IS','🇮🇸 Iceland'],['IT','🇮🇹 Italy'],['JM','🇯🇲 Jamaica'],['JO','🇯🇴 Jordan'],['JP','🇯🇵 Japan'],
  ['KE','🇰🇪 Kenya'],['KG','🇰🇬 Kyrgyzstan'],['KH','🇰🇭 Cambodia'],['KM','🇰🇲 Comoros'],['KN','🇰🇳 St Kitts & Nevis'],
  ['KR','🇰🇷 South Korea'],['KW','🇰🇼 Kuwait'],['KY','🇰🇾 Cayman Islands'],['KZ','🇰🇿 Kazakhstan'],['LA','🇱🇦 Laos'],
  ['LB','🇱🇧 Lebanon'],['LC','🇱🇨 St Lucia'],['LI','🇱🇮 Liechtenstein'],['LK','🇱🇰 Sri Lanka'],['LR','🇱🇷 Liberia'],
  ['LS','🇱🇸 Lesotho'],['LT','🇱🇹 Lithuania'],['LU','🇱🇺 Luxembourg'],['LV','🇱🇻 Latvia'],['LY','🇱🇾 Libya'],
  ['MA','🇲🇦 Morocco'],['MC','🇲🇨 Monaco'],['MD','🇲🇩 Moldova'],['ME','🇲🇪 Montenegro'],['MG','🇲🇬 Madagascar'],
  ['MK','🇲🇰 North Macedonia'],['ML','🇲🇱 Mali'],['MM','🇲🇲 Myanmar'],['MN','🇲🇳 Mongolia'],['MO','🇲🇴 Macau'],
  ['MQ','🇲🇶 Martinique'],['MR','🇲🇷 Mauritania'],['MT','🇲🇹 Malta'],['MU','🇲🇺 Mauritius'],['MV','🇲🇻 Maldives'],
  ['MW','🇲🇼 Malawi'],['MX','🇲🇽 Mexico'],['MY','🇲🇾 Malaysia'],['MZ','🇲🇿 Mozambique'],['NA','🇳🇦 Namibia'],
  ['NC','🇳🇨 New Caledonia'],['NE','🇳🇪 Niger'],['NG','🇳🇬 Nigeria'],['NI','🇳🇮 Nicaragua'],['NL','🇳🇱 Netherlands'],
  ['NO','🇳🇴 Norway'],['NP','🇳🇵 Nepal'],['NZ','🇳🇿 New Zealand'],['OM','🇴🇲 Oman'],['PA','🇵🇦 Panama'],
  ['PE','🇵🇪 Peru'],['PF','🇵🇫 French Polynesia'],['PG','🇵🇬 Papua New Guinea'],['PH','🇵🇭 Philippines'],
  ['PK','🇵🇰 Pakistan'],['PL','🇵🇱 Poland'],['PR','🇵🇷 Puerto Rico'],['PS','🇵🇸 Palestine'],['PT','🇵🇹 Portugal'],
  ['PY','🇵🇾 Paraguay'],['QA','🇶🇦 Qatar'],['RE','🇷🇪 Réunion'],['RO','🇷🇴 Romania'],['RS','🇷🇸 Serbia'],
  ['RU','🇷🇺 Russia'],['RW','🇷🇼 Rwanda'],['SA','🇸🇦 Saudi Arabia'],['SB','🇸🇧 Solomon Islands'],['SC','🇸🇨 Seychelles'],
  ['SD','🇸🇩 Sudan'],['SE','🇸🇪 Sweden'],['SG','🇸🇬 Singapore'],['SI','🇸🇮 Slovenia'],['SK','🇸🇰 Slovakia'],
  ['SL','🇸🇱 Sierra Leone'],['SM','🇸🇲 San Marino'],['SN','🇸🇳 Senegal'],['SO','🇸🇴 Somalia'],['SR','🇸🇷 Suriname'],
  ['SS','🇸🇸 South Sudan'],['SV','🇸🇻 El Salvador'],['SX','🇸🇽 Sint Maarten'],['SY','🇸🇾 Syria'],['SZ','🇸🇿 Eswatini'],
  ['TC','🇹🇨 Turks & Caicos'],['TD','🇹🇩 Chad'],['TG','🇹🇬 Togo'],['TH','🇹🇭 Thailand'],['TJ','🇹🇯 Tajikistan'],
  ['TM','🇹🇲 Turkmenistan'],['TN','🇹🇳 Tunisia'],['TO','🇹🇴 Tonga'],['TR','🇹🇷 Türkiye'],['TT','🇹🇹 Trinidad & Tobago'],
  ['TW','🇹🇼 Taiwan'],['TZ','🇹🇿 Tanzania'],['UA','🇺🇦 Ukraine'],['UG','🇺🇬 Uganda'],['US','🇺🇸 United States'],
  ['UY','🇺🇾 Uruguay'],['UZ','🇺🇿 Uzbekistan'],['VA','🇻🇦 Vatican City'],['VC','🇻🇨 St Vincent'],['VE','🇻🇪 Venezuela'],
  ['VG','🇻🇬 British Virgin Is.'],['VN','🇻🇳 Vietnam'],['VU','🇻🇺 Vanuatu'],['WS','🇼🇸 Samoa'],['XK','🇽🇰 Kosovo'],
  ['YE','🇾🇪 Yemen'],['ZA','🇿🇦 South Africa'],['ZM','🇿🇲 Zambia'],['ZW','🇿🇼 Zimbabwe'],
];
const TOPUP_STATE = { step: 1, methods: [], methodId: null, quote: null, invType: 'personal', currency: 'USD' };

function topupCurrency(v, cur) {
  // v is integer micros. HUF displays with no decimals (no minor unit).
  return cur === 'HUF' ? Math.round(v / 1e6).toLocaleString() + ' Ft' : '$' + (v / 1e6).toFixed(2);
}

function topupSetAmount(v) {
  const el = document.getElementById('topup-amount');
  if (el) { el.value = v; topupQuoteDebounced(); }
}

/** Populate the billing-country select once. Server list wins (one source of
 * truth: the billing_countries table); the bundled TOPUP_COUNTRIES is only the
 * pre-fetch fallback and the flag-emoji source. */
async function topupLoadCountries() {
  const sel = document.getElementById('topup-country');
  if (!sel) return;
  if (sel.options.length > 1) return; // already populated
  const flags = new Map(TOPUP_COUNTRIES.map(([c, label]) => [c, label.split(' ')[0]]));
  let rows = null;
  try {
    const res = await fetch('/api/billing/countries');
    if (res.ok) rows = (await res.json())?.countries ?? null;
  } catch { /* fallback below */ }
  if (!rows || rows.length === 0) rows = TOPUP_COUNTRIES.map(([c, label]) => ({ code: c, name: label.split(' ').slice(1).join(' ') }));
  sel.innerHTML = '<option value="">Select country…</option>' +
    rows.map((r) => `${flags.get(r.code) ?? '🏳️'} ${r.name}`).map((label, i) => `<option value="${rows[i].code}">${label}</option>`).join('');
}

function openTopUpModal() {
  const m = document.getElementById('topup-modal');
  if (!m) return;
  TOPUP_STATE.step = 1; TOPUP_STATE.methods = []; TOPUP_STATE.methodId = null;
  TOPUP_STATE.quote = null; TOPUP_STATE.invType = 'personal';
  void topupLoadCountries();
  m.showModal();
  topupShowStep(1);
  topupQuote();
}

function closeTopUpModal() {
  const m = document.getElementById('topup-modal');
  if (m) m.close();
}

let _topupQuoteTimer = null;
function topupQuoteDebounced() {
  clearTimeout(_topupQuoteTimer);
  _topupQuoteTimer = setTimeout(topupQuote, 350);
}

/** Ask the server for the authoritative Order summary (silent on errors —
 * step 1 just shows the base until a valid quote is possible). */
async function topupQuote() {
  const amount = parseFloat(document.getElementById('topup-amount')?.value || '10');
  const country = document.getElementById('topup-country')?.value || undefined;
  const promo = document.getElementById('topup-promo')?.value.trim() || undefined;
  const baseEl = document.getElementById('topup-base-value');
  if (baseEl) baseEl.textContent = topupCurrency(Math.round(amount * 1e6), TOPUP_STATE.currency);
  if (!(amount >= 5)) { TOPUP_STATE.quote = null; return; }
  try {
    const res = await KeepupAPI.App.checkoutQuote({
      amount, ...(country ? { country } : {}), ...(promo ? { promoCode: promo } : {}),
      ...(TOPUP_STATE.methodId ? { methodId: TOPUP_STATE.methodId } : {}),
    });
    TOPUP_STATE.quote = res.quote;
    if (res.currency) TOPUP_STATE.currency = res.currency;
    if (baseEl) baseEl.textContent = topupCurrency(res.quote.baseMicros, TOPUP_STATE.currency);
    if (TOPUP_STATE.step === 4) topupRenderSummary();
  } catch { /* keep the last good quote; submit re-validates server-side */ }
}

async function topupLoadMethods() {
  const grid = document.getElementById('topup-method-grid');
  if (!grid) return [];
  grid.innerHTML = '<div class="col-span-2 text-[11px] text-slate-400 animate-pulse">Loading payment methods…</div>';
  try {
    let currency = 'USD';
    try {
      const s = await KeepupAPI.App.orgSummary();
      if (s && s.balance && s.balance.currency) currency = s.balance.currency;
    } catch { /* fall back to USD */ }
    TOPUP_STATE.currency = currency;
    const res = await KeepupAPI.App.paymentMethods(currency);
    TOPUP_STATE.methods = (res && res.methods) || [];
    if (!TOPUP_STATE.methods.length) {
      grid.innerHTML = '<div class="col-span-2 text-[11px] text-slate-500">No payment methods are available yet. Contact support to add credits.</div>';
      return [];
    }
    const ICONS = { card: 'fa-credit-card', crypto: 'fa-gem', bank_transfer: 'fa-arrow-right-arrow-left', wallet: 'fa-wallet' };
    grid.innerHTML = TOPUP_STATE.methods.map((mm) => `
      <button type="button" data-mid="${mm.id}" onclick="topupPickMethod('${mm.id}')"
        class="topup-method p-3 rounded-xl border text-left ${TOPUP_STATE.methodId === mm.id ? 'border-fuchsia-500 ring-1 ring-fuchsia-500 bg-fuchsia-50/60 dark:bg-fuchsia-950/20' : 'border-slate-200 dark:border-slate-700 hover:border-fuchsia-300'}">
        <div class="flex items-center gap-2">
          <i class="fa-solid ${ICONS[mm.type] || 'fa-money-bill'} text-slate-600"></i>
          <span class="text-xs font-extrabold text-slate-900">${mm.displayName}</span>
          ${TOPUP_STATE.methodId === mm.id ? '<i class="fa-solid fa-circle-check text-fuchsia-600 ml-auto"></i>' : ''}
        </div>
      </button>`).join('');
    if (!TOPUP_STATE.methodId && TOPUP_STATE.methods.length) topupPickMethod(TOPUP_STATE.methods[0].id, true);
    return TOPUP_STATE.methods;
  } catch {
    grid.innerHTML = '<div class="col-span-2 text-[11px] text-red-500">Could not load payment methods.</div>';
    return [];
  }
}

function topupPickMethod(id, silent) {
  TOPUP_STATE.methodId = id;
  document.querySelectorAll('#topup-method-grid .topup-method').forEach((b) => {
    const on = b.dataset.mid === id;
    b.classList.toggle('border-fuchsia-500', on);
    b.classList.toggle('ring-1', on);
    b.classList.toggle('ring-fuchsia-500', on);
    const chk = b.querySelector('.fa-circle-check');
    if (chk) chk.remove();
    if (on) b.insertAdjacentHTML('beforeend', '<i class="fa-solid fa-circle-check text-fuchsia-600 ml-auto"></i>');
  });
  const mm = TOPUP_STATE.methods.find((x) => x.id === id);
  const note = document.getElementById('topup-method-note');
  if (note && mm) note.textContent = mm.availabilityReason || '';
  if (!silent) topupQuoteDebounced();
}

function topupInvType(t) {
  TOPUP_STATE.invType = t;
  const p = document.getElementById('inv-tab-personal'), b = document.getElementById('inv-tab-business');
  if (p && b) {
    const on = 'flex-1 py-1.5 rounded-lg bg-white dark:bg-slate-700 shadow text-slate-900';
    const off = 'flex-1 py-1.5 rounded-lg text-slate-500';
    p.className = t === 'personal' ? on : off;
    b.className = t === 'business' ? on : off;
  }
  const vw = document.getElementById('inv-vat-wrap');
  if (vw) vw.classList.toggle('hidden', t !== 'business');
}

function topupValidateStep(step) {
  if (step === 1) {
    const amount = parseFloat(document.getElementById('topup-amount')?.value || '0');
    if (!(amount >= 5)) { showToast('Minimum deposit is $5.'); return false; }
    return true;
  }
  if (step === 2) {
    if (!TOPUP_STATE.methods.length) { showToast('No payment methods are available yet. Contact support to add credits.'); return false; }
    if (!TOPUP_STATE.methodId) { showToast('Choose a payment method.'); return false; }
    return true;
  }
  if (step === 3) {
    const name = document.getElementById('inv-fullname')?.value.trim();
    const addr = document.getElementById('inv-address')?.value.trim();
    if (!name) { showToast('Enter the name for the invoice.'); return false; }
    if (!addr) { showToast('Enter the billing address.'); return false; }
    return true;
  }
  return true;
}

async function topupNext() {
  const s = TOPUP_STATE.step;
  if (!topupValidateStep(s)) return;
  if (s === 1) { TOPUP_STATE.step = 2; topupShowStep(2); await topupLoadMethods(); return; }
  if (s === 2) { TOPUP_STATE.step = 3; topupShowStep(3); return; }
  if (s === 3) { TOPUP_STATE.step = 4; topupShowStep(4); await topupQuote(); topupRenderSummary(); return; }
  await submitTopUp();
}

function topupBack() {
  if (TOPUP_STATE.step > 1) {
    TOPUP_STATE.step -= 1;
    topupShowStep(TOPUP_STATE.step);
  }
}

function topupShowStep(n) {
  for (let i = 1; i <= 4; i++) {
    const el = document.getElementById('topup-step-' + i);
    if (el) el.classList.toggle('hidden', i !== n);
  }
  const title = document.getElementById('topup-title');
  if (title) title.textContent = 'Add Prepaid Credits';
  const next = document.getElementById('topup-next');
  if (next) {
    next.textContent = n === 4 ? 'Continue to secure checkout' : 'Continue';
    next.disabled = false;
  }
  const back = document.getElementById('topup-back');
  if (back) back.classList.toggle('hidden', n === 1);
}

function topupRenderSummary() {
  const q = TOPUP_STATE.quote;
  const box = document.getElementById('topup-summary');
  const totalEl = document.getElementById('topup-total');
  const creditLine = document.getElementById('topup-credit-line');
  if (!box || !q) return;
  const cur = TOPUP_STATE.currency;
  const mm = TOPUP_STATE.methods.find((x) => x.id === TOPUP_STATE.methodId);
  const name = document.getElementById('inv-fullname')?.value.trim() || '';
  const rows = [
    ['Base credit amount', topupCurrency(q.baseMicros, cur)],
  ];
  if (q.vatRateBp > 0) rows.push([`VAT (${(q.vatRateBp / 100).toFixed(1)}%)`, topupCurrency(q.vatMicros, cur)]);
  if (q.feeRateBp > 0) rows.push(['Payment processing fee', topupCurrency(q.feeMicros, cur)]);
  if (q.promoCode) rows.push(['Promotional credit (' + q.promoCode + ')', '−' + topupCurrency(q.promoMicros, cur)]);
  rows.push(['Payment method', mm ? mm.displayName : '—']);
  rows.push(['Invoice to', name]);
  box.innerHTML = rows.map(([k, v]) =>
    `<div class="flex justify-between gap-4"><span>${k}</span><b class="text-slate-800 dark:text-white">${v}</b></div>`).join('');
  if (totalEl) totalEl.textContent = topupCurrency(q.totalMicros, cur);
  if (creditLine) creditLine.textContent = `You receive ${topupCurrency(q.baseMicros, cur)} in prepaid usage credits.`;
}

async function submitTopUp() {
  const amount = parseFloat(document.getElementById('topup-amount').value || '10');
  if (!TOPUP_STATE.methodId) {
    showToast('No payment method is available yet. Contact support to add credits.');
    return;
  }
  const next = document.getElementById('topup-next');
  if (next) { next.disabled = true; next.textContent = 'Starting secure checkout…'; }
  try {
    const fullName = document.getElementById('inv-fullname')?.value.trim() || '';
    const address = document.getElementById('inv-address')?.value.trim() || '';
    const vatId = document.getElementById('inv-vatid')?.value.trim() || '';
    const country = document.getElementById('topup-country')?.value || undefined;
    const promo = document.getElementById('topup-promo')?.value.trim() || undefined;
    const res = await KeepupAPI.App.checkoutSession({
      amount,
      methodId: TOPUP_STATE.methodId,
      ...(country ? { country } : {}),
      ...(promo ? { promoCode: promo } : {}),
      invoiceDetails: {
        type: TOPUP_STATE.invType,
        fullName,
        address,
        ...(TOPUP_STATE.invType === 'business' && vatId ? { vatId } : {}),
      },
    });
    if (res && res.checkoutUrl) {
      showToast('Redirecting to secure checkout. Credits are added after payment confirmation.');
      window.location.href = res.checkoutUrl;
      return;
    }
  } catch (err) {
    showToast(err.message || 'Payments are not configured yet. Contact support to add credits.');
  }
  if (next) { next.disabled = false; next.textContent = 'Continue to secure checkout'; }
}

function openNewKeyModal() {
  const m = document.getElementById('new-key-modal');
  if (m) m.showModal();
}
function closeNewKeyModal() {
  const m = document.getElementById('new-key-modal');
  if (m) m.close();
}
async function submitCreateKey() {
  const name = document.getElementById('new-key-name').value.trim() || 'New API Key';
  const rpm = parseInt(document.getElementById('new-key-rpm').value, 10) || 600;
  const monthlyCap = parseFloat(document.getElementById('new-key-budget')?.value) || 25;
  const cidrAllowlist = document.getElementById('new-key-cidr')?.value.trim() || '';
  const corsOrigins = document.getElementById('new-key-cors')?.value.trim() || '';
  
  try {
    const data = await KeepupAPI.App.createKey({
      name,
      rpmLimit: Math.min(Math.max(rpm, 1), 10000),
      monthlyCapUsd: monthlyCap > 0 ? monthlyCap : undefined,
      ipAllowlist: cidrAllowlist ? cidrAllowlist.split(',').map(s => s.trim()).filter(Boolean) : undefined
    });
    closeNewKeyModal();
    if (data.secret) {
      // Shown exactly once. Never stored by this app.
      document.getElementById('created-raw-key-box').innerText = data.secret;
      document.getElementById('master-key-modal').showModal();
      showToast('API key created. Copy it now. It will not be shown again.');
    }
    await loadData();
  } catch (err) {
    showToast(err.message || 'Could not create the API key.');
  }
}

async function rotateKey(id) {
  if (!confirm('Rotate this key? A new key is created and the current one is revoked immediately.')) return;
  try {
    const data = await KeepupAPI.App.rotateKey(id);
    if (data.secret) {
      document.getElementById('created-raw-key-box').innerText = data.secret;
      document.getElementById('master-key-modal').showModal();
      showToast('Key rotated. Store the new key now.');
    }
    await loadData();
  } catch (err) {
    showToast(err.message || 'Could not rotate the key.');
  }
}

async function revokeKey(id) {
  if (!confirm('Revoke this API key? Applications using it stop working immediately.')) return;
  try {
    await KeepupAPI.App.revokeKey(id);
    showToast('API Key revoked');
  } catch (err) {
    showToast(err.message || 'Could not revoke the key.');
  }
  await loadData();
}

function copyMasterKey() {
  const box = document.getElementById('created-raw-key-box');
  const secret = box ? box.innerText.trim() : '';
  if (!secret) return;
  navigator.clipboard.writeText(secret);
  showToast('Key copied. Store it in a secure secret manager.');
}

function copyOutput() {
  navigator.clipboard.writeText(document.getElementById('play-output').innerText);
  showToast('Copied completion to clipboard!');
}

function openExportModal() {
  const m = document.getElementById('export-modal');
  if (!m) return;
  m.showModal();
  const model = document.getElementById('play-model-select').value;
  const user = document.getElementById('play-user-prompt').value;
  document.getElementById('export-snippet-box').innerText = `from openai import OpenAI

client = OpenAI(
    base_url="${getGatewayBaseUrl()}/v1",
    api_key="YOUR_KEEPUPCODING_API_KEY"
)

response = client.chat.completions.create(
    model="${model}",
    messages=[{"role": "user", "content": "${user}"}],
    stream=True
)

for chunk in response:
    print(chunk.choices[0].delta.content or "", end="", flush=True)`;
}
function closeExportModal() {
  const m = document.getElementById('export-modal');
  if (m) m.close();
}
function copyExportCode() {
  navigator.clipboard.writeText(document.getElementById('export-snippet-box').innerText);
  showToast('Code snippet copied!');
}

// ==========================================
// SSE Real-Time Streaming (Studio & Quick)
// ==========================================
async function runPlaygroundStream() {
  const out = document.getElementById('play-output');
  const timeEl = document.getElementById('play-time');
  const speedEl = document.getElementById('play-speed');
  const model = currentPlaygroundModel();
  const sys = document.getElementById('play-system-prompt').value;
  const user = document.getElementById('play-user-prompt').value;
  const temp = parseFloat(document.getElementById('param-temp').value) || 0.7;
  const maxTokens = parseInt(document.getElementById('param-tokens').value, 10) || 2048;

  out.innerText = '';
  const startTime = Date.now();
  let tokenCount = 0;

  const timer = setInterval(() => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    if (timeEl) timeEl.innerText = elapsed + 's';
    if (speedEl && elapsed > 0) speedEl.innerText = (tokenCount / elapsed).toFixed(1) + ' tok/s';
  }, 100);

  let studioSecret = null;
  try {
    const tok = await KeepupAPI.App.studioToken();
    studioSecret = tok.secret;
  } catch (err) {
    out.innerText = 'Sign in to use the Studio.';
    return;
  }

  try {
    const resp = await fetch(getGatewayBaseUrl() + '/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + studioSecret
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: user }
        ],
        temperature: temp,
        max_tokens: maxTokens,
        stream: true
      })
    });

    if (!resp.ok) {
      clearInterval(timer);
      out.innerText = 'Error: ' + (await resp.text());
      return;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data: ')) {
          const str = trimmed.replace('data: ', '').trim();
          if (str === '[DONE]') {
            clearInterval(timer);
            loadData();
            return;
          }
          try {
            const parsed = JSON.parse(str);
            const content = parsed.choices?.[0]?.delta?.content || '';
            out.innerText += content;
            tokenCount++;
          } catch(e) {}
        }
      }
    }
  } catch (err) {
    clearInterval(timer);
    out.innerText = 'Gateway Connection Error: ' + err.message;
  }
  clearInterval(timer);
  loadData();
}

async function runQuickStream() {
  const out = document.getElementById('quick-output');
  const text = document.getElementById('quick-prompt').value;
  out.innerText = 'Connecting to Gateway...';

  let studioSecret = null;
  try {
    const tok = await KeepupAPI.App.studioToken();
    studioSecret = tok.secret;
  } catch (err) {
    out.innerText = 'Sign in to try the playground.';
    return;
  }

  try {
    const resp = await fetch(getGatewayBaseUrl() + '/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + studioSecret
      },
      body: JSON.stringify({
        model: currentPlaygroundModel(),
        messages: [{ role: 'user', content: text }],
        stream: true
      })
    });

    if (!resp.ok) {
      out.innerText = 'Error: ' + (await resp.text());
      return;
    }

    out.innerText = '';
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data: ')) {
          const str = trimmed.replace('data: ', '').trim();
          if (str === '[DONE]') {
            loadData();
            return;
          }
          try {
            const parsed = JSON.parse(str);
            out.innerText += parsed.choices?.[0]?.delta?.content || '';
          } catch(e) {}
        }
      }
    }
  } catch (err) {
    out.innerText = 'Error: ' + err.message;
  }
  loadData();
}

// ==========================================
// Documentation Language Tabs
// ==========================================
// KeepUpCoding MCP Server setup: copy-paste snippets.
function mcpServerConfig() {
  return {
    mcpServers: {
      keepupcoding: {
        command: "npx",
        args: ["-y", "@keepupcoding/mcp-server"],
        env: {
          KEEPUPCODING_API_KEY: "$KEEPUPCODING_API_KEY",
          KEEPUPCODING_BASE_URL: getGatewayBaseUrl() + "/v1",
        },
      },
    },
  };
}

function renderMcpSetup() {
  const cfg = document.getElementById('mcp-config-box');
  if (cfg) cfg.innerText = JSON.stringify(mcpServerConfig(), null, 2);
  const npx = document.getElementById('mcp-npx-box');
  if (npx) npx.innerText =
    '# Export your key first (never paste it into a shell history file):\n' +
    'export KEEPUPCODING_API_KEY="sk-ku-..."\n\n' +
    'npx -y @keepupcoding/mcp-server \\\n' +
    '  --base-url ' + getGatewayBaseUrl() + '/v1';
}

function copyMcpConfig() {
  navigator.clipboard.writeText(JSON.stringify(mcpServerConfig(), null, 2))
    .then(() => showToast('MCP config copied'));
}

function copyMcpNpx() {
  const npx = document.getElementById('mcp-npx-box');
  if (npx) navigator.clipboard.writeText(npx.innerText).then(() => showToast('Command copied'));
}

function switchDocTab(lang) {
  ['py', 'js', 'curl'].forEach(t => {
    const el = document.getElementById('tab-doc-' + t);
    if (el) {
      if (t === lang) {
        el.className = 'px-3 py-1 rounded-lg text-xs font-bold bg-gradient-primary text-white shadow-soft-primary cursor-pointer';
      } else {
        el.className = 'px-3 py-1 rounded-lg text-xs font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer';
      }
    }
  });

  const box = document.getElementById('doc-code-box');
  if (!box) return;

  if (lang === 'py') {
    box.innerText = `from openai import OpenAI

client = OpenAI(
    base_url="${getGatewayBaseUrl()}/v1",
    api_key="YOUR_KEEPUPCODING_API_KEY"
)

stream = client.chat.completions.create(
    model="meta-llama/llama-3.3-70b-instruct",
    messages=[{"role": "user", "content": "Hello KeepUpCoding!"}],
    stream=True
)

for chunk in stream:
    print(chunk.choices[0].delta.content or "", end="", flush=True)`;
  } else if (lang === 'js') {
    box.innerText = `import { OpenAI } from "openai";

const client = new OpenAI({
  baseURL: "${getGatewayBaseUrl()}/v1",
  apiKey: "YOUR_KEEPUPCODING_API_KEY",
});

async function main() {
  const stream = await client.chat.completions.create({
    model: "meta-llama/llama-3.3-70b-instruct",
    messages: [{ role: "user", content: "Hello KeepUpCoding!" }],
    stream: true,
  });

  for await (const chunk of stream) {
    process.stdout.write(chunk.choices[0]?.delta?.content || "");
  }
}

main();`;
  } else if (lang === 'curl') {
    box.innerText = `curl ${getGatewayBaseUrl()}/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_KEEPUPCODING_API_KEY" \\
  -d '{
    "model": "meta-llama/llama-3.3-70b-instruct",
    "messages": [{"role": "user", "content": "Hello KeepUpCoding!"}],
    "stream": true
  }'`;
  }
}

// ==========================================
// Initialization on DOM Ready
// ==========================================
// Menu visibility: authenticated-only nav points are hidden until the session
// is confirmed. Public items (Model Catalog, Home, Docs) stay visible.
function applyNavVisibility() {
  const authed = KeepupAPI.session && KeepupAPI.session.state === 'authenticated';
  document.querySelectorAll('[data-auth-item]').forEach(function (li) {
    li.style.display = authed ? '' : 'none';
  });
  // Bottom-bar Sign Up: only meaningful when signed out.
  const bottomSignup = document.getElementById('bottom-signup');
  if (bottomSignup) bottomSignup.style.display = authed ? 'none' : '';
  // Hide any group whose visible items are all protected (e.g. mobile "Main Navigation").
  document.querySelectorAll('[data-auth-group]').forEach(function (heading) {
    let cursor = heading.nextElementSibling;
    while (cursor && !cursor.querySelector && cursor.tagName !== 'UL') cursor = cursor.nextElementSibling;
    const list = heading.parentElement ? heading.parentElement.querySelector('ul') : null;
    if (!list) return;
    const items = [...list.querySelectorAll('li')];
    const anyVisible = items.some(function (li) { return li.style.display !== 'none' && !li.hasAttribute('data-auth-item'); })
      || items.some(function (li) { return li.hasAttribute('data-auth-item') && li.style.display !== 'none'; });
    heading.style.display = anyVisible ? '' : 'none';
  });
}

document.addEventListener('keepup:session', applyNavVisibility);

document.addEventListener('DOMContentLoaded', async () => {
  const savedTheme = localStorage.getItem('keepup_tailwind_theme') || 'light';
  setTailwindTheme(savedTheme, false);

  // i18n: locale files resolve the initial language (URL > saved > browser
  // > geo hint > en); inline TRANSLATIONS remain as instant fallback.
  try {
    const initial = await window.I18N.resolveInitial();
    changeLanguage(initial || 'en');
  } catch {
    changeLanguage(localStorage.getItem('keepup_lang') || 'en');
  }

  // Fail closed: protected menu points hidden until the session resolves.
  document.querySelectorAll('[data-auth-item]').forEach(function (li) { li.style.display = 'none'; });
  renderModels(MODELS_DATA);
  renderFeaturedTiles(MODELS_DATA);
  const starterBadge = document.getElementById('model-count-badge');
  if (starterBadge) starterBadge.innerText = 'Loading catalog…';
  catalogFromUrl();
  try { localStorage.removeItem('keepup_models_cache_v2'); } catch (e) {} // obsolete pre-server-catalog cache
  fetchCatalogPage();
  renderSessionHeader();
  initCookieConsent();
  routeFromUrl();
});

// ==========================================
// Mobile Sidebar & Model Selector Quick Links
// ==========================================
function toggleMobileSidebar() {
  const sidebar = document.getElementById('mobile-sidebar');
  const backdrop = document.getElementById('mobile-drawer-backdrop');
  if (!sidebar || !backdrop) return;
  
  const isOpen = !sidebar.classList.contains('-translate-x-full');
  if (isOpen) {
    sidebar.classList.add('-translate-x-full');
    backdrop.classList.add('opacity-0', 'pointer-events-none');
    backdrop.classList.remove('opacity-100', 'pointer-events-auto');
  } else {
    sidebar.classList.remove('-translate-x-full');
    backdrop.classList.remove('opacity-0', 'pointer-events-none');
    backdrop.classList.add('opacity-100', 'pointer-events-auto');
  }
}

function selectModelAndGo(modelId) {
  const sel = document.getElementById('play-model-select');
  if (sel) {
    let opt = sel.querySelector('option[value="' + CSS.escape(modelId) + '"]');
    if (!opt) {
      opt = document.createElement('option');
      opt.value = modelId;
      opt.textContent = modelId;
      sel.appendChild(opt);
    }
    sel.value = modelId;
    delete sel.dataset.pendingDefault;
  }
  showSection('playground');
  const m = ACTIVE_MODELS_DATA.find(x => x.id === modelId);
  showToast(m && m.description ? m.name + ': ' + m.description.slice(0, 80) + '…' : 'Loaded ' + modelId + ' in Studio');
}


// ==========================================
// Smooth Sliding Pill Indicators for Top Nav & Sidebar
// ==========================================
let currentActiveSection = 'dashboard';

function updateSlidingIndicators(secId = currentActiveSection) {
  currentActiveSection = secId;

  // 1. Top Navbar Sliding Pill
  const topIndicator = document.getElementById('top-nav-indicator');
  const activeTop = document.getElementById('top-nav-' + secId);
  const topContainer = document.getElementById('top-nav-container');

  if (topIndicator && topContainer) {
    if (activeTop && activeTop.offsetParent !== null) {
      const leftOffset = activeTop.offsetLeft;
      const widthVal = activeTop.offsetWidth;
      topIndicator.style.transform = `translateX(${leftOffset}px)`;
      topIndicator.style.width = `${widthVal}px`;
      topIndicator.style.opacity = '1';
    } else {
      topIndicator.style.opacity = '0';
    }
  }

  // 2. Left Sidebar Sliding Pill
  const sideIndicator = document.getElementById('side-nav-indicator');
  const activeSide = document.getElementById('side-' + secId);
  const sideContainer = document.getElementById('sidebar-container');

  if (sideIndicator && sideContainer) {
    if (activeSide && activeSide.offsetParent !== null) {
      const topOffset = activeSide.offsetTop;
      const heightVal = activeSide.offsetHeight;
      sideIndicator.style.transform = `translateY(${topOffset}px)`;
      sideIndicator.style.height = `${heightVal}px`;
      sideIndicator.style.opacity = '1';
    } else {
      sideIndicator.style.opacity = '0';
    }
  }
}

window.addEventListener('resize', () => {
  updateSlidingIndicators();
});

// ==========================================
// Brand Logo Smart Click Handler
// If logged in -> Dashboard & API Keys, else -> Landing / Sign Up
// ==========================================
function handleBrandLogoClick() {
  KeepupAPI.getSession().then(function (s) {
  const isAuth = s.state === 'authenticated';
  if (isAuth) {
    showSection('dashboard');
    showToast('Welcome back! Switched to Cockpit & API Keys');
  } else {
    showSection('landing');
  }
  });
}

// ==========================================
// Solid UI Admin Surface Management
// ==========================================
const DEFAULT_MEMBERS = [
  { id: 1, name: 'Alexander Dev (You)', email: 'admin@keepupcoding.io', role: 'Owner', is2fa: true, joined: '2026-08-01' },
  { id: 2, name: 'Elena Rostova', email: 'elena@keepupcoding.io', role: 'Admin', is2fa: true, joined: '2026-08-10' },
  { id: 3, name: 'Marcus Vance', email: 'marcus@keepupcoding.io', role: 'Developer', is2fa: true, joined: '2026-08-15' },
  { id: 4, name: 'Devin Security Bot', email: 'bot-sec@keepupcoding.io', role: 'Auditor', is2fa: false, joined: '2026-08-20' }
];

const DEFAULT_AUDIT_LOGS = [
  { time: '10:42:15', actor: 'Alexander Dev', action: 'CREATE_API_KEY', target: 'sk-ku-prod-a8f1 (1,200 RPM)', ip: '192.168.1.104' },
  { time: '09:15:30', actor: 'Elena Rostova', action: 'TOPUP_WALLET', target: '+$50.00 USD (Stripe Instant)', ip: '10.0.4.22' },
  { time: '08:00:11', actor: 'SYSTEM_DAEMON', action: 'FAILOVER_SWITCH', target: 'Auto routed 429 upstream to Nemotron', ip: '127.0.0.1' },
  { time: 'Yesterday', actor: 'Marcus Vance', action: 'REVOKE_KEY', target: 'sk-ku-dev-11b0', ip: '172.16.0.8' }
];

function getStoredMembers() {
  const data = localStorage.getItem('keepup_admin_members');
  return data ? JSON.parse(data) : DEFAULT_MEMBERS;
}

function setStoredMembers(m) {
  localStorage.setItem('keepup_admin_members', JSON.stringify(m));
}

function getStoredAuditLogs() {
  const data = localStorage.getItem('keepup_audit_logs');
  return data ? JSON.parse(data) : DEFAULT_AUDIT_LOGS;
}

function switchAdminTab(tabName) {
  const tabs = ['overview', 'guardrails', 'budget', 'onboarding', 'users', 'security', 'audit', 'org', 'payments', 'llmproviders'];
  tabs.forEach(t => {
    const view = document.getElementById('adm-view-' + t);
    const btn = document.getElementById('adm-tab-' + t);
    if (view) view.classList.add('hidden');
    if (btn) {
      btn.className = 'admin-tab-btn px-4 py-2 rounded-xl text-slate-600 hover:text-slate-900 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-2';
    }
  });

  const activeView = document.getElementById('adm-view-' + tabName);
  const activeBtn = document.getElementById('adm-tab-' + tabName);
  if (activeView) activeView.classList.remove('hidden');
  if (activeBtn) {
    activeBtn.className = 'admin-tab-btn px-4 py-2 rounded-xl text-fuchsia-600 bg-fuchsia-50 dark:bg-fuchsia-950/40 font-extrabold flex items-center gap-2';
  }

  if (tabName === 'users') renderAdminMembers();
  if (tabName === 'audit') renderAdminAuditLogs();
  if (tabName === 'payments') renderAdminPayments();
  if (tabName === 'llmproviders') renderAdminLlmProviders();
}

// ===========================================================================
// Super-admin: LLM Providers screen — wholesale API key -> routed models.
// Secrets are write-only (server returns configured/not); sync discovers
// models into Needs-review; pricing approval happens in Engine & Pricing.
// ===========================================================================
async function renderAdminLlmProviders() {
  const API = window.KeepupAPI.AdminProviders;
  const esc = window.KeepupAPI.escapeHtml;
  const host = document.getElementById('admin-llm-providers');
  if (!host) return;
  loadPriceApprovals();

  try {
    const data = await API.list();
    const list = data.providers || [];
    if (list.length === 0) {
      host.innerHTML = '<div class="p-6 rounded-xl border border-dashed border-slate-300 dark:border-slate-600 text-sm text-slate-500">No wholesale providers yet. Add one above — paste the API base URL and key; models appear after the first sync.</div>';
      return;
    }

    host.innerHTML = list.map(p => {
      const testBadge = p.lastTestOk === null
        ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300">Never tested</span>'
        : p.lastTestOk
          ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">Tested OK</span>'
          : `<span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300" title="${esc(p.lastTestError || '')}">Test failed</span>`;
      const statusBadge = p.enabled
        ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">Enabled</span>'
        : '<span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300">Disabled</span>';
      const lastTest = p.lastTestAt ? new Date(p.lastTestAt).toLocaleString() : '—';
      const lastSync = p.lastSyncAt ? new Date(p.lastSyncAt).toLocaleString() : '—';
      return `
      <div class="soft-card p-5 space-y-3" id="llmprov-${esc(p.id)}">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div class="flex items-center gap-2 flex-wrap">
              <h4 class="font-black text-slate-900 dark:text-white">${esc(p.name)}</h4>
              <code class="text-[10px] text-slate-500">${esc(p.slug)}/</code>
              ${statusBadge}${testBadge}
            </div>
            <div class="text-[11px] text-slate-500 mt-1">
              ${esc(p.baseUrl)} · Key: <b>${p.apiKeyConfigured ? 'Configured' : 'Not set'}</b> ·
              Routes: <b>${p.routeCount}</b> · Last tested: ${esc(lastTest)} · Last synced: ${esc(lastSync)}
            </div>
            ${p.lastTestOk === false && p.lastTestError ? `<div class="text-[11px] text-red-600 dark:text-red-400 mt-1">${esc(p.lastTestError)}</div>` : ''}
          </div>
          <div class="flex flex-wrap gap-2">
            <button onclick="testLlmProvider('${esc(p.id)}')" class="px-3 py-2 rounded-xl text-[11px] font-extrabold border border-slate-300 dark:border-slate-600 cursor-pointer"><i class="fa-solid fa-vial"></i> Test</button>
            <button onclick="syncLlmProvider('${esc(p.id)}')" class="px-3 py-2 rounded-xl text-[11px] font-extrabold border border-slate-300 dark:border-slate-600 cursor-pointer"><i class="fa-solid fa-cloud-arrow-down"></i> Sync models</button>
            <button onclick="toggleLlmProvider('${esc(p.id)}', ${!p.enabled})" class="px-3 py-2 rounded-xl text-[11px] font-extrabold border ${p.enabled ? 'border-amber-300 text-amber-700' : 'border-emerald-300 text-emerald-700'} cursor-pointer">${p.enabled ? 'Disable' : 'Enable'}</button>
            <button onclick="deleteLlmProvider('${esc(p.id)}')" class="px-3 py-2 rounded-xl text-[11px] font-extrabold border border-red-200 text-red-600 cursor-pointer"><i class="fa-solid fa-trash"></i></button>
          </div>
        </div>
      </div>`;
    }).join('');
  } catch (err) {
    host.innerHTML = `<div class="p-4 rounded-xl border border-red-200 bg-red-50 text-xs font-bold text-red-700">Could not load providers: ${esc(err.message || 'error')}</div>`;
  }
}

function llmProvMsg(text, isError) {
  const el = document.getElementById('llmprov-form-msg');
  if (el) {
    el.textContent = text;
    el.className = 'text-xs font-bold ' + (isError ? 'text-red-600' : 'text-emerald-600');
  }
}

async function createLlmProvider() {
  const name = document.getElementById('llmprov-name').value.trim();
  const baseUrl = document.getElementById('llmprov-url').value.trim();
  const apiKey = document.getElementById('llmprov-key').value.trim();
  const enabled = document.getElementById('llmprov-enabled').checked;
  if (!name || !baseUrl) { llmProvMsg('Name and base URL are required.', true); return; }
  llmProvMsg('Adding…', false);
  try {
    await window.KeepupAPI.AdminProviders.create({ name, baseUrl, apiKey: apiKey || undefined, enabled });
    document.getElementById('llmprov-key').value = '';
    llmProvMsg('Added. Run a sync to discover models.', false);
    renderAdminLlmProviders();
  } catch (err) {
    llmProvMsg(err.message || 'Failed to add provider.', true);
  }
}

async function testLlmProvider(id) {
  llmProvMsg('Testing connectivity…', false);
  try {
    const r = await window.KeepupAPI.AdminProviders.test(id);
    llmProvMsg(r.ok ? `Connectivity OK — ${r.modelsSeen} models reachable.` : `Test failed: ${r.error || 'unknown error'}`, !r.ok);
    renderAdminLlmProviders();
  } catch (err) { llmProvMsg(err.message || 'Test failed.', true); }
}

async function syncLlmProvider(id) {
  llmProvMsg('Syncing models…', false);
  try {
    const r = await window.KeepupAPI.AdminProviders.sync(id);
    llmProvMsg(`Synced: ${r.modelsSeen} upstream models · ${r.routesCreated} new routes · ${r.modelsPendingReview} need review.`, false);
    renderAdminLlmProviders();
  } catch (err) { llmProvMsg(err.message || 'Sync failed.', true); }
}

async function toggleLlmProvider(id, enabled) {
  try {
    await window.KeepupAPI.AdminProviders.update(id, { enabled });
    renderAdminLlmProviders();
  } catch (err) { llmProvMsg(err.message || 'Update failed.', true); }
}

async function deleteLlmProvider(id) {
  if (!confirm('Delete this provider? Its model routes are removed from the gateway too.')) return;
  try {
    await window.KeepupAPI.AdminProviders.remove(id);
    renderAdminLlmProviders();
  } catch (err) { llmProvMsg(err.message || 'Delete failed.', true); }
}

async function reconcileLlmRoutes(manual) {
  if (manual) llmProvMsg('Reconciling routes…', false);
  try {
    const r = await window.KeepupAPI.AdminProviders.reconcile();
    if (manual) llmProvMsg(`Gateway routes re-synced: ${r.registered} registered, ${r.removed} removed${r.errors && r.errors.length ? ', ' + r.errors.length + ' errors' : ''}.`, false);
  } catch (err) { if (manual) llmProvMsg(err.message || 'Reconcile failed.', true); }
}

// ===========================================================================
// Super-admin: Payment Providers screen (secrets NEVER displayed — server
// returns readiness booleans only; all mutations audited server-side).
// ===========================================================================
const PROVIDER_STATUS_STYLES = {
  disabled: { cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400', label: 'Disabled', hint: 'Hidden from all customers.' },
  configured: { cls: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300', label: 'Configured', hint: 'Credentials present; test-mode verification pending.' },
  test_verified: { cls: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300', label: 'Test verified', hint: 'Verified in test mode. Safe for sandbox customers only.' },
  live_enabled: { cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300', label: 'Live', hint: 'Accepting real payments.' },
};

/**
 * Price approvals: models in pending_review (routed but unpriced). Admin
 * enters the provider cost; the server derives sell = cost × markup inside
 * the profitability guard — the UI never sets the sell price directly.
 */
async function loadPriceApprovals() {
  const API = window.KeepupAPI.AdminCatalog;
  const esc = window.KeepupAPI.escapeHtml;
  const list = document.getElementById('price-approval-list');
  const countBadge = document.getElementById('price-approval-count');
  if (!list) return;
  try {
    const data = await API.models();
    const pending = (data.models || []).filter(m => m.status === 'pending_review');
    if (countBadge) countBadge.innerText = `${pending.length} awaiting price`;
    if (pending.length === 0) {
      list.innerHTML = '<div class="text-[11px] text-emerald-600 font-bold"><i class="fa-solid fa-circle-check"></i> Every routed model has a verified price — nothing awaiting approval.</div>';
      return;
    }
    list.innerHTML = pending.slice(0, 25).map(m => `
      <div class="p-3 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/10 flex flex-col md:flex-row md:items-center gap-2">
        <div class="min-w-0 flex-1">
          <div class="text-xs font-extrabold text-slate-900 dark:text-white truncate" title="${esc(m.id)}">${esc(m.display_name || m.id)}</div>
          <code class="text-[10px] text-slate-500">${esc(m.id)}</code>
        </div>
        <div class="flex items-center gap-1.5">
          <input id="pa-cost-in-${esc(m.id)}" type="number" step="0.000001" min="0" placeholder="cost in $/1M" class="w-28 px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-[11px] font-mono" />
          <input id="pa-cost-out-${esc(m.id)}" type="number" step="0.000001" min="0" placeholder="cost out $/1M" class="w-28 px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-[11px] font-mono" />
          <button onclick="approveModelPrice('${esc(m.id)}')" class="px-3 py-1.5 rounded-lg text-[11px] font-extrabold btn-soft-success cursor-pointer whitespace-nowrap"><i class="fa-solid fa-check"></i> Approve</button>
        </div>
      </div>`).join('') + (pending.length > 25 ? `<div class="text-[11px] text-slate-400">…and ${pending.length - 25} more — use catalog sync to import provider prices in bulk.</div>` : '');
  } catch (e) {
    list.innerHTML = '<div class="text-[11px] text-red-600 font-bold">Failed to load pending models.</div>';
  }
}

async function approveModelPrice(modelId) {
  const API = window.KeepupAPI.AdminCatalog;
  const cin = parseFloat(document.getElementById('pa-cost-in-' + modelId)?.value);
  const cout = parseFloat(document.getElementById('pa-cost-out-' + modelId)?.value);
  if (!(cin >= 0) || !(cout >= 0) || isNaN(cin) || isNaN(cout)) { showToast('Enter both cost prices ($ per 1M tokens) first'); return; }
  try {
    // Micros per million = dollars × 1e6 (the platform's integer money unit).
    await API.updateModel(modelId, {
      costInputMicrosPerMillion: Math.round(cin * 1e6),
      costOutputMicrosPerMillion: Math.round(cout * 1e6),
      status: 'active',
    });
    showToast(`${modelId.split('/').pop()} approved — sell price derived from cost + markup`);
    loadPriceApprovals();
  } catch (e) {
    showToast(e && e.message ? e.message : 'Approval failed (is the sell price below cost?)');
  }
}

async function renderAdminPayments() {
  const APIp = window.KeepupAPI.AdminPayments;
  const esc = window.KeepupAPI.escapeHtml;

  try {
    const [overview, diag, entities, txs] = await Promise.all([
      APIp.overview(), APIp.diagnostics(), APIp.legalEntities(), APIp.transactions(),
    ]);

    // --- Diagnostics cards (boolean readiness — no values) ---
    const d = diag;
    const card = (label, value, warn) => `
      <div class="p-3 rounded-xl border ${warn ? 'border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20' : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40'}">
        <div class="text-[10px] font-bold text-slate-500 uppercase tracking-wide">${esc(label)}</div>
        <div class="text-lg font-black ${warn ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white'}">${esc(value)}</div>
      </div>`;
    document.getElementById('admin-payments-diagnostics').innerHTML =
      card('Webhook failures', d.webhook_failures, d.webhook_failures > 0) +
      card('Stalled >15 min', d.webhooks_stalled_15m, d.webhooks_stalled_15m > 0) +
      card('Manual review', d.payments_manual_review, d.payments_manual_review > 0) +
      card('Open disputes', d.open_disputes, d.open_disputes > 0) +
      `
      <div class="col-span-2 lg:col-span-4 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40">
        <div class="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2">Environment readiness (values never shown)</div>
        <div class="flex flex-wrap gap-2 text-[10px] font-bold">${
          Object.entries(d.env_readiness).map(([k, v]) =>
            `<span class="px-2 py-1 rounded-lg ${v ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}">
               ${v ? '✔' : '✖'} ${esc(k.replace(/_/g, ' '))}</span>`).join('')
        }</div>
        ${d.active_legal_entity
          ? `<div class="mt-2 text-[11px] text-slate-500">Active seller: <b class="text-slate-800 dark:text-white">${esc(d.active_legal_entity.legal_name)}</b></div>`
          : `<div class="mt-2 text-[11px] font-bold text-amber-600">No active legal entity — payment methods stay hidden until one is activated.</div>`}
      </div>`;

    // --- Provider cards ---
    const providersHtml = (overview.providers || []).map(p => {
      const st = PROVIDER_STATUS_STYLES[p.status] || PROVIDER_STATUS_STYLES.disabled;
      const methods = (p.enabled_method_count ?? 0) + '/' + (p.method_count ?? 0) + ' methods enabled';
      const binding = (p.entity_bindings && p.entity_bindings.length)
        ? `Bound to ${p.entity_bindings.length} legal entity` : 'No legal-entity binding';
      return `
      <div class="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/40">
        <div class="flex items-start justify-between gap-3">
          <div>
            <div class="flex items-center gap-2">
              <span class="font-black text-sm text-slate-900 dark:text-white">${esc(p.display_name)}</span>
              <span class="px-2 py-0.5 rounded-lg text-[10px] font-black ${st.cls}">${st.label}</span>
              ${p.adapter_implemented ? '' : '<span class="px-2 py-0.5 rounded-lg text-[10px] font-black bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300">no adapter</span>'}
            </div>
            <div class="text-[11px] text-slate-500 mt-1">${esc(methods)} · ${esc(binding)} · currencies: ${esc((p.supported_currencies || []).join(', ') || 'any')}</div>
            <div class="text-[10px] text-slate-400 mt-0.5">${st.hint}${p.feature_flag ? ' · feature flag: <code class="font-mono">' + esc(p.feature_flag) + '</code>' : ''}</div>
          </div>
          <div class="flex flex-col items-end gap-1.5">
            <select onchange="adminSetProviderStatus('${esc(p.provider_key)}', this.value)"
              class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-[11px] font-bold cursor-pointer">
              ${Object.entries(PROVIDER_STATUS_STYLES).map(([k, v]) =>
                `<option value="${k}" ${k === p.status ? 'selected' : ''}>${v.label}</option>`).join('')}
            </select>
            ${(!p.entity_bindings || !p.entity_bindings.length)
              ? `<button onclick="adminBindProvider('${esc(p.provider_key)}')" class="text-[11px] font-bold text-fuchsia-600 hover:text-fuchsia-500 cursor-pointer">Bind to active entity</button>` : ''}
            <button onclick="adminToggleMethods('${esc(p.provider_key)}')" class="text-[11px] font-bold text-fuchsia-600 hover:text-fuchsia-500 cursor-pointer">
              Manage methods</button>
          </div>
        </div>
        <div id="admin-methods-${esc(p.provider_key)}" class="hidden mt-3 pt-3 border-t border-slate-100 dark:border-slate-700"></div>
      </div>`;
    }).join('');
    document.getElementById('admin-payments-providers').innerHTML = providersHtml;

    // --- Legal entities ---
    const entHtml = (entities.legalEntities || []).map(e => `
      <div class="p-4 rounded-xl border ${e.status === 'active' ? 'border-emerald-300 dark:border-emerald-800' : 'border-slate-200 dark:border-slate-700'} bg-white dark:bg-slate-800/40">
        <div class="flex items-start justify-between gap-3">
          <div>
            <div class="flex items-center gap-2">
              <span class="font-black text-sm text-slate-900 dark:text-white">${esc(e.legal_name)}</span>
              ${e.status === 'active'
                ? '<span class="px-2 py-0.5 rounded-lg text-[10px] font-black bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">Active seller</span>'
                : '<span class="px-2 py-0.5 rounded-lg text-[10px] font-black bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">Inactive</span>'}
            </div>
            <div class="text-[11px] text-slate-500 mt-1">${esc(e.registered_address)} · ${esc(e.country_code)}${e.vat_id ? ' · VAT ' + esc(e.vat_id) : ''}${e.registration_number ? ' · Reg ' + esc(e.registration_number) : ''}</div>
            <div class="text-[10px] text-slate-400 mt-0.5">Currency ${esc(e.default_currency)} · prefixes ${esc(e.invoice_prefix)} / ${esc(e.receipt_prefix)}</div>
          </div>
          ${e.status !== 'active'
            ? `<button onclick="adminActivateEntity('${e.id}')" class="btn-soft-primary px-3 py-1.5 rounded-xl text-[11px] font-extrabold shadow-soft-primary cursor-pointer">Activate</button>` : ''}
        </div>
      </div>`).join('');
    document.getElementById('admin-payments-entities').innerHTML =
      entHtml || '<div class="p-4 rounded-xl border border-dashed border-slate-300 dark:border-slate-600 text-xs text-slate-500">No legal entities yet. Create one via the API (POST /internal-admin/payments/legal-entities) — see docs/INVOICING.md.</div>';

    // --- Recent transactions + refund action ---
    const TX_STYLES = {
      succeeded: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
      refunded: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
      disputed: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
      manual_review: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
    };
    const txHtml = (txs.transactions || []).map(t => {
      const amount = '$' + (Number(t.amount_micros) / 1e6).toFixed(2);
      const refundable = t.status === 'succeeded';
      const when = new Date(t.created_at).toISOString().slice(0, 16).replace('T', ' ');
      return `
      <div class="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/40 flex items-center justify-between gap-3">
        <div class="min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="font-mono font-black text-xs text-slate-900 dark:text-white">${esc(amount)}</span>
            <span class="px-2 py-0.5 rounded-lg text-[10px] font-black ${TX_STYLES[t.status] || TX_STYLES.manual_review}">${esc(t.status)}</span>
            ${t.has_credit_note ? '<span class="px-2 py-0.5 rounded-lg text-[10px] font-black bg-fuchsia-50 text-fuchsia-700 dark:bg-fuchsia-950/40 dark:text-fuchsia-300">credit note issued</span>' : ''}
          </div>
          <div class="text-[11px] text-slate-500 mt-0.5 truncate">${esc(t.org_name)} · ${esc(t.provider)}${t.provider_ref ? ' · ' + esc(t.provider_ref) : ''} · ${esc(when)} UTC</div>
        </div>
        ${refundable
          ? `<button onclick="openRefundDialog('${t.id}', ${Number(t.amount_micros)}, '${esc(t.org_name)}')" class="shrink-0 px-3 py-1.5 rounded-xl text-[11px] font-extrabold border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:hover:bg-red-950/30 cursor-pointer">Refund…</button>`
          : ''}
      </div>`;
    }).join('');
    document.getElementById('admin-payments-transactions').innerHTML =
      txHtml || '<div class="p-4 rounded-xl border border-dashed border-slate-300 dark:border-slate-600 text-xs text-slate-500">No succeeded payments yet.</div>';

  } catch (err) {
    if (window.showToast) showToast(err.message || 'Failed to load payment providers');
  }
}

// --- Refund dialog (admin console → payments tab) ---
let refundCtx = null;
function openRefundDialog(txId, amountMicros, orgName) {
  refundCtx = { txId, amountMicros };
  const dialog = document.getElementById('refund-dialog');
  const amount = (amountMicros / 1e6).toFixed(2);
  document.getElementById('refund-tx-label').textContent = `${amount} — ${orgName}`;
  const amountInput = document.getElementById('refund-amount');
  amountInput.value = amount;
  amountInput.max = amount;
  document.getElementById('refund-reason').value = '';
  dialog.showModal();
}

function refundSetFull() {
  if (refundCtx) document.getElementById('refund-amount').value = (refundCtx.amountMicros / 1e6).toFixed(2);
}

async function submitRefund() {
  if (!refundCtx) return;
  const reason = document.getElementById('refund-reason').value.trim();
  if (reason.length < 3) { if (window.showToast) showToast('A reason (min 3 chars) is required — it is audited.'); return; }
  const amountUsd = parseFloat(document.getElementById('refund-amount').value);
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) { if (window.showToast) showToast('Refund amount must be positive.'); return; }
  const full = amountUsd.toFixed(2) === (refundCtx.amountMicros / 1e6).toFixed(2);
  // Confirmation — this moves real money out of the customer wallet.
  const ok = window.confirm(`Refund $${amountUsd.toFixed(2)} (${full ? 'FULL' : 'PARTIAL'})?\n\nThis debits the org wallet, issues a credit note, and exports to ERP. It is audited and idempotent (a repeat refund is refused).`);
  if (!ok) return;
  try {
    const body = full ? { reason } : { reason, amountUsd };
    const r = await window.KeepupAPI.AdminPayments.refund(refundCtx.txId, body);
    document.getElementById('refund-dialog').close();
    const msg = r.status === 'already_refunded' || r.status === 'already_applied'
      ? 'Refund was already applied — no double debit.'
      : `Refunded $${(r.refundMicros / 1e6).toFixed(2)} — credit note ${r.creditNoteId ? 'issued' : 'pending'}.`;
    if (window.showToast) showToast(msg);
    renderAdminPayments();
  } catch (err) {
    if (window.showToast) showToast(err.message || 'Refund failed');
  }
}

async function adminSetProviderStatus(providerKey, status) {
  try {
    await window.KeepupAPI.AdminPayments.updateProvider(providerKey, { status });
    if (window.showToast) showToast(providerKey + ' → ' + status);
    renderAdminPayments();
  } catch (err) {
    if (window.showToast) showToast(err.message || 'Update failed');
    renderAdminPayments(); // revert select to server truth
  }
}

async function adminBindProvider(providerKey) {
  try {
    const { legalEntities } = await window.KeepupAPI.AdminPayments.legalEntities();
    const active = (legalEntities || []).find(e => e.status === 'active');
    if (!active) { if (window.showToast) showToast('No active legal entity — create and activate one first'); return; }
    await window.KeepupAPI.AdminPayments.bindProviderToEntity(active.id, providerKey);
    if (window.showToast) showToast(providerKey + ' bound to ' + active.legal_name);
    renderAdminPayments();
  } catch (err) {
    if (window.showToast) showToast(err.message || 'Bind failed');
  }
}

async function adminToggleMethods(providerKey) {
  const panel = document.getElementById('admin-methods-' + providerKey);
  if (!panel) return;
  if (!panel.classList.contains('hidden')) { panel.classList.add('hidden'); return; }
  panel.classList.remove('hidden');
  panel.innerHTML = '<div class="text-[11px] text-slate-400 animate-pulse">Loading methods…</div>';
  try {
    const { methods } = await window.KeepupAPI.AdminPayments.methods(providerKey);
    const esc = window.KeepupAPI.escapeHtml;
    panel.innerHTML = methods.length ? methods.map(m => `
      <label class="flex items-center justify-between py-1.5 text-[11px] font-bold cursor-pointer">
        <span class="flex items-center gap-2 text-slate-700 dark:text-slate-200">
          <input type="checkbox" ${m.enabled ? 'checked' : ''} onchange="adminSetMethod('${esc(providerKey)}','${esc(m.method_key)}', this.checked)"
            class="h-3.5 w-3.5 accent-fuchsia-600 rounded" />
          ${esc(m.display_name)} <span class="text-slate-400 font-normal">(${esc(m.type)})</span>
        </span>
        <span class="text-slate-400 font-normal">${esc((m.supported_currencies || []).join(', ') || 'any currency')}</span>
      </label>`).join('')
      : '<div class="text-[11px] text-slate-400">No methods registered for this provider.</div>';
  } catch (err) {
    panel.innerHTML = '<div class="text-[11px] text-red-500">' + esc(err.message || 'Failed to load methods') + '</div>';
  }
}

async function adminSetMethod(providerKey, methodKey, enabled) {
  try {
    await window.KeepupAPI.AdminPayments.updateMethod(providerKey, methodKey, { enabled });
    if (window.showToast) showToast(methodKey + (enabled ? ' enabled' : ' disabled'));
    renderAdminPayments();
  } catch (err) {
    if (window.showToast) showToast(err.message || 'Update failed');
    renderAdminPayments();
  }
}

async function adminActivateEntity(entityId) {
  try {
    await window.KeepupAPI.AdminPayments.activateLegalEntity(entityId);
    if (window.showToast) showToast('Legal entity activated — new payments will bind to it');
    renderAdminPayments();
  } catch (err) {
    if (window.showToast) showToast(err.message || 'Activation failed');
  }
}

async function testPiiMasking() {
  const inputEl = document.getElementById('pii-test-input');
  const outputEl = document.getElementById('pii-test-output');
  if (!inputEl || !outputEl) return;
  try {
    const res = await KeepupAPI.App.previewGuardrails(inputEl.value);
    outputEl.innerText = res.masked;
    showToast('PII entities redacted by the server-side policy engine');
  } catch (err) {
    outputEl.innerText = 'Preview unavailable: ' + (err.message || 'owner/admin permissions required');
  }
}

const testPiiMaskingPrimary = testPiiMasking;

async function addGuardrailKeyword() {
  const pattern = prompt('Enter a regex pattern or keyword phrase to block/mask:', 'exec\\(.*\\)');
  if (!pattern) return;
  const label = prompt('Rule name:', 'custom-rule');
  if (!label) return;
  const action = confirm('OK = block the request, Cancel = mask the match') ? 'block' : 'mask';
  try {
    await KeepupAPI.App.saveGuardrailRule({ label, pattern, action, appliesTo: 'input' });
    showToast('Guardrail pattern saved. It applies to new requests.');
    renderGuardrailRules();
  } catch (err) {
    showToast(err.message || 'Could not add the rule.');
  }
}

async function renderGuardrailRules() {
  const tbody = document.getElementById('guardrails-rules-table');
  if (!tbody) return;
  try {
    const data = await KeepupAPI.App.guardrails();
    tbody.innerHTML = (data.rules || []).map(r => `
      <tr>
        <td class="py-2 text-fuchsia-600 font-mono text-xs">${KeepupAPI.escapeHtml(r.label)}</td>
        <td class="py-2 font-mono text-xs">${KeepupAPI.escapeHtml(r.pattern)}</td>
        <td><span class="font-bold text-xs ${r.action === 'block' ? 'text-red-500' : 'text-amber-500'}">${String(r.action).toUpperCase()}</span></td>
        <td class="text-right"><button onclick="removeGuardrailRule('${r.id}')" class="text-slate-400 hover:text-red-500 text-xs">Remove</button></td>
      </tr>`).join('') || '<tr><td colspan="4" class="py-3 text-center text-xs text-slate-400">No custom rules configured.</td></tr>';
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="4" class="py-3 text-center text-xs text-slate-400">Rules are managed by owners and admins.</td></tr>';
  }
}

async function removeGuardrailRule(id) {
  try {
    await KeepupAPI.App.deleteGuardrailRule(id);
    showToast('Rule removed.');
    renderGuardrailRules();
  } catch (err) {
    showToast(err.message || 'Could not remove the rule.');
  }
}

async function saveGuardrailsConfig() {
  const pii = document.getElementById('guardrail-pii-toggle');
  const deny = document.getElementById('guardrail-denylist-toggle');
  try {
    await KeepupAPI.App.saveGuardrails({
      piiMasking: pii ? pii.checked : undefined,
      denylistEnabled: deny ? deny.checked : undefined,
    });
    showToast('AI Guardrails & Content Safety Policies Saved!');
  } catch (err) {
    showToast(err.message || 'Could not save the safety policy.');
  }
}


function updateBudgetSlider(type, val) {
  if (type === 'monthly') {
    const label = document.getElementById('val-monthly-cap');
    const badge = document.getElementById('budget-cap-badge');
    if (label) label.innerText = '$' + parseFloat(val).toFixed(2);
    if (badge) badge.innerText = 'Cap: $' + parseFloat(val).toFixed(2);

    const curSpend = parseFloat((document.getElementById('budget-current-spend') || {}).innerText || '0'.replace('$','')) || 0;
    const pct = Math.min((curSpend / val) * 100, 100).toFixed(1);
    const pbar = document.getElementById('budget-progress-bar');
    if (pbar) pbar.style.width = pct + '%';
  } else if (type === 'daily') {
    const label = document.getElementById('val-daily-cap');
    if (label) label.innerText = '$' + parseFloat(val).toFixed(2);
  } else if (type === 'pct') {
    const label = document.getElementById('val-alert-pct');
    if (label) label.innerText = val + '%';
  }
}

async function saveBudgetCaps() {
  const m = document.getElementById('param-monthly-cap').value;
  const d = document.getElementById('param-daily-cap').value;
  const a = document.getElementById('param-alert-pct').value;
  try {
    await KeepupAPI.App.saveBudgets({
      monthlyCapUsd: m ? parseFloat(m) : null,
      dailySoftCapUsd: d ? parseFloat(d) : null,
      alertThresholdPercent: a ? parseInt(a, 10) : undefined,
    });
    showToast('Budget caps saved. New limits apply to upcoming requests.');
  } catch (err) {
    showToast(err.message || 'Could not save budget caps. Owners and admins can change budgets.');
  }
}

const ROLE_LABELS = { org_owner: 'Owner', org_admin: 'Admin', developer: 'Developer', billing_manager: 'Billing', viewer: 'Viewer', platform_super_admin: 'Platform Admin' };

async function renderAdminMembers() {
  const tbody = document.getElementById('admin-members-table-body');
  if (!tbody) return;
  let members = [];
  try {
    members = (await KeepupAPI.App.members()).members || [];
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="5" class="py-6 text-center text-xs text-slate-400">Team management is available to owners and admins.</td></tr>';
    return;
  }
  tbody.innerHTML = members.map(m => {
    const label = ROLE_LABELS[m.role] || m.role;
    const isOwner = m.role === 'org_owner';
    return `
    <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
      <td class="py-3 flex items-center gap-2.5">
        <div class="h-8 w-8 rounded-full bg-gradient-primary text-white flex items-center justify-center font-bold text-xs shadow-sm">
          ${(m.name || '?').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
        </div>
        <div>
          <div class="font-bold text-slate-800 dark:text-white text-xs">${KeepupAPI.escapeHtml(m.name || m.email)}</div>
          <div class="text-[10px] text-slate-400 font-mono">${KeepupAPI.escapeHtml(m.email)}</div>
        </div>
      </td>
      <td class="py-3 font-semibold">
        <span class="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold ${isOwner ? 'bg-fuchsia-100 text-fuchsia-700' : (m.role === 'org_admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700')}">${label}</span>
      </td>
      <td class="py-3">
        <span class="px-2 py-0.5 rounded-full text-[9px] font-extrabold ${m.is_email_verified ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}">${m.is_email_verified ? 'VERIFIED' : 'INVITED'}</span>
      </td>
      <td class="py-3 text-slate-400 font-mono text-[11px]">${m.joined_at ? new Date(m.joined_at).toLocaleDateString() : '—'}</td>
      <td class="py-3 text-right">
        ${!isOwner ? `<button onclick="removeMember('${m.id}')" class="px-2.5 py-1 rounded-lg text-xs font-bold text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors cursor-pointer">Remove</button>` : '<span class="text-slate-400 text-xs font-bold">Owner</span>'}
      </td>
    </tr>`;
  }).join('');
}

async function renderAdminAuditLogs() {
  const tbody = document.getElementById('admin-audit-table-body');
  if (!tbody) return;
  let logs = [];
  try {
    logs = (await KeepupAPI.App.auditLogs(50)).events || [];
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="5" class="py-6 text-center text-xs text-slate-400">Audit history is available to owners and admins.</td></tr>';
    return;
  }
  tbody.innerHTML = logs.map(l => `
    <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
      <td class="py-2.5 text-slate-400">${l.created_at ? new Date(l.created_at).toLocaleString() : '—'}</td>
      <td class="py-2.5 font-bold font-sans text-slate-700 dark:text-slate-200">${KeepupAPI.escapeHtml(l.actor_name || 'System')}</td>
      <td class="py-2.5 text-fuchsia-600 font-bold">${KeepupAPI.escapeHtml(l.action)}</td>
      <td class="py-2.5 text-slate-600 dark:text-slate-300 font-sans">${KeepupAPI.escapeHtml(l.resource_type || '')}</td>
      <td class="py-2.5 text-slate-400 font-mono text-[10px]">${KeepupAPI.escapeHtml(l.ip_address || '—')}</td>
    </tr>`).join('') || '<tr><td colspan="5" class="py-6 text-center text-xs text-slate-400">No audit events yet.</td></tr>';
}

function openAddMemberModal() {
  const m = document.getElementById('add-member-modal');
  if (m) m.showModal();
}

function closeAddMemberModal() {
  const m = document.getElementById('add-member-modal');
  if (m) m.close();
}

async function submitAddMember() {
  const name = document.getElementById('new-member-name').value.trim();
  const email = document.getElementById('new-member-email').value.trim();
  const role = document.getElementById('new-member-role').value;
  if (!email) {
    showToast('Please enter the member\'s work email.');
    return;
  }
  try {
    await KeepupAPI.App.inviteMember({ email, role });
    closeAddMemberModal();
    showToast('Invitation sent to ' + email);
    renderAdminMembers();
  } catch (err) {
    showToast(err.message || 'Could not send the invitation.');
  }
}

async function removeMember(id) {
  if (!confirm('Remove this member from the organization? Their API keys stop working immediately.')) return;
  try {
    await KeepupAPI.App.removeMember(id);
    showToast('Member removed');
    renderAdminMembers();
  } catch (err) {
    showToast(err.message || 'Could not remove the member.');
  }
}

function saveSecuritySettings() {
  showToast('IP allowlist settings are applied by your platform operator. Contact support for changes.');
}

async function saveOrgSettings() {
  const name = document.getElementById('acc-org-name').value;
  const email = document.getElementById('acc-org-email').value;
  try {
    await KeepupAPI.App.updateOrgSettings({ name, billingEmail: email });
    showToast('Organization profile saved!');
  } catch (err) {
    showToast(err.message || 'Could not save organization settings.');
  }
}

async function exportAuditLog() {
  try {
    const data = await KeepupAPI.App.auditLogs(200);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `keepup-audit-log-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Audit log JSON exported!');
  } catch (err) {
    showToast(err.message || 'Export requires owner or admin permissions.');
  }
}


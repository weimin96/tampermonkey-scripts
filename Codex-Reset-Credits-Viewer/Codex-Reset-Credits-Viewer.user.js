// ==UserScript==
// @name         ChatGPT Codex Reset Credits Viewer
// @name:zh-CN   ChatGPT Codex 重置额度查看器
// @namespace    https://github.com/weimin96/Codex-Reset-Credits-Viewer
// @version      0.1.3
// @description  View Codex reset credits, expiration time, and usage reset time on chatgpt.com
// @description:zh-CN 在 chatgpt.com 查看 Codex reset credits、过期时间和使用额度重置时间
// @match        https://chatgpt.com/*
// @license      MIT
// @homepageURL  https://github.com/weimin96/Codex-Reset-Credits-Viewer
// @supportURL   https://github.com/weimin96/Codex-Reset-Credits-Viewer/issues
// @downloadURL  https://update.greasyfork.org/scripts/584519/ChatGPT%20Codex%20Reset%20Credits%20Viewer.user.js
// @updateURL    https://update.greasyfork.org/scripts/584519/ChatGPT%20Codex%20Reset%20Credits%20Viewer.meta.js
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const API_BASE = 'https://chatgpt.com/backend-api';
  const LANGUAGE_STORAGE_KEY = 'codex-reset-credits-viewer-language';

  const messages = {
    en: {
      button: 'Codex Credits',
      title: 'Codex Reset Credits',
      refresh: 'Refresh',
      close: 'Close',
      languageSelect: 'Language',
      languageAuto: 'Auto',
      languageEnglish: 'English',
      languageChinese: '中文',
      ready: 'Ready to query.',
      loading: 'Querying Codex credits...',
      noCreditDetails: 'No reset credit details were found.',
      remaining: (value) => `${value} remaining`,
      creditId: 'Credit ID',
      remainingCredits: 'Remaining Reset Credits',
      availableResets: 'Currently available resets',
      nearestExpiry: 'Nearest Credit Expiration',
      nextReset: 'Next Usage Reset',
      resetDetails: 'Reset Credits Details',
      status: 'Status',
      expiresAt: 'Expiration',
      noResetTime: 'Reset time was not found',
      noExpiryTime: 'Expiration time was not found',
      footer: 'Data comes from ChatGPT internal APIs for the current signed-in account. This script only reads data and does not consume reset credits.',
      queryFailed: (message) => `Query failed: ${message}`,
      commonReasons: 'Common causes: not signed in, no Codex access on this account, session structure changes, or ChatGPT internal API changes.',
      sessionFailed: (status) => `/api/auth/session request failed: HTTP ${status}`,
      missingAccessToken: 'No accessToken was found in the session.',
      missingAccountId: 'No account id was found in the session.',
      requestFailed: (path, status) => `${path} request failed: HTTP ${status}`,
      languageHeader: 'en-US',
    },
    zh: {
      button: 'Codex 额度',
      title: 'Codex Reset Credits',
      refresh: '刷新',
      close: '关闭',
      languageSelect: '语言',
      languageAuto: '自动',
      languageEnglish: 'English',
      languageChinese: '中文',
      ready: '准备查询。',
      loading: '正在查询 Codex 额度...',
      noCreditDetails: '没有读取到 reset credit 明细。',
      remaining: (value) => `剩余 ${value}`,
      creditId: 'Credit ID',
      remainingCredits: '剩余 Reset Credits',
      availableResets: '当前可用重置次数',
      nearestExpiry: '最近 Credit 过期时间',
      nextReset: '下次额度重置时间',
      resetDetails: 'Reset Credits 明细',
      status: '状态',
      expiresAt: '过期时间',
      noResetTime: '未读取到重置时间',
      noExpiryTime: '未读取到过期时间',
      footer: '数据来自当前登录账号的 ChatGPT 内部接口。脚本只读取，不会消耗 reset credit。',
      queryFailed: (message) => `查询失败：${message}`,
      commonReasons: '常见原因：未登录、账号没有 Codex 权限、session 结构变化，或 ChatGPT 内部接口调整。',
      sessionFailed: (status) => `/api/auth/session 请求失败：HTTP ${status}`,
      missingAccessToken: '没有从 session 中读取到 accessToken。',
      missingAccountId: '没有从 session 中读取到 account id。',
      requestFailed: (path, status) => `${path} 请求失败：HTTP ${status}`,
      languageHeader: 'zh-CN',
    },
  };

  function detectLanguage() {
    const values = [
      document.documentElement.lang,
      ...Array.from(navigator.languages || []),
      navigator.language,
    ].filter(Boolean);

    return values.some((value) => String(value).toLowerCase().startsWith('zh')) ? 'zh' : 'en';
  }

  function getStoredLanguageMode() {
    try {
      const value = localStorage.getItem(LANGUAGE_STORAGE_KEY);
      return ['auto', 'en', 'zh'].includes(value) ? value : 'auto';
    } catch {
      return 'auto';
    }
  }

  function setStoredLanguageMode(value) {
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, value);
    } catch {
      // Ignore storage failures; the selection still works for the current page.
    }
  }

  function resolveLanguage() {
    return languageMode === 'auto' ? detectLanguage() : languageMode;
  }

  let languageMode = getStoredLanguageMode();
  let language = resolveLanguage();

  function t(key, ...args) {
    const message = messages[language][key] || messages.en[key] || key;
    return typeof message === 'function' ? message(...args) : message;
  }

  const css = `
    #codex-usage-btn {
      position: fixed;
      right: 18px;
      bottom: 18px;
      z-index: 2147483647;
      border: 1px solid rgba(255,255,255,.16);
      background: #111827;
      color: #fff;
      font-size: 13px;
      padding: 10px 13px;
      border-radius: 999px;
      cursor: pointer;
      box-shadow: 0 8px 28px rgba(0,0,0,.24);
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    #codex-usage-btn:hover {
      background: #1f2937;
    }

    #codex-usage-mask {
      position: fixed;
      inset: 0;
      z-index: 2147483646;
      background: rgba(0,0,0,.46);
      display: none;
      align-items: center;
      justify-content: center;
      padding: 24px;
      box-sizing: border-box;
    }

    #codex-usage-panel {
      width: min(760px, 94vw);
      max-height: 86vh;
      overflow: hidden;
      background: #0b1020;
      color: #e5e7eb;
      border: 1px solid rgba(255,255,255,.14);
      border-radius: 16px;
      box-shadow: 0 22px 80px rgba(0,0,0,.45);
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    .codex-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 18px;
      border-bottom: 1px solid rgba(255,255,255,.10);
      background: #0b1020;
    }

    .codex-title {
      font-size: 16px;
      font-weight: 700;
      letter-spacing: .1px;
    }

    .codex-actions {
      display: flex;
      gap: 8px;
      flex-shrink: 0;
      align-items: center;
    }

    .codex-small-btn,
    .codex-lang-select {
      border: 1px solid rgba(255,255,255,.16);
      background: #121a2b;
      color: #e5e7eb;
      padding: 7px 11px;
      border-radius: 9px;
      font-size: 12px;
    }

    .codex-small-btn {
      cursor: pointer;
    }

    .codex-lang-select {
      max-width: 96px;
    }

    .codex-small-btn:hover {
      background: #1f2937;
    }

    .codex-body {
      padding: 18px;
      overflow: auto;
      max-height: calc(86vh - 66px);
      box-sizing: border-box;
    }

    .codex-cards {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 18px;
    }

    .codex-card {
      background: rgba(255,255,255,.045);
      border: 1px solid rgba(255,255,255,.10);
      border-radius: 13px;
      padding: 13px 14px;
      min-width: 0;
    }

    .codex-label {
      color: #9ca3af;
      font-size: 12px;
      margin-bottom: 7px;
    }

    .codex-value {
      color: #f9fafb;
      font-size: 20px;
      font-weight: 750;
      line-height: 1.25;
      word-break: break-word;
    }

    .codex-value.small {
      font-size: 14px;
      font-weight: 650;
      line-height: 1.45;
    }

    .codex-sub {
      color: #9ca3af;
      font-size: 12px;
      margin-top: 7px;
      line-height: 1.45;
      word-break: break-word;
    }

    .codex-section {
      margin-top: 16px;
    }

    .codex-section-title {
      font-size: 14px;
      font-weight: 700;
      margin-bottom: 10px;
      color: #f3f4f6;
    }

    .codex-table-wrap {
      border: 1px solid rgba(255,255,255,.10);
      border-radius: 13px;
      overflow: hidden;
      background: rgba(255,255,255,.035);
    }

    .codex-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: 13px;
    }

    .codex-table th,
    .codex-table td {
      padding: 11px 12px;
      border-bottom: 1px solid rgba(255,255,255,.08);
      text-align: left;
      vertical-align: top;
    }

    .codex-table tr:last-child td {
      border-bottom: none;
    }

    .codex-table th {
      color: #9ca3af;
      background: rgba(255,255,255,.055);
      font-weight: 650;
    }

    .codex-table .idx {
      width: 44px;
    }

    .codex-table .status {
      width: 94px;
    }

    .codex-table .credit-id {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px;
      word-break: break-all;
      color: #d1d5db;
    }

    .codex-badge {
      display: inline-flex;
      align-items: center;
      padding: 3px 8px;
      border-radius: 999px;
      background: rgba(34,197,94,.12);
      border: 1px solid rgba(34,197,94,.22);
      color: #bbf7d0;
      font-size: 12px;
      line-height: 1.4;
    }

    .codex-muted-row {
      color: #9ca3af;
      text-align: center;
      padding: 18px 12px !important;
    }

    .codex-error {
      color: #fecaca;
      background: rgba(127,29,29,.35);
      border: 1px solid rgba(248,113,113,.25);
      padding: 12px;
      border-radius: 10px;
      font-size: 13px;
      line-height: 1.55;
    }

    .codex-loading {
      color: #9ca3af;
      font-size: 13px;
      line-height: 1.6;
    }

    .codex-footer {
      margin-top: 12px;
      color: #6b7280;
      font-size: 12px;
      line-height: 1.5;
    }

    @media (max-width: 720px) {
      #codex-usage-panel {
        width: 96vw;
      }

      .codex-cards {
        grid-template-columns: 1fr;
      }

      .codex-head {
        align-items: flex-start;
        gap: 12px;
      }

      .codex-actions {
        flex-wrap: wrap;
        justify-content: flex-end;
      }

      .codex-table {
        font-size: 12px;
      }

      .codex-table th,
      .codex-table td {
        padding: 9px 8px;
      }

      .codex-table .idx {
        width: 34px;
      }

      .codex-table .status {
        width: 78px;
      }
    }
  `;

  function addStyle() {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  }

  function createUI() {
    if (document.getElementById('codex-usage-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'codex-usage-btn';
    btn.textContent = t('button');
    btn.addEventListener('click', openPanel);

    const mask = document.createElement('div');
    mask.id = 'codex-usage-mask';
    mask.innerHTML = `
      <div id="codex-usage-panel">
        <div class="codex-head">
          <div class="codex-title">${escapeHtml(t('title'))}</div>
          <div class="codex-actions">
            <select class="codex-lang-select" id="codex-language" aria-label="${escapeHtml(t('languageSelect'))}">
              <option value="auto"${languageMode === 'auto' ? ' selected' : ''}>${escapeHtml(t('languageAuto'))}</option>
              <option value="en"${languageMode === 'en' ? ' selected' : ''}>${escapeHtml(t('languageEnglish'))}</option>
              <option value="zh"${languageMode === 'zh' ? ' selected' : ''}>${escapeHtml(t('languageChinese'))}</option>
            </select>
            <button class="codex-small-btn" id="codex-refresh">${escapeHtml(t('refresh'))}</button>
            <button class="codex-small-btn" id="codex-close">${escapeHtml(t('close'))}</button>
          </div>
        </div>
        <div class="codex-body" id="codex-usage-content">
          <div class="codex-loading">${escapeHtml(t('ready'))}</div>
        </div>
      </div>
    `;

    mask.addEventListener('click', (e) => {
      if (e.target === mask) closePanel();
    });

    document.body.appendChild(btn);
    document.body.appendChild(mask);

    document.getElementById('codex-close').addEventListener('click', closePanel);
    document.getElementById('codex-refresh').addEventListener('click', loadCodexUsage);
    document.getElementById('codex-language').addEventListener('change', changeLanguage);
  }

  function changeLanguage(e) {
    languageMode = e.target.value;
    language = resolveLanguage();
    setStoredLanguageMode(languageMode);
    refreshStaticText();

    const mask = document.getElementById('codex-usage-mask');
    if (mask?.style.display === 'flex') loadCodexUsage();
  }

  function refreshStaticText() {
    const btn = document.getElementById('codex-usage-btn');
    if (btn) btn.textContent = t('button');

    const title = document.querySelector('.codex-title');
    if (title) title.textContent = t('title');

    const refresh = document.getElementById('codex-refresh');
    if (refresh) refresh.textContent = t('refresh');

    const close = document.getElementById('codex-close');
    if (close) close.textContent = t('close');

    const select = document.getElementById('codex-language');
    if (select) {
      select.setAttribute('aria-label', t('languageSelect'));
      select.options[0].textContent = t('languageAuto');
      select.options[1].textContent = t('languageEnglish');
      select.options[2].textContent = t('languageChinese');
    }
  }

  function openPanel() {
    document.getElementById('codex-usage-mask').style.display = 'flex';
    loadCodexUsage();
  }

  function closePanel() {
    document.getElementById('codex-usage-mask').style.display = 'none';
  }

  function setContent(html) {
    const el = document.getElementById('codex-usage-content');
    if (el) el.innerHTML = html;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function formatDateTime(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '-';

    return [
      date.getFullYear(),
      '-',
      pad2(date.getMonth() + 1),
      '-',
      pad2(date.getDate()),
      ' ',
      pad2(date.getHours()),
      ':',
      pad2(date.getMinutes()),
      ':',
      pad2(date.getSeconds()),
    ].join('');
  }

  function parseAbsoluteDate(value) {
    if (value === null || value === undefined || value === '') return null;

    if (typeof value === 'number') {
      if (!Number.isFinite(value)) return null;
      return new Date(value < 10_000_000_000 ? value * 1000 : value);
    }

    if (typeof value === 'string') {
      const s = value.trim();

      if (/^\d{10}$/.test(s)) return new Date(Number(s) * 1000);
      if (/^\d{13}$/.test(s)) return new Date(Number(s));

      const d = new Date(s);
      if (!Number.isNaN(d.getTime())) return d;
    }

    return null;
  }

  function formatDuration(seconds) {
    const s = Math.max(0, Math.floor(Number(seconds) || 0));
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);

    if (language === 'zh') {
      if (d > 0) return `${d} 天 ${h} 小时 ${m} 分钟`;
      if (h > 0) return `${h} 小时 ${m} 分钟`;
      return `${m} 分钟`;
    }

    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  function maskId(id) {
    if (!id) return '-';
    const s = String(id);
    if (s.length <= 18) return s;
    return `${s.slice(0, 8)}…${s.slice(-8)}`;
  }

  async function getSession() {
    const res = await fetch('/api/auth/session', {
      credentials: 'include',
      cache: 'no-store',
    });

    if (!res.ok) {
      throw new Error(t('sessionFailed', res.status));
    }

    const data = await res.json();

    const token = data.accessToken;
    const accountId =
      data?.account?.id ||
      data?.user?.id ||
      data?.accounts?.[0]?.id;

    if (!token) {
      throw new Error(t('missingAccessToken'));
    }

    if (!accountId) {
      throw new Error(t('missingAccountId'));
    }

    return { token, accountId };
  }

  async function cgGet(path, token, accountId) {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        Authorization: `Bearer ${token}`,
        'ChatGPT-Account-Id': accountId,
        'OAI-Language': t('languageHeader'),
        originator: 'Codex Desktop',
        'Content-Type': 'application/json',
      },
    });

    const text = await res.text();

    let json;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text };
    }

    if (!res.ok) {
      throw new Error(t('requestFailed', path, res.status));
    }

    return json;
  }

  function pickCredits(data) {
    if (!data) return [];

    if (Array.isArray(data)) return data;

    const candidates = [
      data.credits,
      data.data,
      data.items,
      data.results,
      data.rate_limit_reset_credits,
      data.rateLimitResetCredits,
    ];

    for (const item of candidates) {
      if (Array.isArray(item)) return item;
    }

    return [];
  }

  function getCreditId(c) {
    return c?.id || c?.credit_id || c?.creditId || c?.uuid || c?.key || '-';
  }

  function getCreditStatus(c) {
    return c?.status || c?.state || c?.type || c?.kind || '-';
  }

  function getCreditExpiresRaw(c) {
    return (
      c?.expires_at ||
      c?.expiresAt ||
      c?.expiration_time ||
      c?.expirationTime ||
      c?.expire_at ||
      c?.expireAt ||
      c?.valid_until ||
      c?.validUntil ||
      c?.end_time ||
      c?.endTime ||
      null
    );
  }

  function getCreditExpiresDate(c) {
    return parseAbsoluteDate(getCreditExpiresRaw(c));
  }

  function getRemainingCredits(raw, credits) {
    const candidates = [
      raw?.remaining,
      raw?.count,
      raw?.available,
      raw?.total_available,
      raw?.totalAvailable,
    ];

    for (const v of candidates) {
      if (typeof v === 'number') return v;
    }

    return credits.length;
  }

  function flatten(obj, prefix = '', out = {}) {
    if (!obj || typeof obj !== 'object') return out;

    for (const [key, value] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${key}` : key;

      if (value && typeof value === 'object' && !Array.isArray(value)) {
        flatten(value, path, out);
      } else {
        out[path] = value;
      }
    }

    return out;
  }

  function findResetInfo(usage) {
    const flat = flatten(usage);
    const now = Date.now();

    const candidates = [];

    for (const [key, value] of Object.entries(flat)) {
      const lower = key.toLowerCase();

      if (
        typeof value === 'number' &&
        Number.isFinite(value) &&
        /(reset_after_seconds|retry_after_seconds|resets_in_seconds|expires_in_seconds)$/.test(lower)
      ) {
        candidates.push({
          label: key,
          date: new Date(now + value * 1000),
          duration: value,
          source: 'relative',
        });
      }

      if (
        (typeof value === 'string' || typeof value === 'number') &&
        /(reset_at|reset_time|resets_at|expires_at|expiration_time|valid_until)$/.test(lower)
      ) {
        const d = parseAbsoluteDate(value);
        if (d) {
          candidates.push({
            label: key,
            date: d,
            duration: Math.max(0, Math.floor((d.getTime() - now) / 1000)),
            source: 'absolute',
          });
        }
      }
    }

    candidates.sort((a, b) => a.date.getTime() - b.date.getTime());

    return candidates;
  }

  function renderCreditsTable(credits) {
    if (!credits.length) {
      return `
        <div class="codex-table-wrap">
          <table class="codex-table">
            <tbody>
              <tr>
                <td class="codex-muted-row">${escapeHtml(t('noCreditDetails'))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      `;
    }

    const rows = credits.map((c, i) => {
      const id = getCreditId(c);
      const status = getCreditStatus(c);
      const expiresDate = getCreditExpiresDate(c);

      return `
        <tr>
          <td class="idx">${i + 1}</td>
          <td>
            <div class="credit-id">${escapeHtml(maskId(id))}</div>
          </td>
          <td class="status">
            <span class="codex-badge">${escapeHtml(status)}</span>
          </td>
          <td>
            <div>${escapeHtml(formatDateTime(expiresDate))}</div>
            <div class="codex-sub">${expiresDate ? escapeHtml(t('remaining', formatDuration((expiresDate.getTime() - Date.now()) / 1000))) : '-'}</div>
          </td>
        </tr>
      `;
    }).join('');

    return `
      <div class="codex-table-wrap">
        <table class="codex-table">
          <thead>
            <tr>
              <th class="idx">#</th>
              <th>${escapeHtml(t('creditId'))}</th>
              <th class="status">${escapeHtml(t('status'))}</th>
              <th>${escapeHtml(t('expiresAt'))}</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  function getNearestCreditExpiry(credits) {
    const dates = credits
      .map(getCreditExpiresDate)
      .filter(Boolean)
      .sort((a, b) => a.getTime() - b.getTime());

    return dates[0] || null;
  }

  function renderSummary(creditsRaw, usageRaw) {
    const credits = pickCredits(creditsRaw);
    const remaining = getRemainingCredits(creditsRaw, credits);
    const nearestExpiry = getNearestCreditExpiry(credits);
    const resetCandidates = findResetInfo(usageRaw);
    const nextReset = resetCandidates[0] || null;

    const nextResetText = nextReset
      ? formatDateTime(nextReset.date)
      : '-';

    const nextResetSub = nextReset
      ? t('remaining', formatDuration(nextReset.duration))
      : t('noResetTime');

    const nearestExpiryText = nearestExpiry
      ? formatDateTime(nearestExpiry)
      : '-';

    const nearestExpirySub = nearestExpiry
      ? t('remaining', formatDuration((nearestExpiry.getTime() - Date.now()) / 1000))
      : t('noExpiryTime');

    return `
      <div class="codex-cards">
        <div class="codex-card">
          <div class="codex-label">${escapeHtml(t('remainingCredits'))}</div>
          <div class="codex-value">${escapeHtml(remaining)}</div>
          <div class="codex-sub">${escapeHtml(t('availableResets'))}</div>
        </div>

        <div class="codex-card">
          <div class="codex-label">${escapeHtml(t('nearestExpiry'))}</div>
          <div class="codex-value small">${escapeHtml(nearestExpiryText)}</div>
          <div class="codex-sub">${escapeHtml(nearestExpirySub)}</div>
        </div>

        <div class="codex-card">
          <div class="codex-label">${escapeHtml(t('nextReset'))}</div>
          <div class="codex-value small">${escapeHtml(nextResetText)}</div>
          <div class="codex-sub">${escapeHtml(nextResetSub)}</div>
        </div>
      </div>

      <div class="codex-section">
        <div class="codex-section-title">${escapeHtml(t('resetDetails'))}</div>
        ${renderCreditsTable(credits)}
      </div>

      <div class="codex-footer">
        ${escapeHtml(t('footer'))}
      </div>
    `;
  }

  async function loadCodexUsage() {
    setContent(`<div class="codex-loading">${escapeHtml(t('loading'))}</div>`);

    try {
      const { token, accountId } = await getSession();

      const [credits, usage] = await Promise.all([
        cgGet('/wham/rate-limit-reset-credits', token, accountId),
        cgGet('/wham/usage', token, accountId),
      ]);

      setContent(renderSummary(credits, usage));
    } catch (err) {
      setContent(`
        <div class="codex-error">
          ${escapeHtml(t('queryFailed', err?.message || err))}
        </div>
        <div class="codex-footer">
          ${escapeHtml(t('commonReasons'))}
        </div>
      `);
    }
  }

  addStyle();
  createUI();
})();

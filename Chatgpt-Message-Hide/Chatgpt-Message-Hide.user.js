// ==UserScript==
// @name         ChatGPT Message Hide
// @name:zh-CN   ChatGPT 消息隐藏
// @namespace    https://github.com/weimin96/tampermonkey-scripts
// @version      1.0.0
// @license      MIT
// @description  Add a hide/show button in the “Response actions” area of each ChatGPT AI reply
// @description:zh-CN 在 ChatGPT 每条 AI 回复的”回复操作”区域添加一个隐藏/显示按钮
// @homepageURL  https://github.com/weimin96/tampermonkey-scripts/tree/main/Chatgpt-Message-Hide
// @supportURL   https://github.com/weimin96/tampermonkey-scripts/issues
// @match        https://chatgpt.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const NS = 'cgpt-hide-one';
  const STORE_KEY = `${NS}:hidden:v1`;

  const CLS = {
    hidden: `${NS}-hidden`,
    content: `${NS}-content`,
    placeholder: `${NS}-placeholder`,
    button: `${NS}-button`
  };

  let localSeq = 0;
  let currentPath = location.pathname;
  let scanTimer = 0;

  injectStyle();
  scan();

  const observer = new MutationObserver((mutations) => {
    if (isOnlyOwnMutation(mutations)) return;
    scheduleScan();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });

  setInterval(() => {
    if (location.pathname !== currentPath) {
      currentPath = location.pathname;
      localSeq = 0;
      scheduleScan();
    }
  }, 600);

  function loadHidden() {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    } catch {
      return {};
    }
  }

  function saveHidden(map) {
    localStorage.setItem(STORE_KEY, JSON.stringify(map));
  }

  function getAssistantTurns() {
    return [
      ...new Set(
        document.querySelectorAll(
          [
            'section[data-turn="assistant"][data-turn-id]',
            'section[data-turn="assistant"][data-testid^="conversation-turn-"]',
            'section[data-turn="assistant"]'
          ].join(',')
        )
      )
    ];
  }

  function getTurnId(turn) {
    if (!turn.dataset.cgptHideLocalId) {
      turn.dataset.cgptHideLocalId =
        turn.getAttribute('data-turn-id') ||
        turn.getAttribute('data-turn-id-container') ||
        turn.querySelector('[data-message-id]')?.getAttribute('data-message-id') ||
        turn.getAttribute('data-testid') ||
        `${location.pathname}:local-${++localSeq}`;
    }

    return `${location.pathname}::${turn.dataset.cgptHideLocalId}`;
  }

  function findAgentContainer(turn) {
    return (
      turn.querySelector('[data-conversation-screenshot-content].agent-turn') ||
      turn.querySelector('.agent-turn') ||
      turn.querySelector('[data-conversation-screenshot-content]') ||
      turn
    );
  }

  function findActionGroup(turn) {
    return turn.querySelector(
      [
        '[aria-label="回复操作"]',
        '[aria-label="Response actions"]',
        '[aria-label="Assistant actions"]'
      ].join(',')
    );
  }

  function findActionWrapper(agent, actionGroup) {
    if (!agent || !actionGroup) return null;

    return (
      [...agent.children].find((child) => {
        return child === actionGroup || child.contains(actionGroup);
      }) || null
    );
  }

  function ensurePlaceholder(turn, agent) {
    let placeholder = turn.querySelector(`:scope .${CLS.placeholder}`);

    if (!placeholder) {
      placeholder = document.createElement('div');
      placeholder.className = CLS.placeholder;
      placeholder.textContent = '这条 AI 输出已隐藏';
    }

    if (placeholder.parentElement !== agent) {
      agent.insertBefore(placeholder, agent.firstChild);
    }

    placeholder.addEventListener('click', () => {
      setHidden(turn, false);
    });

    return placeholder;
  }

  function markContentChildren(turn) {
    const agent = findAgentContainer(turn);
    const actionGroup = findActionGroup(turn);
    const actionWrapper = findActionWrapper(agent, actionGroup);

    if (!agent) return;

    ensurePlaceholder(turn, agent);

    [...agent.children].forEach((child) => {
      child.classList.remove(CLS.content);
    });

    [...agent.children].forEach((child) => {
      if (child.classList.contains(CLS.placeholder)) return;
      if (actionWrapper && child === actionWrapper) return;

      child.classList.add(CLS.content);
    });
  }

  function addHideButton(turn) {
    const actionGroup = findActionGroup(turn);
    if (!actionGroup) return;

    const oldButtons = [...actionGroup.querySelectorAll(`.${CLS.button}`)];

    // 保证每条回复只保留一个隐藏按钮
    oldButtons.slice(1).forEach((btn) => btn.remove());

    let btn = oldButtons[0];

    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = CLS.button;
      btn.setAttribute('aria-label', '隐藏这条 AI 输出');
      btn.setAttribute('data-cgpt-hide-button', 'true');

      btn.innerHTML = `
        <span class="flex items-center justify-center touch:w-10 h-8 w-8">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path fill="currentColor" d="M12 5c5.5 0 9.4 4.4 10.7 6.1.4.5.4 1.2 0 1.8C21.4 14.6 17.5 19 12 19S2.6 14.6 1.3 12.9a1.5 1.5 0 0 1 0-1.8C2.6 9.4 6.5 5 12 5Zm0 2C7.7 7 4.4 10.2 3.2 12c1.2 1.8 4.5 5 8.8 5s7.6-3.2 8.8-5C19.6 10.2 16.3 7 12 7Zm0 2.2A2.8 2.8 0 1 1 12 14.8 2.8 2.8 0 0 1 12 9.2Z"/>
          </svg>
        </span>
      `;

      btn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();

        const isHidden = turn.classList.contains(CLS.hidden);
        setHidden(turn, !isHidden);
      });

      const copyButton = actionGroup.querySelector('[data-testid="copy-turn-action-button"]');

      if (copyButton?.parentElement === actionGroup) {
        copyButton.insertAdjacentElement('afterend', btn);
      } else {
        actionGroup.insertBefore(btn, actionGroup.firstChild);
      }
    }

    updateButton(turn);
  }

  function updateButton(turn) {
    const btn = turn.querySelector(`.${CLS.button}`);
    if (!btn) return;

    const hidden = turn.classList.contains(CLS.hidden);

    btn.title = hidden ? '显示这条 AI 输出' : '隐藏这条 AI 输出';
    btn.setAttribute('aria-label', hidden ? '显示这条 AI 输出' : '隐藏这条 AI 输出');
    btn.setAttribute('aria-pressed', hidden ? 'true' : 'false');

    btn.innerHTML = hidden
      ? `
        <span class="flex items-center justify-center touch:w-10 h-8 w-8">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path fill="currentColor" d="M2.1 3.5 3.5 2.1l18.4 18.4-1.4 1.4-3.1-3.1A11.6 11.6 0 0 1 12 20C6.5 20 2.6 15.6 1.3 13.9a1.5 1.5 0 0 1 0-1.8 19 19 0 0 1 4-4.1L2.1 3.5Zm5.1 6.4A16.5 16.5 0 0 0 3.2 13c1.2 1.8 4.5 5 8.8 5 1.4 0 2.7-.3 3.8-.9l-2.1-2.1A3 3 0 0 1 9 10.3L7.2 9.9ZM12 6c5.5 0 9.4 4.4 10.7 6.1.4.5.4 1.2 0 1.8a18.3 18.3 0 0 1-2.8 3.1l-1.4-1.4A16.3 16.3 0 0 0 20.8 13C19.6 11.2 16.3 8 12 8c-.8 0-1.5.1-2.2.3L8.2 6.7A10.6 10.6 0 0 1 12 6Z"/>
          </svg>
        </span>
      `
      : `
        <span class="flex items-center justify-center touch:w-10 h-8 w-8">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path fill="currentColor" d="M12 5c5.5 0 9.4 4.4 10.7 6.1.4.5.4 1.2 0 1.8C21.4 14.6 17.5 19 12 19S2.6 14.6 1.3 12.9a1.5 1.5 0 0 1 0-1.8C2.6 9.4 6.5 5 12 5Zm0 2C7.7 7 4.4 10.2 3.2 12c1.2 1.8 4.5 5 8.8 5s7.6-3.2 8.8-5C19.6 10.2 16.3 7 12 7Zm0 2.2A2.8 2.8 0 1 1 12 14.8 2.8 2.8 0 0 1 12 9.2Z"/>
          </svg>
        </span>
      `;
  }

  function setHidden(turn, hidden) {
    markContentChildren(turn);

    const id = getTurnId(turn);
    const map = loadHidden();

    if (hidden) {
      map[id] = true;
    } else {
      delete map[id];
    }

    saveHidden(map);

    turn.classList.toggle(CLS.hidden, hidden);
    turn.dataset.cgptHidden = hidden ? 'true' : 'false';

    updateButton(turn);
  }

  function prepareTurn(turn) {
    markContentChildren(turn);
    addHideButton(turn);

    const id = getTurnId(turn);
    const hiddenMap = loadHidden();

    turn.classList.toggle(CLS.hidden, Boolean(hiddenMap[id]));
    turn.dataset.cgptHidden = hiddenMap[id] ? 'true' : 'false';

    updateButton(turn);
  }

  function scan() {
    getAssistantTurns().forEach(prepareTurn);
  }

  function scheduleScan() {
    clearTimeout(scanTimer);

    scanTimer = window.setTimeout(() => {
      scanTimer = 0;
      scan();
    }, 180);
  }

  function isOnlyOwnMutation(mutations) {
    return mutations.every((mutation) => {
      const target =
        mutation.target.nodeType === Node.ELEMENT_NODE
          ? mutation.target
          : mutation.target.parentElement;

      if (!target?.closest) return false;

      return Boolean(
        target.closest(
          `.${CLS.button}, .${CLS.placeholder}`
        )
      );
    });
  }

  function injectStyle() {
    document.getElementById(`${NS}-style`)?.remove();

    const style = document.createElement('style');
    style.id = `${NS}-style`;

    style.textContent = `
      .${CLS.button} {
        color: var(--text-secondary, #666);
        border: 0;
        background: transparent;
        border-radius: 8px;
        padding: 0;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }

      .${CLS.button}:hover {
        background: var(--surface-hover, rgba(127, 127, 127, 0.12));
        color: var(--text-primary, #111);
      }

      .${CLS.placeholder} {
        display: none;
        box-sizing: border-box;
        width: 100%;
        margin: 4px 0 8px;
        padding: 10px 12px;
        border: 1px dashed rgba(127, 127, 127, 0.35);
        border-radius: 12px;
        color: var(--text-secondary, #666);
        background: color-mix(in srgb, var(--main-surface-primary, #fff) 88%, #888 12%);
        font-size: 13px;
        cursor: pointer;
        user-select: none;
      }

      .${CLS.hidden} .${CLS.content} {
        display: none !important;
      }

      .${CLS.hidden} .${CLS.placeholder} {
        display: block !important;
      }
    `;

    document.head.appendChild(style);
  }
})();
// ==UserScript==
// @name         ChatGPT Reply Notification
// @name:zh-CN   ChatGPT 回复完成通知
// @namespace    https://github.com/weimin96/tampermonkey-scripts
// @version      1.0.1
// @license      MIT
// @description  Send system notification and sound when ChatGPT finishes generating a reply
// @description:zh-CN ChatGPT 网页端 AI 输出完成后发送系统通知和音效
// @homepageURL  https://github.com/weimin96/tampermonkey-scripts/tree/main/Chatgpt-Message-Hide/Chatgpt-Notice
// @supportURL   https://github.com/weimin96/tampermonkey-scripts/issues
// @match        https://chatgpt.com/*
// @grant        none
// @run-at       document-start
// @downloadURL https://update.greasyfork.org/scripts/585660/ChatGPT%20Reply%20Notification.user.js
// @updateURL https://update.greasyfork.org/scripts/585660/ChatGPT%20Reply%20Notification.meta.js
// ==/UserScript==

(function () {
  'use strict';

  const CHECK_INTERVAL = 600;

  // 停止按钮消失后，不立刻通知，而是继续观察这么久
  // 工具调用经常会短暂停顿，建议 10000 - 20000
  const FINISH_IDLE_DELAY = 12000;

  // 通知前要求聊天区域至少安静这么久
  const DOM_QUIET_DELAY = 3500;

  const ARM_EXPIRE_MS = 20 * 60 * 1000;

  const ENABLE_SOUND = true;
  const SOUND_VOLUME = 0.35;

  let armed = false;
  let sawGenerating = false;
  let lastUserSendAt = 0;
  let completionTimer = null;
  let lastNotifyAt = 0;
  let audioCtx = null;

  let armedConversationId = null;
  let lastChatMutationAt = Date.now();

  const originalTitle = document.title;

  function getConversationIdFromUrl(href) {
    try {
      const url = new URL(href, location.origin);

      const match =
        url.pathname.match(/^\/c\/([^/?#]+)/) ||
        url.pathname.match(/^\/chat\/([^/?#]+)/);

      return match ? match[1] : null;
    } catch (_) {
      return null;
    }
  }

  function getCurrentConversationId() {
    return getConversationIdFromUrl(location.href);
  }

  function isStillSameConversation() {
    const currentId = getCurrentConversationId();

    if (armedConversationId) {
      return currentId === armedConversationId;
    }

    // 新对话发送后，URL 自动变成 /c/xxx，这是允许的
    return true;
  }

  function handlePossibleRouteChange() {
    if (!armed) return;

    const currentId = getCurrentConversationId();

    if (armedConversationId && currentId !== armedConversationId) {
      resetState();
      return;
    }

    if (!armedConversationId && currentId) {
      armedConversationId = currentId;
    }
  }

  function patchHistoryMethods() {
    const rawPushState = history.pushState;
    const rawReplaceState = history.replaceState;

    history.pushState = function (...args) {
      const result = rawPushState.apply(this, args);
      setTimeout(handlePossibleRouteChange, 0);
      return result;
    };

    history.replaceState = function (...args) {
      const result = rawReplaceState.apply(this, args);
      setTimeout(handlePossibleRouteChange, 0);
      return result;
    };

    window.addEventListener('popstate', () => {
      setTimeout(handlePossibleRouteChange, 0);
    });
  }

  function observeChatMutations() {
    const observer = new MutationObserver(() => {
      lastChatMutationAt = Date.now();
    });

    function startObserve() {
      const target =
        document.querySelector('main') ||
        document.querySelector('[role="main"]') ||
        document.body;

      if (!target) {
        setTimeout(startObserve, 500);
        return;
      }

      observer.observe(target, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: [
          'aria-busy',
          'aria-label',
          'data-testid',
          'disabled',
          'class'
        ]
      });
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', startObserve, { once: true });
    } else {
      startObserve();
    }
  }

  function requestNotifyPermission() {
    if (!('Notification' in window)) return;

    if (Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }

  function unlockAudio() {
    if (!ENABLE_SOUND) return;

    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;

      if (!audioCtx) {
        audioCtx = new AudioContext();
      }

      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }
    } catch (_) {}
  }

  function playDoneSound() {
    if (!ENABLE_SOUND) return;

    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;

      if (!audioCtx) {
        audioCtx = new AudioContext();
      }

      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }

      const now = audioCtx.currentTime;

      beep(now, 660, 0.12);
      beep(now + 0.16, 880, 0.14);
    } catch (_) {}
  }

  function beep(startTime, frequency, duration) {
    const oscillator = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, startTime);

    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(SOUND_VOLUME, startTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    oscillator.connect(gain);
    gain.connect(audioCtx.destination);

    oscillator.start(startTime);
    oscillator.stop(startTime + duration + 0.03);
  }

  function notifyDone() {
    const now = Date.now();

    if (now - lastNotifyAt < 3000) return;
    lastNotifyAt = now;

    playDoneSound();

    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('ChatGPT 回复已完成', {
        body: 'AI 已完成本次完整回复。',
        silent: false
      });
    } else {
      flashTitle();
    }
  }

  function flashTitle() {
    let count = 0;

    const timer = setInterval(() => {
      document.title = count % 2 === 0 ? '✅ ChatGPT 回复已完成' : originalTitle;
      count++;

      if (count > 8) {
        clearInterval(timer);
        document.title = originalTitle;
      }
    }, 700);
  }

  function armByUserAction() {
    armed = true;
    sawGenerating = false;
    lastUserSendAt = Date.now();
    armedConversationId = getCurrentConversationId();
    lastChatMutationAt = Date.now();

    clearTimeout(completionTimer);
    completionTimer = null;

    requestNotifyPermission();
    unlockAudio();
  }

  function isExpired() {
    return Date.now() - lastUserSendAt > ARM_EXPIRE_MS;
  }

  function findStopButton() {
    const buttons = Array.from(document.querySelectorAll('button'));

    return buttons.find(btn => {
      const text = (btn.innerText || '').trim();

      const attrs = [
        btn.getAttribute('aria-label'),
        btn.getAttribute('data-testid'),
        btn.getAttribute('title')
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return (
        text.includes('停止') ||
        text.includes('Stop') ||
        text.includes('Cancel') ||
        attrs.includes('stop') ||
        attrs.includes('停止') ||
        attrs.includes('cancel')
      );
    });
  }

  function isGenerating() {
    return Boolean(findStopButton());
  }

  function hasBusyDomIndicator() {
    const busySelector = [
      '[aria-busy="true"]',
      '[role="progressbar"]',
      '[data-testid*="spinner"]',
      '[data-testid*="loading"]',
      '[class*="animate-spin"]'
    ].join(',');

    if (document.querySelector(busySelector)) {
      return true;
    }

    const main =
      document.querySelector('main') ||
      document.querySelector('[role="main"]') ||
      document.body;

    const text = (main?.innerText || '').slice(-4000);

    // 只判断明显的“仍在进行中”文案
    const activeWords = [
      '正在搜索',
      '正在分析',
      '正在读取',
      '正在思考',
      '正在运行',
      '正在使用',
      '搜索中',
      '分析中',
      '读取中',
      'Thinking',
      'Searching',
      'Analyzing',
      'Reading',
      'Running',
      'Working'
    ];

    return activeWords.some(word => text.includes(word));
  }

  function isComposerDisabledOrBusy() {
    const composer =
      document.querySelector('#prompt-textarea') ||
      document.querySelector('textarea') ||
      document.querySelector('[contenteditable="true"]');

    if (!composer) return false;

    if (composer.disabled) return true;

    const ariaDisabled = composer.getAttribute('aria-disabled');
    if (ariaDisabled === 'true') return true;

    const contentEditable = composer.getAttribute('contenteditable');
    if (contentEditable === 'false') return true;

    return false;
  }

  function canNotifyNow() {
    if (!armed) return false;
    if (!sawGenerating) return false;
    if (isExpired()) return false;
    if (!isStillSameConversation()) return false;

    // 停止按钮还在，说明肯定没完成
    if (isGenerating()) return false;

    // 工具、加载、分析状态还在，不能通知
    if (hasBusyDomIndicator()) return false;

    // 输入框仍处于禁用状态，通常说明这一轮还没彻底结束
    if (isComposerDisabledOrBusy()) return false;

    // 聊天区还在变化，说明工具结果或模型输出可能仍在继续
    if (Date.now() - lastChatMutationAt < DOM_QUIET_DELAY) return false;

    return true;
  }

  function scheduleCompletionCheck() {
    if (!armed) return;
    if (!sawGenerating) return;

    clearTimeout(completionTimer);

    completionTimer = setTimeout(() => {
      handlePossibleRouteChange();

      if (!armed) return;

      if (canNotifyNow()) {
        notifyDone();
        resetState();
        return;
      }

      // 还没满足“真正完成”的条件，继续观察
      // 这样可以避开工具调用结束但模型还没继续输出的中间状态
      if (!isExpired()) {
        scheduleCompletionCheck();
      } else {
        resetState();
      }
    }, FINISH_IDLE_DELAY);
  }

  function resetState() {
    armed = false;
    sawGenerating = false;
    armedConversationId = null;

    clearTimeout(completionTimer);
    completionTimer = null;
  }

  function watchGeneratingState() {
    let lastGenerating = false;

    setInterval(() => {
      if (!armed) return;

      handlePossibleRouteChange();

      if (!armed) {
        lastGenerating = false;
        return;
      }

      if (isExpired()) {
        resetState();
        lastGenerating = false;
        return;
      }

      if (!isStillSameConversation()) {
        resetState();
        lastGenerating = false;
        return;
      }

      const generating = isGenerating();

      if (generating) {
        sawGenerating = true;

        // 如果又开始生成，取消之前的“可能完成”计时
        clearTimeout(completionTimer);
        completionTimer = null;
      }

      // 从“生成中”变成“看似不生成”时，只安排延迟确认，不直接通知
      if (lastGenerating && !generating) {
        scheduleCompletionCheck();
      }

      lastGenerating = generating;
    }, CHECK_INTERVAL);
  }

  function hookUserSendActions() {
    document.addEventListener(
      'keydown',
      event => {
        const target = event.target;
        if (!target) return;

        const isComposer =
          target.matches?.('textarea, [contenteditable="true"], #prompt-textarea') ||
          target.closest?.('textarea, [contenteditable="true"], #prompt-textarea');

        if (!isComposer) return;

        if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
          armByUserAction();
        }
      },
      true
    );

    document.addEventListener(
      'click',
      event => {
        const link = event.target.closest?.('a[href]');

        // 点击历史对话、新建对话等链接时，取消当前监听
        if (link && armed) {
          try {
            const targetUrl = new URL(link.href, location.href);

            if (
              targetUrl.origin === location.origin &&
              targetUrl.href !== location.href
            ) {
              resetState();
              return;
            }
          } catch (_) {}
        }

        const button = event.target.closest?.('button');
        if (!button) return;

        const aria = (
          button.getAttribute('aria-label') ||
          button.getAttribute('data-testid') ||
          button.getAttribute('title') ||
          button.innerText ||
          ''
        ).toLowerCase();

        const looksLikeSend =
          aria.includes('send') ||
          aria.includes('发送') ||
          aria.includes('submit');

        if (looksLikeSend) {
          armByUserAction();
        }
      },
      true
    );
  }

  patchHistoryMethods();
  observeChatMutations();
  hookUserSendActions();
  watchGeneratingState();
})();
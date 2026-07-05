// ==UserScript==
// @name         ChatGPT Reply Notification
// @name:zh-CN   ChatGPT 回复完成通知
// @namespace    https://github.com/weimin96/tampermonkey-scripts
// @version      1.0.0
// @license      MIT
// @description  Send system notification and sound when ChatGPT finishes generating a reply, with false-positive prevention for page refresh/entry
// @description:zh-CN ChatGPT 网页端 AI 输出完成后发送系统通知和音效，避免刷新/进入页面误通知
// @homepageURL  https://github.com/weimin96/tampermonkey-scripts/tree/main/Chatgpt-Message-Hide/Chatgpt-Notice
// @supportURL   https://github.com/weimin96/tampermonkey-scripts/issues
// @match        https://chatgpt.com/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  const CHECK_INTERVAL = 600;
  const STABLE_DELAY = 1500;
  const ARM_EXPIRE_MS = 10 * 60 * 1000;

  // 音效开关
  const ENABLE_SOUND = true;

  // 音量：0.0 - 1.0
  const SOUND_VOLUME = 0.35;

  let armed = false;
  let sawGenerating = false;
  let lastUserSendAt = 0;
  let completionTimer = null;
  let lastNotifyAt = 0;
  let audioCtx = null;

  const originalTitle = document.title;

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

      // 第一声
      beep(now, 660, 0.12);

      // 第二声，稍高一点
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

    // 防止短时间重复通知
    if (now - lastNotifyAt < 3000) return;
    lastNotifyAt = now;

    playDoneSound();

    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('ChatGPT 回复已完成', {
        body: 'AI 已完成本次输出。',
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
        attrs.includes('stop') ||
        attrs.includes('停止')
      );
    });
  }

  function isGenerating() {
    return Boolean(findStopButton());
  }

  function onMaybeCompleted() {
    if (!armed) return;
    if (!sawGenerating) return;

    if (isExpired()) {
      resetState();
      return;
    }

    clearTimeout(completionTimer);

    completionTimer = setTimeout(() => {
      if (!isGenerating() && armed && sawGenerating) {
        notifyDone();
        resetState();
      }
    }, STABLE_DELAY);
  }

  function resetState() {
    armed = false;
    sawGenerating = false;
    clearTimeout(completionTimer);
    completionTimer = null;
  }

  function watchGeneratingState() {
    let lastGenerating = false;

    setInterval(() => {
      if (!armed) return;

      if (isExpired()) {
        resetState();
        return;
      }

      const generating = isGenerating();

      if (generating) {
        sawGenerating = true;
      }

      if (lastGenerating && !generating) {
        onMaybeCompleted();
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

        // Enter 发送，Shift + Enter 换行
        if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
          armByUserAction();
        }
      },
      true
    );

    document.addEventListener(
      'click',
      event => {
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

  hookUserSendActions();

  window.addEventListener('DOMContentLoaded', () => {
    watchGeneratingState();
  });
})();
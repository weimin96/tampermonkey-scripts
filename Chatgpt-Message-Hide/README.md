# ChatGPT Message Hide

[![版本](https://img.shields.io/badge/version-1.0.0-blue)](Chatgpt-Message-Hide.user.js)
[![许可证](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Greasy Fork](https://img.shields.io/badge/Greasy%20Fork-install-green)](https://greasyfork.org/zh-CN/scripts/585664-chatgpt-message-hide)
[![GitHub](https://img.shields.io/badge/GitHub-weimin96%2FChatgpt--Notice--black)](https://github.com/weimin96/tampermonkey-scripts)

在 ChatGPT 每条 AI 回复的「回复操作」区域添加隐藏/显示按钮。

[在 Greasy Fork 安装](https://greasyfork.org/zh-CN/scripts/585664-chatgpt-message-hide)

## 截图

![展示](screenshot/hide.png)

## 功能

- 每条 AI 回复的操作栏新增眼睛图标按钮
- 点击隐藏后 AI 回复内容折叠为一行占位提示，再次点击恢复
- 隐藏状态跨会话持久化（localStorage）
- 适配页面 SPA 路由切换和 DOM 动态变化

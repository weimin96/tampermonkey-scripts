# ChatGPT 回复完成通知

[![版本](https://img.shields.io/badge/version-1.0.0-blue)](Chatgpt-Notice.user.js)
[![许可证](https://img.shields.io/badge/license-MIT-green)](LICENSE)

ChatGPT 网页端 AI 输出完成后发送系统通知并播放音效，避免页面刷新或首次进入时误触发。

## 功能

- 检测 ChatGPT 回复生成完毕（停止按钮消失后稳定 1.5 秒）
- 播放双音提示音
- 发送浏览器系统通知（需授权）
- 通知未授权时回退为标题闪烁提醒
- 仅对用户主动发送的消息生效，避免刷新页面误触发
- 10 分钟内未收到新回复自动解除监听

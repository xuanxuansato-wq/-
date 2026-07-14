# Online Image & Video Recognition

Online Image & Video Recognition 是一个 Chrome Manifest V3 扩展，用于网页图片识别、视频分镜反推、提示词整理、AI 生图预览和视频下载辅助。

## 主要功能

- 鼠标悬停网页图片，点击 `识图` 反推图片提示词。
- 图片识别结果支持缩略图预览、提示词编辑、复制提示词和生图预览。
- 鼠标悬停网页视频，点击 `识视频`，可从当前播放位置选择 1s、5s、10s、15s、25s、30s、35s、45s 或 1min 进行抽帧分析。
- 视频识别后输出中文即梦提示词、关键词和分镜结构。
- 分镜结构包含全局参考、镜头时间、画面描述和镜头语言。
- 支持修改故事大纲，并按新的内容方向同步调整后续分镜描述。
- 可打开分镜编辑器，上传/拖拽分镜图和资产图，编辑分镜脚本，并下载可编辑 HTML 或脚本图片。
- 支持复制分镜、复制提示词并打开即梦。
- 支持网页图片、抽帧图和可直接访问视频文件的下载辅助。
- 设置页支持 Gemini、OpenAI / GPT、豆包、千问、即梦和 OpenAI Compatible 等 API 配置。

## 安装

1. 打开 `chrome://extensions/`。
2. 开启开发者模式。
3. 点击“加载已解压的扩展程序”。
4. 选择本文件夹。
5. 打开扩展设置页，填写识别服务、Base URL、模型名和 API Key。

## 默认模型

Gemini:

- Base URL: `https://generativelanguage.googleapis.com/v1beta`
- Model: `gemini-2.5-flash`

OpenAI Compatible:

- Base URL: `https://api.openai.com/v1`
- Model: `gpt-4.1-mini`

不同网关可能使用不同模型名，也可能不支持 `/chat/completions` 的图片输入。需要时请在设置页调整。

## 隐私

API Key 只保存在本机 Chrome storage。图片、截图和视频抽帧会发送给你配置的模型服务商。本扩展不使用项目自有服务器。

## 限制

- 视频下载只支持可直接访问的媒体文件。
- `blob:`、`MediaSource`、`m3u8`、DRM、加密分片流等内容可能无法直接保存为完整 MP4。
- AI 识别和生图预览会受到所选模型服务商的额度、地区和频率限制影响。

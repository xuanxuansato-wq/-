const DEFAULT_SETTINGS = {
  provider: "gemini",
  apiKey: "",
  model: "gemini-2.5-flash",
  baseUrl: "https://generativelanguage.googleapis.com/v1beta",
  imagePreviewProvider: "gpt",
  imagePreviewApiKey: "",
  imagePreviewBaseUrl: "https://api.openai.com/v1",
  imagePreviewModel: "gpt-image-1.5",
  imagePreviewSize: "ratio-1-1",
  imagePreviewQuality: "low",
  maxVideoFrames: 18,
  maxFrameSize: 768
};

const OPENAI_DEFAULT_BASE_URL = "https://api.openai.com/v1";
const GEMINI_DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const ARK_DEFAULT_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";
const QWEN_DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const PROVIDER_PRESETS = {
  gemini: {
    runtime: "gemini",
    baseUrl: GEMINI_DEFAULT_BASE_URL,
    model: "gemini-2.5-flash",
    imagePreviewModel: "gemini-2.5-flash-image",
    imagePreviewSize: "auto",
    imagePreviewQuality: "auto"
  },
  gpt: {
    runtime: "openai-compatible",
    baseUrl: OPENAI_DEFAULT_BASE_URL,
    model: "gpt-4.1-mini",
    imagePreviewModel: "gpt-image-1.5",
    imagePreviewSize: "ratio-1-1",
    imagePreviewQuality: "low"
  },
  doubao: {
    runtime: "openai-compatible",
    baseUrl: ARK_DEFAULT_BASE_URL,
    model: "doubao-1-5-vision-pro-32k-250115",
    imagePreviewModel: "doubao-seedream-4-0-250828",
    imagePreviewSize: "ratio-1-1",
    imagePreviewQuality: "auto"
  },
  jimeng: {
    runtime: "openai-compatible",
    baseUrl: ARK_DEFAULT_BASE_URL,
    model: "doubao-1-5-vision-pro-32k-250115",
    imagePreviewModel: "doubao-seedream-4-0-250828",
    imagePreviewSize: "ratio-1-1",
    imagePreviewQuality: "auto"
  },
  qwen: {
    runtime: "openai-compatible",
    baseUrl: QWEN_DEFAULT_BASE_URL,
    model: "qwen-vl-plus",
    imagePreviewModel: "qwen-image",
    imagePreviewSize: "ratio-1-1",
    imagePreviewQuality: "auto"
  },
  "openai-compatible": {
    runtime: "openai-compatible",
    baseUrl: OPENAI_DEFAULT_BASE_URL,
    model: "gpt-4.1-mini",
    imagePreviewModel: "gpt-image-1.5",
    imagePreviewSize: "ratio-1-1",
    imagePreviewQuality: "low"
  }
};
const PROVIDERS = new Set(Object.keys(PROVIDER_PRESETS));
const IMAGE_PREVIEW_PROVIDERS = new Set(["gpt", "doubao", "jimeng", "gemini", "openai-compatible"]);
const IMAGE_PREVIEW_SIZES = new Set([
  "auto",
  "ratio-1-1",
  "ratio-9-16",
  "ratio-16-9",
  "ratio-3-4",
  "ratio-4-3",
  "1024x1024",
  "1024x1536",
  "1536x1024",
  "2048x2048",
  "2K",
  "4K"
]);
const IMAGE_PREVIEW_QUALITIES = new Set(["auto", "low", "medium", "high"]);
const MEDIA_CANDIDATE_TTL_MS = 5 * 60 * 1000;
const MAX_MEDIA_CANDIDATES_PER_TAB = 40;
const mediaCandidatesByTab = new Map();

globalThis.addEventListener?.("error", (event) => {
  console.error("[PromptLens Jimeng] Service worker error:", event.error || event.message);
});

globalThis.addEventListener?.("unhandledrejection", (event) => {
  console.error("[PromptLens Jimeng] Service worker rejection:", event.reason);
});

safeAddListener(chrome.runtime?.onInstalled, () => {
  ensureDefaultSettings().catch((error) => {
    console.error("[PromptLens Jimeng] Failed to initialize settings:", error);
  });
});

async function ensureDefaultSettings() {
  const stored = await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS));
  const missing = {};

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    if (!(key in stored)) {
      missing[key] = value;
    }
  }

  if (Object.keys(missing).length > 0) {
    await chrome.storage.local.set(missing);
  }
}

safeAddListener(chrome.runtime?.onMessage, (message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error) => {
      const normalizedError = normalizeRuntimeError(error);
      sendResponse({ ok: false, error: normalizedError.message || "Unknown error" });
    });

  return true;
});

function safeAddListener(event, listener, ...args) {
  if (!event?.addListener) return false;

  try {
    event.addListener(listener, ...args);
    return true;
  } catch (error) {
    console.warn("[PromptLens Jimeng] Listener registration skipped:", error);
    return false;
  }
}

function normalizeRuntimeError(error) {
  if (error?.promptLensUserFacing) {
    return error;
  }

  if (isRetryableApiError(error)) {
    return normalizeApiError(error);
  }

  const message = String(error?.message || "");
  if (/String contains non ISO-8859-1 code point|Failed to read the 'headers' property/i.test(message)) {
    return new Error("API Key 或请求头里包含中文、全角字符、空格或不可见字符。请在设置页重新粘贴纯净的 API Key 后保存。");
  }

  if (/quota|high demand|overloaded|busy|try again later|temporar|rate.?limit|timeout/i.test(message)) {
    return normalizeApiError(createApiError(message, 503));
  }

  return error instanceof Error ? error : new Error(message || "Unknown error");
}

async function handleMessage(message, sender) {
  switch (message?.type) {
    case "get-settings":
      return getSettings();
    case "save-settings":
      return saveSettings(message.payload || {});
    case "open-options":
      await chrome.runtime.openOptionsPage();
      return { opened: true };
    case "get-media-candidates":
      return getMediaCandidates(sender?.tab?.id);
    case "capture-visible-tab":
      return captureVisibleTab(sender, message.payload || {});
    case "analyze-image":
      return analyzeImage(message.payload || {}, sender);
    case "analyze-video":
      return analyzeVideo(message.payload || {}, sender);
    case "analyze-storyboard-image":
      return analyzeStoryboardImage(message.payload || {});
    case "rewrite-storyboard-shots":
      return rewriteStoryboardShots(message.payload || {});
    case "generate-image-preview":
      return generateImagePreview(message.payload || {});
    case "download-video":
      return downloadVideo(message.payload || {});
    case "open-merge-tool":
      return openMergeTool(message.payload || {});
    case "get-merge-job":
      return getMergeJob();
    case "open-storyboard-tool":
      return openStoryboardTool(message.payload || {});
    case "get-storyboard-job":
      return getStoryboardJob();
    case "download-media-file":
      return downloadMediaFile(message.payload || {});
    default:
      throw new Error(`不支持的消息类型：${message?.type || "empty"}`);
  }
}

async function captureVisibleTab(sender, payload = {}) {
  const windowId = sender?.tab?.windowId;
  if (!Number.isInteger(windowId)) {
    throw new Error("没有拿到当前标签页窗口，无法使用截图抽帧兜底。");
  }

  if (!chrome.tabs?.captureVisibleTab) {
    throw new Error("当前浏览器不支持标签页截图抽帧。");
  }

  const format = payload.format === "png" ? "png" : "jpeg";
  const quality = clampNumber(payload.quality, 50, 100, 88);

  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format, quality });
    return { dataUrl };
  } catch (error) {
    throw new Error(`截图抽帧失败：${error?.message || error}`);
  }
}

async function openMergeTool(payload) {
  const job = {
    title: safeText(payload.title || "merged-video"),
    pageUrl: normalizeUrl(payload.pageUrl || ""),
    candidates: Array.isArray(payload.candidates) ? payload.candidates.slice(0, 30) : [],
    picks: isPlainObject(payload.picks) ? payload.picks : {},
    autoPick: Boolean(payload.autoPick),
    createdAt: Date.now()
  };

  await chrome.storage.local.set({ mergeJob: job });
  const tab = await chrome.tabs.create({ url: chrome.runtime.getURL("merge.html") });
  return { tabId: tab.id };
}

async function getMergeJob() {
  const data = await chrome.storage.local.get("mergeJob");
  return data.mergeJob || { title: "merged-video", pageUrl: "", candidates: [] };
}

async function openStoryboardTool(payload) {
  const job = {
    title: safeText(payload.title || payload.pageTitle || "分镜脚本"),
    pageTitle: safeText(payload.pageTitle || ""),
    pageUrl: normalizeUrl(payload.pageUrl || ""),
    sourceLocator: isPlainObject(payload.sourceLocator) ? payload.sourceLocator : {},
    context: isPlainObject(payload.context) ? payload.context : {},
    shots: Array.isArray(payload.shots) ? payload.shots.slice(0, 80) : [],
    frames: Array.isArray(payload.frames) ? payload.frames.slice(0, 40) : [],
    prompts: isPlainObject(payload.prompts) ? payload.prompts : {},
    frameVoiceovers: Array.isArray(payload.frameVoiceovers) ? payload.frameVoiceovers.slice(0, 80) : [],
    raw: isPlainObject(payload.raw) ? payload.raw : {},
    clipStart: Number.isFinite(payload.clipStart) ? payload.clipStart : null,
    clipEnd: Number.isFinite(payload.clipEnd) ? payload.clipEnd : null,
    clipSeconds: Number.isFinite(payload.clipSeconds) ? payload.clipSeconds : null,
    createdAt: Date.now()
  };

  await chrome.storage.local.set({ storyboardJob: job });
  const tab = await chrome.tabs.create({ url: chrome.runtime.getURL("storyboard.html") });
  return { tabId: tab.id };
}

async function getStoryboardJob() {
  const data = await chrome.storage.local.get("storyboardJob");
  return data.storyboardJob || { title: "分镜脚本", pageUrl: "", context: {}, shots: [], frames: [] };
}

function rememberMediaResponse(details) {
  if (!details || details.tabId < 0 || !details.url) return;

  const contentType = getResponseHeader(details.responseHeaders, "content-type");
  const contentLength = getResponseHeader(details.responseHeaders, "content-length");
  const kind = classifyMediaUrl(details.url, contentType, details.type);

  if (!kind) return;

  const now = Date.now();
  const next = (mediaCandidatesByTab.get(details.tabId) || [])
    .filter((candidate) => now - candidate.detectedAt < MEDIA_CANDIDATE_TTL_MS && candidate.url !== details.url);

  next.unshift({
    url: details.url,
    kind,
    contentType,
    contentLength: contentLength ? Number(contentLength) || null : null,
    mime: getMediaMimeFromUrl(details.url),
    qualityLabel: getMediaQualityLabel(details.url),
    source: "network",
    detectedAt: now
  });

  mediaCandidatesByTab.set(details.tabId, next.slice(0, MAX_MEDIA_CANDIDATES_PER_TAB));
}

function getMediaCandidates(tabId) {
  if (!Number.isInteger(tabId) || tabId < 0) {
    return [];
  }

  const now = Date.now();
  const candidates = (mediaCandidatesByTab.get(tabId) || []).filter(
    (candidate) => now - candidate.detectedAt < MEDIA_CANDIDATE_TTL_MS
  );
  mediaCandidatesByTab.set(tabId, candidates);
  return candidates;
}

function classifyMediaUrl(url, contentType, resourceType) {
  const type = String(contentType || "").split(";")[0].trim().toLowerCase();
  const value = String(url || "");
  const urlMime = getMediaMimeFromUrl(value);

  if (isDisallowedDownloadUrl(value)) return "";
  if (isSegmentedVideoUrl(value) || /mpegurl|m3u8/i.test(type) || /mpegurl|m3u8/i.test(urlMime)) return "stream";
  if (urlMime.startsWith("audio/")) return "audio";
  if (urlMime.startsWith("video/")) return "mp4";
  if (type.startsWith("audio/")) return "audio";
  if (type.startsWith("video/")) return "mp4";
  if ((type === "application/octet-stream" || !type) && looksLikeMp4Url(value)) return "mp4";
  if (resourceType === "media" && looksLikeMp4Url(value)) return "mp4";
  return "";
}

function getResponseHeader(headers, name) {
  const target = String(name || "").toLowerCase();
  const header = (headers || []).find((item) => String(item.name || "").toLowerCase() === target);
  return header?.value || "";
}

function getMediaQualityLabel(url) {
  try {
    const parsedUrl = new URL(url);
    const qualityLabel = parsedUrl.searchParams.get("quality_label") || parsedUrl.searchParams.get("qualityLabel");
    if (qualityLabel) return qualityLabel;

    const quality = parsedUrl.searchParams.get("quality");
    const qualityMap = {
      tiny: "144p",
      small: "240p",
      medium: "360p",
      large: "480p",
      hd720: "720p",
      hd1080: "1080p",
      hd1440: "1440p",
      hd2160: "2160p",
      highres: "4320p"
    };
    return qualityMap[String(quality || "").toLowerCase()] || "";
  } catch (error) {
    return "";
  }
}

async function getSettings() {
  const stored = await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS));
  const settings = { ...DEFAULT_SETTINGS, ...stored };
  settings.provider = PROVIDERS.has(settings.provider) ? settings.provider : DEFAULT_SETTINGS.provider;
  const preset = getProviderPreset(settings.provider);
  settings.baseUrl = String(settings.baseUrl || preset.baseUrl).trim();
  settings.model = String(settings.model || preset.model).trim();
  settings.apiKey = sanitizeCredential(settings.apiKey);
  const hasExplicitImagePreviewProvider = isImagePreviewProvider(stored.imagePreviewProvider);
  settings.imagePreviewProvider = normalizeImagePreviewProvider(
    hasExplicitImagePreviewProvider ? stored.imagePreviewProvider : isImagePreviewProvider(settings.provider) ? settings.provider : DEFAULT_SETTINGS.imagePreviewProvider
  );
  const imagePreviewPreset = getProviderPreset(settings.imagePreviewProvider);
  const canReuseRecognitionConfig = areEquivalentProviders(settings.imagePreviewProvider, settings.provider);
  const storedImagePreviewBaseUrl = hasExplicitImagePreviewProvider ? String(stored.imagePreviewBaseUrl || "").trim() : "";
  settings.imagePreviewBaseUrl = String(storedImagePreviewBaseUrl || (canReuseRecognitionConfig ? settings.baseUrl : imagePreviewPreset.baseUrl)).trim();
  settings.imagePreviewApiKey = sanitizeCredential(settings.imagePreviewApiKey || (canReuseRecognitionConfig ? settings.apiKey : ""));
  settings.imagePreviewModel = String(hasExplicitImagePreviewProvider && stored.imagePreviewModel ? stored.imagePreviewModel : imagePreviewPreset.imagePreviewModel).trim();
  settings.imagePreviewSize = IMAGE_PREVIEW_SIZES.has(hasExplicitImagePreviewProvider ? stored.imagePreviewSize : "")
    ? stored.imagePreviewSize
    : imagePreviewPreset.imagePreviewSize;
  settings.imagePreviewQuality = IMAGE_PREVIEW_QUALITIES.has(hasExplicitImagePreviewProvider ? stored.imagePreviewQuality : "")
    ? settings.imagePreviewQuality
    : imagePreviewPreset.imagePreviewQuality;
  settings.maxVideoFrames = clampNumber(settings.maxVideoFrames, 1, 24, DEFAULT_SETTINGS.maxVideoFrames);
  settings.maxFrameSize = clampNumber(settings.maxFrameSize, 384, 1280, DEFAULT_SETTINGS.maxFrameSize);
  return settings;
}

async function saveSettings(payload) {
  const provider = PROVIDERS.has(payload.provider) ? payload.provider : DEFAULT_SETTINGS.provider;
  const preset = getProviderPreset(provider);
  const imagePreviewProvider = normalizeImagePreviewProvider(payload.imagePreviewProvider || DEFAULT_SETTINGS.imagePreviewProvider);
  const imagePreviewPreset = getProviderPreset(imagePreviewProvider);
  const next = {
    provider,
    apiKey: sanitizeCredential(payload.apiKey),
    model: String(payload.model || "").trim() || preset.model,
    baseUrl: String(payload.baseUrl || "").trim() || preset.baseUrl,
    imagePreviewProvider,
    imagePreviewApiKey: sanitizeCredential(payload.imagePreviewApiKey),
    imagePreviewBaseUrl: String(payload.imagePreviewBaseUrl || "").trim() || imagePreviewPreset.baseUrl,
    imagePreviewModel: String(payload.imagePreviewModel || "").trim() || imagePreviewPreset.imagePreviewModel,
    imagePreviewSize: IMAGE_PREVIEW_SIZES.has(payload.imagePreviewSize) ? payload.imagePreviewSize : imagePreviewPreset.imagePreviewSize,
    imagePreviewQuality: IMAGE_PREVIEW_QUALITIES.has(payload.imagePreviewQuality)
      ? payload.imagePreviewQuality
      : imagePreviewPreset.imagePreviewQuality,
    maxVideoFrames: clampNumber(payload.maxVideoFrames, 1, 24, DEFAULT_SETTINGS.maxVideoFrames),
    maxFrameSize: clampNumber(payload.maxFrameSize, 384, 1280, DEFAULT_SETTINGS.maxFrameSize)
  };

  await chrome.storage.local.set(next);
  return getSettings();
}

function getProviderPreset(provider) {
  return PROVIDER_PRESETS[provider] || PROVIDER_PRESETS[DEFAULT_SETTINGS.provider];
}

function normalizeImagePreviewProvider(provider) {
  if (provider === "openai-compatible") return "gpt";
  return IMAGE_PREVIEW_PROVIDERS.has(provider) ? provider : DEFAULT_SETTINGS.imagePreviewProvider;
}

function isImagePreviewProvider(provider) {
  return IMAGE_PREVIEW_PROVIDERS.has(provider);
}

function areEquivalentProviders(left, right) {
  return normalizeImagePreviewProvider(left) === normalizeImagePreviewProvider(right);
}

function sanitizeCredential(value) {
  return String(value || "")
    .trim()
    .replace(/^Bearer\s+/i, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, "")
    .replace(/[^\x21-\x7E]/g, "");
}

async function analyzeImage(payload) {
  const settings = await getSettings();
  ensureConfigured(settings);

  const imagePart = await readImagePart({
    imageUrl: payload.imageUrl,
    imageDataUrl: payload.imageDataUrl,
    pageUrl: payload.pageUrl
  });

  const prompt = buildImagePrompt(payload);
  const rawText = await callVisionModel(settings, prompt, [imagePart]);
  return normalizeModelResult(parseLooseJson(rawText), rawText, "image");
}

async function analyzeStoryboardImage(payload) {
  const settings = await getSettings();
  ensureConfigured(settings);

  const imagePart = await readImagePart({
    imageUrl: payload.imageUrl,
    imageDataUrl: payload.imageDataUrl,
    pageUrl: payload.pageUrl,
    label: payload.label || "storyboard asset"
  });

  const prompt = buildStoryboardImagePrompt(payload);
  const rawText = await callVisionModel(settings, prompt, [imagePart]);
  return normalizeStoryboardImageResult(parseLooseJson(rawText), rawText);
}

async function analyzeVideo(payload) {
  const settings = await getSettings();
  ensureConfigured(settings);

  const frameParts = [];
  const maxFrameCount = getVideoFrameBudget(payload.clipSeconds, settings.maxVideoFrames);
  const frames = Array.isArray(payload.frames) ? payload.frames.slice(0, maxFrameCount) : [];

  for (const frame of frames) {
    if (!frame?.dataUrl) continue;
    const imagePart = parseDataUrl(frame.dataUrl);
    frameParts.push({
      ...imagePart,
      label: `frame ${frameParts.length + 1}`,
      time: Number.isFinite(frame.time) ? frame.time : null
    });
  }

  if (frameParts.length === 0 && payload.posterUrl) {
    frameParts.push(
      await readImagePart({
        imageUrl: payload.posterUrl,
        pageUrl: payload.pageUrl,
        label: "poster"
      })
    );
  }

  if (frameParts.length === 0) {
    throw new Error(
      payload.sampleError ||
        "没有拿到可分析的视频画面。请在视频加载后重试，或换一个允许页面抽帧的视频。"
    );
  }

  const prompt = buildVideoPrompt(payload, frameParts);
  const rawText = await callVisionModel(settings, prompt, frameParts);
  return normalizeModelResult(parseLooseJson(rawText), rawText, "video");
}

async function rewriteStoryboardShots(payload) {
  const settings = await getSettings();
  ensureConfigured(settings);

  const prompt = buildStoryboardRewritePrompt(payload);
  const rawText = await callVisionModel(settings, prompt, []);
  return normalizeStoryboardRewriteResult(parseLooseJson(rawText), rawText, payload);
}

async function generateImagePreview(payload) {
  const settings = await getSettings();
  ensureImagePreviewConfigured(settings);

  const prompt = String(payload.prompt || "").trim();
  if (!prompt) {
    throw new Error("请先填写或生成一段中文提示词，再生成图片预览。");
  }

  if (settings.imagePreviewProvider === "gemini") {
    return generateGeminiImagePreview(settings, prompt);
  }

  return generateOpenAICompatibleImagePreview(settings, prompt);
}

async function generateOpenAICompatibleImagePreview(settings, prompt) {
  const endpoint = new URL("images/generations", ensureTrailingSlash(settings.imagePreviewBaseUrl)).toString();
  const requestBody = buildImagePreviewRequestBody(settings, prompt);
  const data = await fetchJsonWithRetry(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.imagePreviewApiKey}`
    },
    body: JSON.stringify(requestBody)
  });

  const image = Array.isArray(data?.data) ? data.data[0] : null;
  const base64Image = image?.b64_json || image?.b64;
  const imageUrl = image?.url || "";

  if (base64Image) {
    return {
      dataUrl: `data:image/png;base64,${base64Image}`,
      imageUrl: "",
      revisedPrompt: image?.revised_prompt || "",
      model: settings.imagePreviewModel
    };
  }

  if (imageUrl) {
    return {
      dataUrl: imageUrl,
      imageUrl,
      revisedPrompt: image?.revised_prompt || "",
      model: settings.imagePreviewModel
    };
  }

  throw new Error("服务商没有返回可预览的图片。");
}

async function generateGeminiImagePreview(settings, prompt) {
  const endpoint = new URL(
    `models/${encodeURIComponent(settings.imagePreviewModel)}:generateContent`,
    ensureTrailingSlash(settings.imagePreviewBaseUrl)
  ).toString();

  const data = await fetchJsonWithRetry(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": settings.imagePreviewApiKey
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: prompt.slice(0, 32000) }]
        }
      ],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"]
      }
    })
  });

  const parts = data?.candidates?.[0]?.content?.parts || data?.parts || [];
  const imagePart = parts.find((part) => part.inline_data?.data || part.inlineData?.data);
  const inlineData = imagePart?.inline_data || imagePart?.inlineData;

  if (!inlineData?.data) {
    throw new Error("Gemini 没有返回可预览的图片。请确认生图模型支持图片输出。");
  }

  return {
    dataUrl: `data:${inlineData.mime_type || inlineData.mimeType || "image/png"};base64,${inlineData.data}`,
    imageUrl: "",
    revisedPrompt: "",
    model: settings.imagePreviewModel
  };
}

function buildImagePreviewRequestBody(settings, prompt) {
  const preset = getProviderPreset(settings.imagePreviewProvider);
  const promptText = prompt.slice(0, 32000);
  const sizeConfig = resolveImagePreviewSize(settings.imagePreviewProvider, settings.imagePreviewSize || preset.imagePreviewSize);

  if (settings.imagePreviewProvider === "doubao" || settings.imagePreviewProvider === "jimeng") {
    return {
      model: settings.imagePreviewModel,
      prompt: promptText,
      size: sizeConfig.size,
      ...(sizeConfig.ratio ? { ratio: sizeConfig.ratio } : {}),
      response_format: "b64_json",
      stream: false,
      watermark: false
    };
  }

  return {
    model: settings.imagePreviewModel,
    prompt: promptText,
    n: 1,
    size: sizeConfig.size,
    quality: settings.imagePreviewQuality || preset.imagePreviewQuality
  };
}

function resolveImagePreviewSize(provider, value) {
  const size = String(value || "auto");

  if (provider === "doubao" || provider === "jimeng") {
    const ratioMap = {
      "ratio-1-1": "1:1",
      "ratio-9-16": "9:16",
      "ratio-16-9": "16:9",
      "ratio-3-4": "3:4",
      "ratio-4-3": "4:3"
    };

    if (ratioMap[size]) {
      return { size: "2K", ratio: ratioMap[size] };
    }

    return { size: size === "auto" ? "2K" : size };
  }

  if (provider === "gemini") {
    return { size: "auto" };
  }

  const openAISizeMap = {
    "ratio-1-1": "1024x1024",
    "ratio-9-16": "1024x1536",
    "ratio-16-9": "1536x1024",
    "ratio-3-4": "1024x1536",
    "ratio-4-3": "1536x1024",
    "2048x2048": "1024x1024",
    "2K": "1024x1024",
    "4K": "1024x1024"
  };

  return { size: openAISizeMap[size] || size || "1024x1024" };
}

async function downloadVideo(payload) {
  const videoUrl = normalizeUrl(payload.videoUrl, payload.pageUrl);

  if (!videoUrl) {
    throw new Error("没有找到可下载的视频地址。");
  }

  if (!/^https?:|^data:/i.test(videoUrl)) {
    throw new Error("当前视频地址不是直接文件链接，浏览器后台无法下载。");
  }

  if (isSegmentedVideoUrl(videoUrl)) {
    throw new Error("当前视频是 m3u8 或分片流，需要先合并分片，浏览器下载管理器不能直接保存为 MP4。");
  }

  const mp4 = await probeMp4Url(videoUrl, payload.pageUrl);

  const downloadId = await chrome.downloads.download({
    url: mp4.url,
    filename: buildVideoFilename(payload.filename),
    saveAs: true
  });

  return { downloadId, url: mp4.url, contentType: mp4.contentType };
}

async function downloadMediaFile(payload) {
  const url = normalizeUrl(payload.url);
  const kind = String(payload.kind || "").toLowerCase();
  if (!/^https?:/i.test(url) && !(kind === "image" && /^data:image\//i.test(url))) {
    throw new Error("只能下载 http/https 媒体地址，或图片 data URL。");
  }

  if (kind !== "image" && isDisallowedDownloadUrl(url)) {
    throw new Error("当前地址不是媒体文件。");
  }

  const filename = buildMediaFilename(payload.filename, kind, url);
  const downloadId = await chrome.downloads.download({
    url,
    filename,
    saveAs: payload.saveAs !== false
  });

  return { downloadId };
}

async function probeMp4Url(videoUrl, pageUrl) {
  const blockedReason = getBlockedDownloadReason(videoUrl);
  if (blockedReason) {
    throw new Error(blockedReason);
  }

  let response = null;
  let lastError = null;

  for (const request of [
    { method: "HEAD" },
    { method: "GET", headers: { Range: "bytes=0-1" } }
  ]) {
    try {
      response = await fetch(videoUrl, {
        method: request.method,
        credentials: "include",
        redirect: "follow",
        referrer: pageUrl || undefined,
        referrerPolicy: "no-referrer-when-downgrade",
        headers: {
          Accept: "video/mp4,video/*;q=0.8,*/*;q=0.1",
          ...(request.headers || {})
        }
      });

      const result = validateMp4Response(response, videoUrl);
      await cancelResponseBody(response);
      if (result.ok) {
        return result;
      }

      lastError = new Error(result.message);
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(
    `没有验证到可播放的 MP4 文件。${lastError?.message || "目标地址可能是脚本、网页、分片流或需要站点鉴权。"}`
  );
}

function validateMp4Response(response, originalUrl) {
  const contentType = String(response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const finalUrl = response.url || originalUrl;
  const statusOk = response.ok || response.status === 206;

  if (!statusOk) {
    return {
      ok: false,
      message: `视频地址请求失败：HTTP ${response.status}`
    };
  }

  if (isSegmentedVideoUrl(finalUrl)) {
    return {
      ok: false,
      message: "目标地址是 m3u8 或分片流，不是 MP4 文件。"
    };
  }

  if (isBlockedContentType(contentType)) {
    return {
      ok: false,
      message: `目标地址返回的是 ${contentType || "未知类型"}，不是可播放 MP4。`
    };
  }

  if (contentType === "video/mp4") {
    return {
      ok: true,
      url: finalUrl,
      contentType
    };
  }

  if ((contentType === "application/octet-stream" || !contentType) && looksLikeMp4Url(finalUrl)) {
    return {
      ok: true,
      url: finalUrl,
      contentType: contentType || "application/octet-stream"
    };
  }

  return {
    ok: false,
    message: `目标地址返回的是 ${contentType || "未知类型"}，不是 MP4 视频。`
  };
}

function ensureConfigured(settings) {
  if (!settings.apiKey) {
    throw new Error("还没有配置识别模型 API Key，请先打开扩展设置页。");
  }

  if (!settings.model) {
    throw new Error("还没有配置识别模型名称，请先打开扩展设置页。");
  }
}

function ensureImagePreviewConfigured(settings) {
  if (!isImagePreviewProvider(settings.imagePreviewProvider)) {
    throw new Error("请先在设置页选择生图预览 API 服务商。");
  }

  if (!settings.imagePreviewBaseUrl) {
    throw new Error("还没有配置生图预览 Base URL，请先打开扩展设置页。");
  }

  if (!settings.imagePreviewApiKey) {
    throw new Error("还没有配置生图预览 API Key，请先打开扩展设置页。");
  }

  if (!settings.imagePreviewModel) {
    throw new Error("还没有配置生图预览模型，请在设置页填写对应服务商的生图模型。");
  }
}

async function readImagePart({ imageUrl, imageDataUrl, pageUrl, label }) {
  if (imageDataUrl) {
    return { ...parseDataUrl(imageDataUrl), label };
  }

  const url = normalizeUrl(imageUrl, pageUrl);
  if (!url) {
    throw new Error("缺少图片地址。");
  }

  const response = await fetch(url, {
    credentials: "include",
    headers: {
      Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
    }
  });

  if (!response.ok) {
    throw new Error(`取图失败：HTTP ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const mimeType = normalizeMimeType(response.headers.get("content-type"), url, "image/jpeg");

  return {
    mimeType,
    data: arrayBufferToBase64(arrayBuffer),
    label
  };
}

function parseDataUrl(dataUrl) {
  const match = String(dataUrl || "").match(/^data:([^;,]+)(?:;[^,]*)?;base64,(.+)$/i);
  if (!match) {
    throw new Error("无效的 data URL。");
  }

  return {
    mimeType: match[1],
    data: match[2]
  };
}

async function callVisionModel(settings, prompt, imageParts) {
  if (getProviderPreset(settings.provider).runtime === "openai-compatible") {
    return callOpenAICompatible(settings, prompt, imageParts);
  }

  return callGemini(settings, prompt, imageParts);
}

async function callGemini(settings, prompt, imageParts) {
  const endpoint = new URL(
    `models/${encodeURIComponent(settings.model)}:generateContent`,
    ensureTrailingSlash(settings.baseUrl)
  ).toString();

  const parts = [
    { text: prompt },
    ...imageParts.map((part) => ({
      inline_data: {
        mime_type: part.mimeType,
        data: part.data
      }
    }))
  ];

  const data = await fetchJsonWithRetry(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": settings.apiKey
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: { temperature: 0.2 }
    })
  });

  const text = (data?.candidates?.[0]?.content?.parts || [])
    .map((part) => part.text || "")
    .filter(Boolean)
    .join("\n")
    .trim();

  if (!text) {
    throw new Error("模型没有返回可解析的文本。");
  }

  return text;
}

async function callOpenAICompatible(settings, prompt, imageParts) {
  const endpoint = new URL("chat/completions", ensureTrailingSlash(settings.baseUrl)).toString();
  const content = [
    { type: "text", text: prompt },
    ...imageParts.map((part) => ({
      type: "image_url",
      image_url: {
        url: `data:${part.mimeType};base64,${part.data}`
      }
    }))
  ];

  const data = await fetchJsonWithRetry(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`
    },
    body: JSON.stringify({
      model: settings.model,
      messages: [{ role: "user", content }],
      temperature: 0.2
    })
  });

  const messageContent = data?.choices?.[0]?.message?.content;

  if (typeof messageContent === "string") {
    return messageContent.trim();
  }

  if (Array.isArray(messageContent)) {
    return messageContent
      .map((part) => part.text || "")
      .filter(Boolean)
      .join("\n")
      .trim();
  }

  throw new Error("模型没有返回可解析的文本。");
}

async function fetchJsonWithRetry(endpoint, options) {
  let lastError = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      validateRequestHeaders(options?.headers);
      const response = await fetch(endpoint, options);
      return await parseApiResponse(response);
    } catch (error) {
      lastError = error;

      if (attempt >= 2 || !isRetryableApiError(error)) {
        break;
      }

      await sleep(getRetryDelayMs(error, attempt));
    }
  }

  throw normalizeApiError(lastError);
}

function validateRequestHeaders(headers) {
  if (!headers || typeof headers !== "object") return;

  for (const [name, value] of Object.entries(headers)) {
    const headerValue = Array.isArray(value) ? value.join(", ") : String(value);
    if (/[^\x00-\xFF]/.test(headerValue)) {
      const label = /authorization|x-goog-api-key/i.test(name) ? "API Key" : `请求头 ${name}`;
      throw new Error(`${label} 包含中文、全角字符或不可用字符。请回到设置页重新复制纯英文/数字格式的 Key 后保存。`);
    }
  }
}

async function parseApiResponse(response) {
  const text = await response.text();
  let data = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch (error) {
    if (!response.ok) {
      throw createApiError(text || `请求失败：HTTP ${response.status}`, response.status);
    }
    throw error;
  }

  if (!response.ok) {
    throw createApiError(data?.error?.message || data?.message || `请求失败：HTTP ${response.status}`, response.status);
  }

  return data;
}

function createApiError(message, status) {
  const error = new Error(message);
  error.status = status;
  error.providerMessage = message;
  return error;
}

function isRetryableApiError(error) {
  const status = Number(error?.status);
  const message = String(error?.message || "");
  return (
    [429, 500, 502, 503, 504].includes(status) ||
    /quota|high demand|overloaded|busy|try again later|temporar|rate.?limit|timeout/i.test(message)
  );
}

function normalizeApiError(error) {
  if (error?.promptLensUserFacing) {
    return error;
  }

  const message = String(error?.message || "请求识别模型失败。");

  if (isQuotaError(error)) {
    return createUserFacingError(
      `当前模型额度不足或触发限流。请等待${formatRetryWait(error)}后重试，或在设置页切换 API Key、模型/服务商，或升级 Gemini 额度。原始信息：${message}`
    );
  }

  if (isRetryableApiError(error)) {
    return createUserFacingError(
      `识别模型当前繁忙或请求过快，已自动重试仍失败。请稍后再试，或在设置页切换更空闲的模型/服务商。原始信息：${message}`
    );
  }

  return error instanceof Error ? error : new Error(message);
}

function createUserFacingError(message) {
  const error = new Error(message);
  error.promptLensUserFacing = true;
  return error;
}

function isQuotaError(error) {
  return /quota|free_tier|rate.?limit|billing|limit:/i.test(String(error?.message || ""));
}

function getRetryDelayMs(error, attempt) {
  const retrySeconds = getRetrySeconds(error);
  if (Number.isFinite(retrySeconds)) {
    return Math.min(30000, Math.max(1000, Math.ceil(retrySeconds * 1000) + 500));
  }

  return 1200 * (attempt + 1);
}

function getRetrySeconds(error) {
  const message = String(error?.message || "");
  const retryIn = message.match(/retry in\s+([0-9.]+)\s*s/i);
  if (retryIn) {
    const seconds = Number.parseFloat(retryIn[1]);
    if (Number.isFinite(seconds)) return seconds;
  }

  const retryAfter = message.match(/retry-after[:=]\s*([0-9.]+)/i);
  if (retryAfter) {
    const seconds = Number.parseFloat(retryAfter[1]);
    if (Number.isFinite(seconds)) return seconds;
  }

  return NaN;
}

function formatRetryWait(error) {
  const seconds = getRetrySeconds(error);
  if (!Number.isFinite(seconds)) return "一段时间";
  return `约 ${Math.ceil(seconds)} 秒`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildImagePrompt(payload) {
  return [
    "你是资深视觉导演和提示词工程师。请分析上传图片，反推可直接用于即梦生成的提示词。",
    "只输出 JSON，不要 Markdown，不要解释。",
    "要求：描述必须具体、可观察、可复用；不要编造真实人物姓名、品牌、版权角色或不可确认信息。",
    "请同时保留主体、场景、风格、构图、镜头、光线、色彩、材质、氛围和生成控制词。",
    `网页标题：${safeText(payload.pageTitle || "")}`,
    `图片 alt：${safeText(payload.alt || "")}`,
    "JSON schema:",
    JSON.stringify({
      title: "短标题",
      subject: "主体",
      scene: "场景",
      style: "视觉风格",
      composition: "构图",
      camera: "镜头语言",
      lighting: "光线",
      color: "色彩",
      texture: "材质质感",
      jimengPromptZh: "中文即梦生图提示词，一段话，细节充分",
      keywords: ["关键词"],
      notes: "不确定或需要人工确认的点"
    })
  ].join("\n");
}

function buildStoryboardImagePrompt(payload) {
  return [
    "你是资深分镜导演、广告创意策划和声音设计师。请根据上传图片，反推这一段分镜脚本需要的字段。",
    "只输出 JSON，不要 Markdown，不要解释，不要英文提示词。",
    "必须基于图片可见内容，不要编造真实人物姓名、品牌、版权角色或不可确认信息。",
    "如果图片里没有真实人物，就把主体人物写成画面主体/角色/物体；如果没有明显音乐线索，请根据画面情绪和节奏推测适合的 BGM。",
    `当前镜头标题：${safeText(payload.shotTitle || "")}`,
    `当前镜头时间：${safeText(payload.shotTime || "")}`,
    `原画面描述：${safeText(payload.description || "")}`,
    `原BGM：${safeText(payload.bgm || "")}`,
    `原镜头语言：${safeText(payload.camera || "")}`,
    `修改大纲/故事内容：${safeText(payload.outline || "")}`,
    `已有主体：${safeText(payload.subject || "")}`,
    `已有场景：${safeText(payload.scene || "")}`,
    `已有风格：${safeText(payload.style || "")}`,
    "JSON schema:",
    JSON.stringify({
      subject: "主体人物或主体角色/物体，基于图片内容",
      scene: "场景环境，基于图片内容",
      style: "视觉风格，基于图片内容",
      visualDescription: "画面描述，一段话，包含主体、动作、场景、构图、关键细节",
      bgm: "适合该画面的BGM/音效氛围，包含情绪、节奏、声音元素",
      cameraLanguage: "镜头语言，包含景别、机位、构图、运镜、焦点或转场建议",
      keywords: ["关键词"]
    })
  ].join("\n");
}

function buildStoryboardRewritePrompt(payload) {
  const context = isPlainObject(payload.context) ? payload.context : {};
  const shots = Array.isArray(payload.shots) ? payload.shots.slice(0, 80) : [];
  const shotSummary = shots
    .map((shot, index) => {
      const time = safeText(shot?.time || shot?.镜头时间 || "");
      const description = safeText(shot?.description || shot?.画面描述 || "");
      const camera = safeText(shot?.camera || shot?.镜头语言 || "");
      return [
        `镜头 ${index + 1}`,
        `镜头时间：${time}`,
        `原画面描述：${description}`,
        `原镜头语言：${camera}`
      ].join("\n");
    })
    .join("\n\n");

  return [
    "你是资深分镜导演和短视频创意改稿师。请根据“修改大纲/故事内容”重写分镜。",
    "只输出 JSON，不要 Markdown，不要解释，不要英文提示词。",
    "修改大纲是新的故事内容和创意方向，后续每个镜头都必须围绕这个大纲调整画面描述和镜头语言。",
    "必须保持镜头数量不变，镜头时间原则上沿用原时间；不要新增或删除镜头。",
    "不要把主体、场景、风格、BGM、修改大纲这些全局参考重复写进每一条画面描述；它们只保留在开头全局信息里。",
    "每条镜头要写成可执行的分镜内容：主体在做什么、场景如何推进、动作如何承接故事、镜头如何运动。",
    "如果大纲与原镜头冲突，以大纲为准；如果大纲没有提到的画面细节，可保留原镜头中合理的节奏和构图。",
    `修改大纲/故事内容：${safeText(context.outline || payload.outline || "")}`,
    `全局主体：${safeText(context.subject || "")}`,
    `全局场景：${safeText(context.scene || "")}`,
    `全局风格：${safeText(context.style || "")}`,
    `全局BGM：${safeText(context.bgm || "")}`,
    `现有分镜：\n${shotSummary}`,
    "JSON schema:",
    JSON.stringify({
      outline: "可选，整理后的修改大纲",
      subject: "全局主体，沿用或按大纲微调",
      scene: "全局场景，沿用或按大纲微调",
      style: "全局风格，沿用或按大纲微调",
      bgm: "全局BGM，沿用或按大纲微调",
      shotList: [
        {
          time: "沿用原镜头时间，如 0s-2s",
          description: "按大纲重写后的画面描述，不重复全局参考",
          camera: "按大纲重写后的镜头语言"
        }
      ]
    })
  ].join("\n");
}

function buildVideoPrompt(payload, frameParts) {
  const clipStart = Number.isFinite(payload.clipStart) ? payload.clipStart : null;
  const clipEnd = Number.isFinite(payload.clipEnd) ? payload.clipEnd : null;
  const clipSeconds = Number.isFinite(payload.clipSeconds) ? payload.clipSeconds : null;
  const frameSummary = frameParts
    .map((frame, index) => {
      const absoluteTime = Number.isFinite(frame.time) ? frame.time : null;
      const relativeTime = Number.isFinite(absoluteTime) && Number.isFinite(clipStart) ? Math.max(0, absoluteTime - clipStart) : absoluteTime;
      const time = Number.isFinite(relativeTime) ? `片段内 ${Math.max(0, Math.round(relativeTime))}s` : frame.label || `frame ${index + 1}`;
      return `frame ${index + 1}: ${time}`;
    })
    .join("\n");

  return [
    "你是资深视频导演、分镜师和提示词工程师。请根据上传的视频抽帧，反推可直接用于即梦生成的视频提示词。",
    "只输出 JSON，不要 Markdown，不要解释，不要英文提示词。",
    "任务重点：识别主体、场景、动作变化、镜头运动、节奏、构图、光线、色彩、风格、全局BGM氛围和画面连续性。",
    "BGM 只输出为顶层全局字段 bgm，不要在每个分镜里重复输出。",
    "分镜视频的 shotList 必须只使用这三个核心字段：镜头时间、画面描述、镜头语言。",
    "暂时不要输出口播文案、字幕/OCR逐帧文案、frameVoiceovers、voiceoverScriptZh 或 voiceoverZh。",
    "镜头时间必须按当前识别片段内的相对时间输出：片段起点就是 0s，不要输出原视频的绝对时间，且不要保留小数点。",
    "先提炼全局主体 subject、场景 scene、风格 style，便于用户后续替换后批量改分镜。",
    "不要编造真实人物姓名、品牌、版权角色或不可确认信息；无法确认的内容写成通用描述。",
    `网页标题：${safeText(payload.pageTitle || "")}`,
    `视频地址：${safeText(payload.videoUrl || "")}`,
    `视频总时长：${Number.isFinite(payload.duration) ? `${payload.duration.toFixed(2)}s` : "unknown"}`,
    `识别片段：原视频 ${formatPromptTime(clipStart)} - ${formatPromptTime(clipEnd)}；输出镜头时间请从片段内 0s 开始${Number.isFinite(clipSeconds) ? `，到约 ${Math.max(0, Math.round(clipSeconds))}s 结束` : ""}`,
    `抽帧：\n${frameSummary}`,
    "JSON schema:",
    JSON.stringify({
      title: "短标题",
      subject: "主体，可被用户替换",
      scene: "场景，可被用户替换",
      action: "动作与状态变化",
      cameraMovement: "镜头运动",
      rhythm: "节奏",
      bgm: "全局BGM/音效氛围，一段话，包含音乐风格、节奏、情绪和声音元素",
      style: "视觉风格，可被用户替换",
      lighting: "光线",
      color: "色彩",
      jimengVideoPromptZh: "中文即梦视频生成提示词，一段话，包含主体、动作、镜头、场景和风格",
      coverImagePromptZh: "适合先生成封面或首帧图的中文提示词",
      keywords: ["关键词"],
      shotList: [
        {
          镜头时间: "例如 0s-2s",
          画面描述: "画面内容、主体动作、场景变化",
          镜头语言: "景别、运镜、机位、焦段和转场"
        }
      ],
      notes: "不确定或需要人工确认的点"
    })
  ].join("\n");
}
function normalizeModelResult(parsed, rawText, kind) {
  const source = isPlainObject(parsed) ? parsed : {};
  const prompts = {
    zh:
      firstString(source.jimengPromptZh, source.jimengVideoPromptZh, source.promptZh, source.prompt) ||
      String(rawText || "").trim(),
    coverZh: firstString(source.coverImagePromptZh, source.coverPromptZh),
    frameVoiceovers: []
  };

  return {
    kind,
    title: firstString(source.title, kind === "video" ? "视频反推提示词" : "图片反推提示词"),
    subject: firstString(source.subject),
    scene: firstString(source.scene),
    style: firstString(source.style),
    bgm: firstString(source.bgm, source.BGM, source.music, source.sound, source.audio, source.rhythm),
    camera: firstString(source.camera, source.cameraMovement),
    action: firstString(source.action),
    lighting: firstString(source.lighting),
    color: firstString(source.color),
    prompts,
    keywords: normalizeKeywords(source.keywords),
    shotList: Array.isArray(source.shotList) ? source.shotList : [],
    notes: firstString(source.notes),
    raw: source
  };
}

function normalizeFrameVoiceovers(...sources) {
  const source = sources.find((value) => Array.isArray(value)) || [];
  const normalized = source
    .map((item, index) => {
      if (typeof item === "string") {
        return {
          frame: index + 1,
          time: "",
          visibleText: "",
          voiceover: item.trim()
        };
      }

      if (!isPlainObject(item)) return null;

      return {
        frame: Number.isFinite(Number(item.frame ?? item.index)) ? Number(item.frame ?? item.index) : index + 1,
        time: firstString(item.time, item.timestamp, item.时间),
        visibleText: firstString(item.visibleText, item.ocr, item.subtitle, item.text, item.字幕, item.屏幕文字),
        voiceover: firstString(item.voiceover, item.script, item.narration, item.koubo, item.口播, item.口播文案)
      };
    })
    .filter((item) => item && (item.visibleText || item.voiceover || item.time));

  return dedupeFrameVoiceoverVisibleText(normalized);
}

function dedupeFrameVoiceoverVisibleText(items) {
  const seen = [];

  return items.map((item) => ({
    ...item,
    visibleText: dedupeVisibleText(item.visibleText, seen)
  }));
}

function dedupeVisibleText(value, seen) {
  const source = String(value || "").trim();
  if (!source) return "";

  const segments = splitTextSegments(source);
  if (!segments.length) return "";

  const kept = [];
  for (const segment of segments) {
    if (isRepeatedText(segment, seen)) continue;
    kept.push(segment);
    seen.push(normalizeTextFingerprint(segment));
  }

  return kept.join("，");
}

function splitTextSegments(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .split(/[，,。；;！!？?\n\r]+/u)
    .map((item) => item.trim())
    .filter((item) => item.length > 1);
}

function isRepeatedText(value, seen) {
  const signature = normalizeTextFingerprint(value);
  if (signature.length < 6) return false;

  return seen.some((oldSignature) =>
    signature === oldSignature ||
    (signature.length >= 10 && oldSignature.includes(signature)) ||
    (oldSignature.length >= 10 && signature.includes(oldSignature))
  );
}

function normalizeTextFingerprint(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[\s"'“”‘’【】\[\]（）()《》<>、，,。；;：:！!？?·.\-_/\\|]+/g, "");
}

function normalizeStoryboardImageResult(parsed, rawText) {
  const source = isPlainObject(parsed) ? parsed : {};
  return {
    subject: firstString(source.subject, source.character, source.mainSubject),
    scene: firstString(source.scene, source.environment, source.setting),
    style: firstString(source.style, source.visualStyle),
    description:
      firstString(source.visualDescription, source.description, source.画面描述, source.promptZh, source.prompt) ||
      String(rawText || "").trim(),
    bgm: firstString(source.bgm, source.BGM, source.music, source.sound, source.audio),
    camera: firstString(source.cameraLanguage, source.camera, source.cameraMovement, source.lens, source.镜头语言),
    keywords: normalizeKeywords(source.keywords),
    raw: source
  };
}

function normalizeStoryboardRewriteResult(parsed, rawText, payload) {
  const source = isPlainObject(parsed) ? parsed : {};
  const originalShots = Array.isArray(payload?.shots) ? payload.shots : [];
  const sourceShots = Array.isArray(source.shotList)
    ? source.shotList
    : Array.isArray(source.shots)
      ? source.shots
      : [];
  const shotCount = Math.max(originalShots.length, sourceShots.length);
  const shotList = [];

  for (let index = 0; index < shotCount; index += 1) {
    const original = originalShots[index] || {};
    const rewritten = isPlainObject(sourceShots[index]) ? sourceShots[index] : {};
    shotList.push({
      title: firstString(rewritten.title, rewritten.标题, original.title, `镜头 ${index + 1}`),
      time: firstString(rewritten.time, rewritten.镜头时间, rewritten.shotTime, original.time, original.镜头时间),
      description: firstString(
        rewritten.description,
        rewritten.画面描述,
        rewritten.visualDescription,
        rewritten.visual,
        original.description,
        original.画面描述
      ),
      camera: firstString(
        rewritten.camera,
        rewritten.镜头语言,
        rewritten.cameraLanguage,
        rewritten.cameraMovement,
        original.camera,
        original.镜头语言
      )
    });
  }

  return {
    outline: firstString(source.outline, source.修改大纲, payload?.context?.outline, payload?.outline),
    subject: firstString(source.subject, source.主体, payload?.context?.subject),
    scene: firstString(source.scene, source.场景, payload?.context?.scene),
    style: firstString(source.style, source.风格, payload?.context?.style),
    bgm: firstString(source.bgm, source.BGM, source.music, payload?.context?.bgm),
    shotList,
    raw: source,
    rawText: String(rawText || "").trim()
  };
}

function parseLooseJson(rawText) {
  const source = String(rawText || "").trim();
  if (!source) return null;

  const candidates = buildJsonParseCandidates(source);

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch (error) {
      // Try the next repaired candidate.
    }
  }

  return null;
}

function buildJsonParseCandidates(source) {
  const bases = [
    source,
    stripCodeFence(source),
    repairLooseJsonText(source),
    repairLooseJsonText(stripCodeFence(source))
  ];
  const candidates = [];

  for (const base of bases) {
    if (!base) continue;
    candidates.push(base);
    candidates.push(extractFirstJson(base));
    candidates.push(repairLooseJsonText(extractFirstJson(base)));
  }

  return Array.from(new Set(candidates.map((candidate) => String(candidate || "").trim()).filter(Boolean)));
}

function stripCodeFence(value) {
  return String(value || "")
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

function repairLooseJsonText(value) {
  return String(value || "")
    .replace(/^\uFEFF/, "")
    .replace(/```(?:json)?/gi, "")
    .replace(/```/g, "")
    .replace(/[“”„‟＂]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/"\s*：\s*/g, '": ')
    .replace(/(["}\]\d])\s*，\s*(?=["}\]])/g, "$1,")
    .replace(/,\s*([}\]])/g, "$1")
    .trim();
}

function extractFirstJson(text) {
  const source = String(text || "");
  const start = source.indexOf("{");
  if (start < 0) return source;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < source.length; index += 1) {
    const char = source[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = inString;
      continue;
    }

    if (char === "\"") {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  return source.slice(start);
}

function normalizeKeywords(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/[,，、\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function normalizeUrl(input, pageUrl) {
  const value = String(input || "").trim();
  if (!value) return "";

  try {
    return new URL(value, pageUrl || undefined).toString();
  } catch (error) {
    return value;
  }
}

function normalizeMimeType(contentType, url, fallback) {
  const type = String(contentType || "").split(";")[0].trim().toLowerCase();
  if (type) return type;

  if (/\.png(?:$|\?)/i.test(url)) return "image/png";
  if (/\.webp(?:$|\?)/i.test(url)) return "image/webp";
  if (/\.gif(?:$|\?)/i.test(url)) return "image/gif";
  return fallback;
}

function buildVideoFilename(name) {
  const cleanName = String(name || "")
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.(?:js|mjs|css|html?|json|map|mp4|webm|mov|m4v|mkv|avi)$/i, "")
    .trim()
    .slice(0, 80);
  return `PromptLens/${cleanName || "downloaded-video"}.mp4`;
}

function buildMediaFilename(name, kind, url) {
  const cleanName = String(name || "")
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.(?:mp4|m4a|webm|mov|mkv|avi|aac|opus|png|jpe?g|webp|gif|avif)$/i, "")
    .trim()
    .slice(0, 80);
  const extension = getMediaExtension(kind, url);
  return `PromptLens/${cleanName || "media-file"}${extension}`;
}

function getMediaExtension(kind, url) {
  const mime = getMediaMimeFromUrl(url);
  if (kind === "image") {
    if (/^data:image\/png/i.test(url) || mime === "image/png") return ".png";
    if (/^data:image\/webp/i.test(url) || mime === "image/webp") return ".webp";
    if (/^data:image\/gif/i.test(url) || mime === "image/gif") return ".gif";
    if (/^data:image\/avif/i.test(url) || mime === "image/avif") return ".avif";
    if (/\.png(?:$|[?#])/i.test(url)) return ".png";
    if (/\.webp(?:$|[?#])/i.test(url)) return ".webp";
    if (/\.gif(?:$|[?#])/i.test(url)) return ".gif";
    if (/\.avif(?:$|[?#])/i.test(url)) return ".avif";
    return ".jpg";
  }

  if (kind === "audio") {
    if (mime === "audio/webm") return ".webm";
    if (mime === "audio/ogg" || mime === "audio/opus") return ".opus";
    if (mime === "audio/aac") return ".aac";
    if (/\.opus(?:$|[?#])/i.test(url)) return ".opus";
    if (/\.aac(?:$|[?#])/i.test(url)) return ".aac";
    return ".m4a";
  }

  if (mime === "video/webm") return ".webm";
  if (/\.webm(?:$|[?#])/i.test(url)) return ".webm";
  return ".mp4";
}

function getBlockedDownloadReason(url) {
  if (isSegmentedVideoUrl(url)) {
    return "当前视频是 m3u8 或分片流，需要先合并分片，浏览器下载管理器不能直接保存为 MP4。";
  }

  if (isDisallowedDownloadUrl(url)) {
    return "当前抓到的是脚本、网页、图片或接口地址，不是可播放 MP4。";
  }

  return "";
}

function looksLikeMp4Url(url) {
  const value = String(url || "");
  const mime = getMediaMimeFromUrl(value);
  return (
    /\.mp4(?:$|[?#])/i.test(value) ||
    /^video\//i.test(mime) ||
    (!mime && isYouTubePlaybackUrl(value)) ||
    /\/aweme\/v1\/play\//i.test(value) ||
    /\/video\/tos\//i.test(value) ||
    /playwm/i.test(value)
  );
}

function getMediaMimeFromUrl(url) {
  try {
    const parsedUrl = new URL(String(url || ""));
    const mime = parsedUrl.searchParams.get("mime") || parsedUrl.searchParams.get("mime_type") || "";
    return normalizeMediaMime(mime);
  } catch (error) {
    const match = String(url || "").match(/[?&](?:mime|mime_type)=([^&#]+)/i);
    return normalizeMediaMime(match?.[1] || "");
  }
}

function normalizeMediaMime(value) {
  const rawValue = String(value || "");
  let decodedValue = rawValue;
  try {
    decodedValue = decodeURIComponent(rawValue);
  } catch (error) {
    decodedValue = rawValue;
  }

  const mime = decodedValue
    .trim()
    .toLowerCase()
    .replace(/^video_mp4$/, "video/mp4")
    .replace(/^audio_mp4$/, "audio/mp4");
  return mime;
}

function isYouTubePlaybackUrl(url) {
  return /(?:^|\/\/)[^/]*googlevideo\.com\/videoplayback/i.test(String(url || "")) || /\/videoplayback(?:[?#]|$)/i.test(String(url || ""));
}

function isDisallowedDownloadUrl(url) {
  return /\.(?:js|mjs|css|html?|json|map|png|jpe?g|webp|gif|svg)(?:$|[?#])/i.test(String(url || ""));
}

function isBlockedContentType(contentType) {
  return /(?:javascript|ecmascript|text\/html|text\/css|application\/json|image\/)/i.test(String(contentType || ""));
}

async function cancelResponseBody(response) {
  try {
    await response.body?.cancel();
  } catch (error) {
    // Best effort. The browser will clean up completed HEAD responses.
  }
}

function isSegmentedVideoUrl(url) {
  return /\.m3u8(?:$|[?#])/i.test(url) || /application\/vnd\.apple\.mpegurl/i.test(url);
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

function ensureTrailingSlash(value) {
  const url = String(value || "").trim();
  return url.endsWith("/") ? url : `${url}/`;
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function safeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 500);
}

function formatPromptTime(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return "unknown";
  return `${Math.max(0, seconds).toFixed(2)}s`;
}

function getVideoFrameBudget(clipSeconds, configuredMax) {
  const recommended = getRecommendedFrameCount(clipSeconds);
  const configured = clampNumber(configuredMax, 1, 24, recommended);
  return Math.max(recommended, configured);
}

function getRecommendedFrameCount(clipSeconds) {
  const seconds = clampNumber(clipSeconds, 1, 45, 10);
  return Math.max(1, Math.min(24, Math.ceil(seconds / 2.5) + 3));
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}




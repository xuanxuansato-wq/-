const REFERENCE_FIELDS = [
  { key: "subject", label: "主体", placeholder: "例如：第一人称玩家、卡通蛇角色、产品包装" },
  { key: "scene", label: "场景", placeholder: "例如：绿色草地关卡、雪山河流、室内货架" },
  { key: "style", label: "风格", placeholder: "例如：休闲游戏、写实广告、赛博霓虹" }
];

const state = {
  job: null,
  context: { outline: "", subject: "", scene: "", style: "", bgm: "" },
  references: { subject: "", scene: "", style: "" },
  videoScript: "",
  frames: [],
  shots: [],
  exportDataUrl: "",
  saveTimer: 0
};

document.addEventListener("DOMContentLoaded", () => {
  bindPageActions();
  loadStoryboardJob();
  window.addEventListener("beforeunload", saveStoryboardState);
});

function bindPageActions() {
  document.querySelector("#reload-job").addEventListener("click", loadStoryboardJob);
  document.querySelector("#copy-text").addEventListener("click", copyStoryboardText);
  document.querySelector("#generate-image").addEventListener("click", generateStoryboardImage);
  document.querySelector("#download-editable").addEventListener("click", downloadEditableStoryboardFile);
}

async function loadStoryboardJob() {
  try {
    const job = await sendMessage("get-storyboard-job");
    setStoryboardJob(job);
    showToast("已载入分镜数据。");
  } catch (error) {
    console.error("[PromptLens Jimeng] 载入分镜失败", error);
    showToast(error.message || "载入分镜失败。", true);
  }
}

function setStoryboardJob(job) {
  state.job = normalizeJob(job || {});
  state.context = { ...state.job.context };
  state.references = { ...state.job.references };
  state.videoScript = state.job.videoScript || "";
  state.frames = state.job.frames;
  state.shots = state.job.shots;
  state.exportDataUrl = "";

  renderSourceInfo();
  renderReferenceGrid();
  renderVideoScriptEditor();
  renderShotList();
}

function scheduleStoryboardSave() {
  window.clearTimeout(state.saveTimer);
  state.saveTimer = window.setTimeout(saveStoryboardState, 600);
}

function saveStoryboardState() {
  if (!state.job) return;

  const baseJob = { ...state.job };
  delete baseJob.voiceoverScript;
  const nextJob = {
    ...baseJob,
    context: { ...state.context },
    references: { ...state.references },
    videoScript: state.videoScript,
    frames: state.frames,
    shots: state.shots.map((shot) => ({ ...shot })),
    updatedAt: Date.now()
  };

  state.job = nextJob;
  chrome.storage.local.set({ storyboardJob: nextJob });
}

function normalizeJob(job) {
  const rawShots = Array.isArray(job.shots) ? job.shots : [];
  const context = {
    outline: String(job.context?.outline || job.outline || job.raw?.outline || "").trim(),
    subject: String(job.context?.subject || job.subject || "").trim(),
    scene: String(job.context?.scene || job.scene || "").trim(),
    style: String(job.context?.style || job.style || "").trim(),
    bgm: getInitialBgm(job, rawShots)
  };
  const references = {
    subject: normalizeReferenceImages(job.references?.subject),
    scene: String(job.references?.scene || "").trim(),
    style: String(job.references?.style || "").trim()
  };

  const frames = Array.isArray(job.frames)
    ? job.frames
        .map((frame, index) => ({
          dataUrl: frame?.dataUrl || frame?.sourceUrl || frame?.url || "",
          time: Number.isFinite(frame?.time) ? frame.time : null,
          relativeTime: Number.isFinite(frame?.relativeTime) ? frame.relativeTime : null,
          label: frame?.label || getFrameLabel(frame, index),
          index: index + 1
        }))
        .filter((frame) => frame.dataUrl)
    : [];

  const shots = rawShots.map((shot, index) => ({
    title: shot.title || `镜头 ${index + 1}`,
    time: shot.time || shot.镜头时间 || "",
    description: shot.description || shot.画面描述 || "",
    camera: shot.camera || shot.镜头语言 || "",
    frameIndex: guessFrameIndex(shot, index, frames, rawShots.length),
    storyboardImages: normalizeShotImageItems(shot.storyboardImages, shot.storyboardImage, shot.storyboardSource),
    assetImages: normalizeShotImageItems(shot.assetImages, shot.assetImage, shot.assetSource),
    selectedStoryboardImageIndex: Number.isInteger(shot.selectedStoryboardImageIndex) ? shot.selectedStoryboardImageIndex : 0,
    selectedAssetImageIndex: Number.isInteger(shot.selectedAssetImageIndex) ? shot.selectedAssetImageIndex : 0
  }));

  return {
    title: String(job.title || job.pageTitle || "分镜脚本").trim(),
    pageTitle: String(job.pageTitle || "").trim(),
    pageUrl: String(job.pageUrl || "").trim(),
    videoScript: getInitialVideoScript(job),
    clipSeconds: Number.isFinite(job.clipSeconds) ? job.clipSeconds : null,
    clipStart: Number.isFinite(job.clipStart) ? job.clipStart : null,
    clipEnd: Number.isFinite(job.clipEnd) ? job.clipEnd : null,
    sourceLocator: isPlainObject(job.sourceLocator) ? job.sourceLocator : {},
    context,
    references,
    frames,
    shots
  };
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function getInitialVideoScript(job) {
  const savedScript = String(job.videoScript || "").trim();
  if (savedScript) return savedScript;

  return String(
    job.prompts?.zh ||
      job.prompts?.jimengVideoPromptZh ||
      job.prompts?.promptZh ||
      job.raw?.jimengVideoPromptZh ||
      ""
  ).trim();
}

function getInitialFrameVoiceoverScript(job) {
  const savedScript = String(job.frameVoiceoverScript || "").trim();
  if (savedScript) return savedScript;

  const list = Array.isArray(job.frameVoiceovers)
    ? job.frameVoiceovers
    : Array.isArray(job.prompts?.frameVoiceovers)
      ? job.prompts.frameVoiceovers
      : Array.isArray(job.raw?.frameVoiceovers)
        ? job.raw.frameVoiceovers
        : [];

  return formatFrameVoiceoverList(list);
}

function formatFrameVoiceoverList(list) {
  return dedupeFrameVoiceoverVisibleText(list)
    .map((item, index) => {
      if (typeof item === "string") {
        return `帧 ${index + 1}：${item.trim()}`;
      }

      const frame = item?.frame || index + 1;
      const time = item?.time ? ` ${item.time}` : "";
      const visibleText = item?.visibleText ? `\n字幕/OCR：${item.visibleText}` : "";
      const voiceover = item?.voiceover ? `\n口播：${item.voiceover}` : "\n口播：未识别";
      return `帧 ${frame}${time}${visibleText}${voiceover}`;
    })
    .filter(Boolean)
    .join("\n\n");
}

function dedupeFrameVoiceoverVisibleText(frameVoiceovers) {
  const seen = [];
  const source = Array.isArray(frameVoiceovers) ? frameVoiceovers : [];

  return source.map((item, index) => {
    const normalized = typeof item === "string"
      ? {
        frame: index + 1,
        time: "",
        visibleText: "",
        voiceover: item.trim()
      }
      : { ...item };

    return {
      ...normalized,
      visibleText: dedupeVisibleText(normalized.visibleText, seen)
    };
  });
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

function parseFrameVoiceoverScript(text) {
  return String(text || "")
    .split(/\n{2,}/)
    .map((block, index) => ({
      frame: index + 1,
      time: "",
      visibleText: "",
      voiceover: block.trim()
    }))
    .filter((item) => item.voiceover);
}

function getInitialBgm(job, shots = []) {
  const direct = firstString(
    job.context?.bgm,
    job.bgm,
    job.BGM,
    job.prompts?.bgm,
    job.raw?.bgm,
    job.raw?.BGM,
    job.raw?.music,
    job.raw?.sound,
    job.raw?.audio,
    job.raw?.rhythm
  );
  if (direct) return direct;

  for (const shot of shots) {
    const value = firstString(shot?.bgm, shot?.BGM, shot?.music, shot?.sound, shot?.audio, shot?.rhythm);
    if (value) return value;
  }

  return "";
}

function normalizeShotImageItems(items, legacyImage = "", legacySource = "") {
  const list = Array.isArray(items) ? items : [];
  const normalized = [];

  for (const item of list) {
    if (typeof item === "string" && item.trim()) {
      normalized.push({ dataUrl: item.trim(), source: "" });
      continue;
    }

    if (item && typeof item === "object") {
      const dataUrl = String(item.dataUrl || item.url || item.src || "").trim();
      if (dataUrl) {
        normalized.push({ dataUrl, source: String(item.source || "").trim() });
      }
    }
  }

  const legacy = String(legacyImage || "").trim();
  if (legacy && !normalized.some((item) => item.dataUrl === legacy)) {
    normalized.push({ dataUrl: legacy, source: String(legacySource || "").trim() });
  }

  return normalized;
}

function renderSourceInfo() {
  const title = state.job?.title || "分镜脚本";
  const metaParts = [
    state.job?.pageTitle ? `来源：${state.job.pageTitle}` : "",
    Number.isFinite(state.job?.clipSeconds) ? `识别片段：${Math.round(state.job.clipSeconds)}s` : "",
    `${state.shots.length} 个镜头`,
    `${state.frames.length} 张抽帧`
  ].filter(Boolean);

  document.querySelector("#job-title").textContent = title;
  document.querySelector("#job-meta").textContent = metaParts.join(" · ") || "暂无来源信息";

  const link = document.querySelector("#source-link");
  if (state.job?.pageUrl) {
    link.href = buildSourceLocateUrl(state.job.pageUrl);
    link.hidden = false;
  } else {
    link.hidden = true;
  }
}

function buildSourceLocateUrl(pageUrl) {
  try {
    const url = new URL(pageUrl);
    url.hash = "promptlens-locate-video=1";
    return url.toString();
  } catch (error) {
    return pageUrl;
  }
}

function renderVideoScriptEditor() {
  const wrapper = document.querySelector("#video-script-editor");
  wrapper.replaceChildren();

  const title = document.createElement("div");
  title.className = "video-script-head";
  const heading = document.createElement("h3");
  heading.textContent = "识别视频脚本文案";
  const hint = document.createElement("span");
  hint.textContent = "可编辑，会保存并导出到脚本图片";
  title.append(heading, hint);

  const textarea = document.createElement("textarea");
  textarea.value = state.videoScript || "";
  textarea.placeholder = "这里会自动带入识视频生成的即梦视频脚本文案，也可以手动补充。";
  textarea.rows = 5;
  textarea.addEventListener("input", () => {
    state.videoScript = textarea.value.trim();
    scheduleStoryboardSave();
  });

  wrapper.append(title, textarea);
}

function renderReferenceGrid() {
  const grid = document.querySelector("#reference-grid");
  grid.replaceChildren();

  renderOutlineRow(grid);

  for (const field of REFERENCE_FIELDS) {
    const row = document.createElement("article");
    row.className = "reference-row";

    const title = document.createElement("strong");
    title.textContent = field.label;

    const input = document.createElement("input");
    input.type = "text";
    input.dataset.contextField = field.key;
    input.value = state.context[field.key] || "";
    input.placeholder = field.placeholder;
    input.addEventListener("input", () => {
      state.context[field.key] = input.value.trim();
      scheduleStoryboardSave();
    });

    const upload = document.createElement("div");
    upload.className = `reference-upload reference-upload-${field.key}`;
    const preview = document.createElement("div");
    preview.textContent = `拖拽或点击上传${field.label}图片`;
    upload.append(preview);

    const file = document.createElement("input");
    file.type = "file";
    file.accept = "image/*";
    file.multiple = field.key === "subject";
    file.className = "reference-file";
    file.addEventListener("change", async () => {
      const images = getImageFiles(file.files);
      if (!images.length) return;
      for (const image of images) {
        await updateReferenceImage(field, await readFileAsDataUrl(image), upload);
      }
      file.value = "";
    });

    bindImageBoxUpload(upload, file, (dataUrl) => updateReferenceImage(field, dataUrl, upload), `拖拽或点击上传${field.label}图片`);
    row.append(title, input, upload, file);

    renderReferenceImages(upload, field);

    grid.append(row);
  }

  renderGlobalBgmRow(grid);
}

function renderOutlineRow(grid) {
  const row = document.createElement("article");
  row.className = "reference-row reference-row-outline";

  const title = document.createElement("strong");
  title.textContent = "修改大纲";

  const textarea = document.createElement("textarea");
  textarea.dataset.contextField = "outline";
  textarea.value = state.context.outline || "";
  textarea.placeholder = "例如：把整体改成军事实战风格，保留第一人称视角，后续镜头围绕枪械切换和射击反馈展开。";
  textarea.rows = 4;
  textarea.addEventListener("input", () => {
    state.context.outline = textarea.value.trim();
    scheduleStoryboardSave();
  });

  const rewriteButton = document.createElement("button");
  rewriteButton.type = "button";
  rewriteButton.className = "reference-outline-action";
  rewriteButton.textContent = "按大纲重写分镜";
  rewriteButton.addEventListener("click", () => rewriteStoryboardFromOutline(rewriteButton));

  row.append(title, textarea, rewriteButton);
  grid.append(row);
}

async function rewriteStoryboardFromOutline(button) {
  if (!state.context.outline) {
    showToast("请先填写修改大纲。", true);
    return;
  }

  const previousText = button.textContent;
  button.disabled = true;
  button.textContent = "重写中...";

  try {
    const result = await sendMessage("rewrite-storyboard-shots", {
      pageTitle: state.job?.pageTitle || state.job?.title || "",
      context: { ...state.context },
      shots: state.shots.map((shot, index) => ({
        title: shot.title || `镜头 ${index + 1}`,
        time: shot.time || "",
        description: stripStoryboardContextPrefix(shot.description || ""),
        camera: stripStoryboardContextPrefix(shot.camera || "")
      }))
    });

    applyStoryboardRewriteResult(result);
    scheduleStoryboardSave();
    renderReferenceGrid();
    renderShotList();
    showToast("已按修改大纲重写分镜。");
  } catch (error) {
    console.error("[PromptLens Jimeng] 按大纲重写分镜失败", error);
    showToast(`按大纲重写失败：${error.message || error}`, true);
  } finally {
    button.disabled = false;
    button.textContent = previousText;
  }
}

function applyStoryboardRewriteResult(result) {
  if (!isPlainObject(result)) return;

  for (const field of ["outline", "subject", "scene", "style", "bgm"]) {
    const value = String(result[field] || "").trim();
    if (value) state.context[field] = value;
  }

  const rewrittenShots = Array.isArray(result.shotList) ? result.shotList : [];
  state.shots = state.shots.map((shot, index) => {
    const rewritten = isPlainObject(rewrittenShots[index]) ? rewrittenShots[index] : {};
    return {
      ...shot,
      time: firstString(rewritten.time, rewritten.镜头时间, rewritten.shotTime, shot.time),
      description: stripStoryboardContextPrefix(
        firstString(rewritten.description, rewritten.画面描述, rewritten.visualDescription, shot.description)
      ),
      camera: stripStoryboardContextPrefix(
        firstString(rewritten.camera, rewritten.镜头语言, rewritten.cameraLanguage, rewritten.cameraMovement, shot.camera)
      )
    };
  });
}

function stripStoryboardContextPrefix(value) {
  let source = String(value || "").trimStart();
  let previous = "";

  while (source && source !== previous) {
    previous = source;
    source = source
      .replace(/^(?:修改大纲|主体|场景|风格|BGM)[:：][^；。\n]*(?:[；。]\s*|\n+)/u, "")
      .trimStart();
  }

  return source;
}

function renderGlobalBgmRow(grid) {
  const row = document.createElement("article");
  row.className = "reference-row";

  const title = document.createElement("strong");
  title.textContent = "BGM";

  const textarea = document.createElement("textarea");
  textarea.dataset.contextField = "bgm";
  textarea.value = state.context.bgm || "";
  textarea.placeholder = "例如：轻快休闲游戏音效，节奏明快，有点击反馈和轻松氛围";
  textarea.rows = 5;
  textarea.addEventListener("input", () => {
    state.context.bgm = textarea.value.trim();
    scheduleStoryboardSave();
  });

  row.append(title, textarea);
  grid.append(row);
}

async function updateReferenceImage(field, dataUrl, uploadElement) {
  if (!dataUrl) return;
  if (field.key === "subject") {
    const images = getReferenceImages("subject");
    if (!images.includes(dataUrl)) images.push(dataUrl);
    state.references.subject = images;
  } else {
    state.references[field.key] = dataUrl;
  }

  renderReferenceImages(uploadElement, field);
  scheduleStoryboardSave();

  if (field.key === "subject") {
    const syncedCount = syncSubjectReferenceToShotAssets(dataUrl);
    renderShotList();
    if (syncedCount > 0) {
      showToast(`主体图片已同步到 ${syncedCount} 个镜头的资产图。`);
      return;
    }

    showToast("主体图片已上传；未匹配到包含主体的镜头。");
    return;
  }

  showToast(`${field.label}图片已上传。`);
}

function renderReferenceImages(container, field) {
  container.replaceChildren();
  const images = getReferenceImages(field.key);
  container.classList.toggle("is-empty", !images.length);
  container.classList.toggle("is-scrollable", images.length > 3);

  if (!images.length) {
    const placeholder = document.createElement("div");
    placeholder.textContent = container.dataset.emptyHint || `拖拽或点击上传${field.label}图片`;
    container.append(placeholder);
    return;
  }

  const grid = document.createElement("div");
  grid.className = "reference-image-grid";
  images.forEach((dataUrl, index) => {
    const item = document.createElement("div");
    item.className = "reference-image-item";

    const image = document.createElement("img");
    image.src = dataUrl;
    image.alt = `${field.label}参考图 ${index + 1}`;

    const badge = document.createElement("span");
    badge.className = "reference-image-badge";
    badge.textContent = field.key === "subject" ? `主体 ${index + 1}` : field.label;

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "reference-image-delete";
    deleteButton.textContent = "删除";
    deleteButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      clearReferenceImage(field, container, index);
    });

    item.append(image, badge, deleteButton);
    grid.append(item);
  });

  container.append(grid);
}

function clearReferenceImage(field, container, imageIndex = 0) {
  if (field.key === "subject") {
    const images = getReferenceImages("subject");
    images.splice(imageIndex, 1);
    state.references.subject = images;
  } else {
    state.references[field.key] = "";
  }

  renderReferenceImages(container, field);
  scheduleStoryboardSave();
  showToast(`已删除${field.label}图片。`);
}

function getReferenceImages(key) {
  if (key === "subject") {
    return normalizeReferenceImages(state.references.subject);
  }

  const value = String(state.references[key] || "").trim();
  return value ? [value] : [];
}

function normalizeReferenceImages(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }

  const text = String(value || "").trim();
  return text ? [text] : [];
}

function syncSubjectReferenceToShotAssets(dataUrl) {
  if (!dataUrl || !state.shots.length) return 0;

  const subjectKeywords = getSubjectKeywords(state.context.subject);
  const matchedShots = state.shots.filter((shot) => shotContainsSubject(shot, subjectKeywords));
  const targetShots = matchedShots.length ? matchedShots : state.shots;
  let syncedCount = 0;

  for (const shot of targetShots) {
    const items = normalizeShotImageItems(shot.assetImages, shot.assetImage, shot.assetSource);
    if (items.some((item) => item.dataUrl === dataUrl)) continue;
    shot.assetImages = [...items, { dataUrl, source: "subject-reference" }];
    shot.assetImage = "";
    shot.assetSource = "";
    shot.selectedAssetImageIndex = shot.assetImages.length - 1;
    syncedCount += 1;
  }

  return syncedCount;
}

function getSubjectKeywords(value) {
  const source = String(value || "").trim();
  if (!source) return [];

  const keywords = source
    .split(/[\s,，、;；/｜|（）()【】\[\]《》<>]+/g)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);

  return Array.from(new Set([source, ...keywords].map(normalizeSubjectKeyword).filter(Boolean)));
}

function normalizeSubjectKeyword(value) {
  return String(value || "").replace(/\s+/g, "").toLowerCase();
}

function shotContainsSubject(shot, subjectKeywords) {
  if (!subjectKeywords.length) return true;
  const haystack = normalizeSubjectKeyword([shot?.title, shot?.description, shot?.camera].filter(Boolean).join(" "));
  return subjectKeywords.some((keyword) => haystack.includes(keyword));
}

function renderShotList() {
  const list = document.querySelector("#shot-list");
  list.replaceChildren();

  if (!state.shots.length) {
    const empty = document.createElement("div");
    empty.className = "empty-preview";
    empty.textContent = "暂无分镜数据。请回到识视频结果页重新打开。";
    list.append(empty);
    return;
  }

  state.shots.forEach((shot, index) => {
    const card = document.createElement("article");
    card.className = "shot-card";
    card.dataset.shotIndex = String(index);
    card.tabIndex = 0;

    const frameColumn = document.createElement("div");
    frameColumn.className = "shot-frame";

    const storyboardPreview = document.createElement("div");
    storyboardPreview.className = "shot-frame-preview";

    const assetPreview = document.createElement("div");
    assetPreview.className = "shot-frame-preview";

    const addStoryboardUpload = (dataUrl) => addShotStoryboardImage(index, dataUrl, "upload", storyboardPreview, storyboardSourceText);
    const addAssetUpload = (dataUrl) => addShotAssetImage(index, dataUrl, "upload", assetPreview, assetSourceText);
    const storyboardFile = createHiddenImageFileInput(addStoryboardUpload);
    const assetFile = createHiddenImageFileInput(addAssetUpload);

    const select = document.createElement("select");
    select.dataset.frameSelect = String(index);
    select.append(new Option("不使用抽帧", "-1"));
    state.frames.forEach((frame, frameIndex) => {
      select.append(new Option(`${frameIndex + 1}. ${getFrameLabel(frame, frameIndex)}`, String(frameIndex)));
    });
    select.value = String(Number.isInteger(shot.frameIndex) ? shot.frameIndex : -1);
    select.addEventListener("change", () => {
      shot.frameIndex = Number(select.value);
      renderShotImages(storyboardPreview, shot, "storyboard", getShotStoryboardSourceText(shot), index, storyboardSourceText);
      storyboardSourceText.textContent = getShotStoryboardSourceText(shot);
      scheduleStoryboardSave();
    });

    const storyboardSourceText = document.createElement("div");
    storyboardSourceText.className = "shot-image-source";
    storyboardSourceText.textContent = getShotStoryboardSourceText(shot);

    const assetSourceText = document.createElement("div");
    assetSourceText.className = "shot-image-source";
    assetSourceText.textContent = getShotAssetSourceText(shot);

    card.addEventListener("paste", async (event) => {
      try {
        const dataUrl = await readPasteEventImageAsDataUrl(event);
        if (!dataUrl) return;
        event.preventDefault();
        await addShotStoryboardImage(index, dataUrl, "paste", storyboardPreview, storyboardSourceText);
        showToast("已粘贴为该镜头分镜图。");
      } catch (error) {
        showToast(error.message || "粘贴图片失败。", true);
      }
    });

    bindImageBoxUpload(storyboardPreview, storyboardFile, addStoryboardUpload, "拖拽或点击上传分镜图");
    bindImageBoxUpload(assetPreview, assetFile, addAssetUpload, "拖拽或点击上传资产图");

    const inferButton = createSmallButton("按选中分镜反推", () => inferShotDescriptionFromAsset(index, inferButton));
    inferButton.classList.add("shot-infer-button");
    const deleteAssetButton = createSmallButton("删除选中资产", () => deleteSelectedShotImage(index, "asset", assetPreview, assetSourceText));
    deleteAssetButton.classList.add("danger-button", "shot-delete-selected-button");

    renderShotImages(storyboardPreview, shot, "storyboard", getShotStoryboardSourceText(shot), index, storyboardSourceText);
    renderShotImages(assetPreview, shot, "asset", getShotAssetSourceText(shot), index, assetSourceText);
    frameColumn.append(
      createShotImageSection("分镜图", storyboardPreview, storyboardSourceText, createFieldLabel("对应抽帧", select), inferButton, storyboardFile),
      createShotImageSection("资产图", assetPreview, assetSourceText, deleteAssetButton, assetFile)
    );

    const fields = document.createElement("div");
    fields.className = "shot-fields";

    const head = document.createElement("div");
    head.className = "shot-head";
    const title = document.createElement("h3");
    title.textContent = `镜头 ${index + 1}`;
    const deleteButton = createSmallButton("删除镜头", () => deleteShot(index));
    deleteButton.classList.add("danger-button");
    head.append(title, deleteButton);

    fields.append(
      head,
      createShotInput(index, "time", "镜头时间", shot.time),
      createShotTextarea(index, "description", "画面描述", shot.description),
      createShotTextarea(index, "camera", "镜头语言", shot.camera)
    );

    card.append(frameColumn, fields);
    list.append(card);
  });
}

function createShotImageSection(title, ...children) {
  const section = document.createElement("section");
  section.className = "shot-image-section";
  const heading = document.createElement("strong");
  heading.textContent = title;
  section.append(heading, ...children);
  return section;
}

function renderShotImages(container, shot, kind, altText, shotIndex, sourceElement) {
  container.replaceChildren();
  const entries = getShotImageEntries(shot, kind);
  const selectedIndex = getSelectedShotImageIndex(shot, kind, entries);
  container.classList.toggle("is-empty", !entries.length);
  container.classList.toggle("is-scrollable", entries.length > 3);

  if (!entries.length) {
    container.textContent = container.dataset.emptyHint || "拖拽或点击上传图片";
    return;
  }

  entries.forEach((entry, imageIndex) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "shot-image-choice";
    item.classList.toggle("is-selected", imageIndex === selectedIndex);
    item.title = imageIndex === selectedIndex ? "当前选中图片" : "点击选中这张图片";
    item.addEventListener("click", () => {
      setSelectedShotImageIndex(shot, kind, imageIndex);
      renderShotImages(container, shot, kind, altText, shotIndex, sourceElement);
      if (sourceElement) {
        sourceElement.textContent = kind === "asset" ? getShotAssetSourceText(shot) : getShotStoryboardSourceText(shot);
      }
      scheduleStoryboardSave();
    });

    const image = document.createElement("img");
    image.src = entry.dataUrl;
    image.alt = `${altText || "镜头图片"} ${imageIndex + 1}`;

    const badge = document.createElement("span");
    badge.className = "shot-image-badge";
    badge.textContent = imageIndex === selectedIndex ? "选中" : entry.label;

    item.append(image, badge);

    if (entry.removable) {
      const deleteButton = document.createElement("span");
      deleteButton.className = "shot-image-delete";
      deleteButton.textContent = "删除";
      deleteButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        deleteShotImage(shotIndex, kind, entry.customIndex, container, sourceElement);
      });
      item.append(deleteButton);
    }

    container.append(item);
  });
}

function getShotImageEntries(shot, kind) {
  if (kind === "asset") {
    return getShotCustomImageItems(shot, "asset").map((item, customIndex) => ({
      ...item,
      customIndex,
      label: `资产 ${customIndex + 1}`,
      removable: true
    }));
  }

  const entries = getShotCustomImageItems(shot, "storyboard").map((item, customIndex) => ({
    ...item,
    customIndex,
    label: `分镜 ${customIndex + 1}`,
    removable: true
  }));
  const frame = state.frames[shot?.frameIndex];
  if (frame?.dataUrl && !entries.some((item) => item.dataUrl === frame.dataUrl)) {
    entries.push({
      dataUrl: frame.dataUrl,
      source: "frame",
      customIndex: -1,
      label: `抽帧 ${getFrameLabel(frame, shot.frameIndex)}`,
      removable: false
    });
  }

  return entries;
}

function getSelectedShotImageIndex(shot, kind, entries = getShotImageEntries(shot, kind)) {
  const key = kind === "asset" ? "selectedAssetImageIndex" : "selectedStoryboardImageIndex";
  const index = Number.isInteger(shot?.[key]) ? shot[key] : 0;
  if (!entries.length) return 0;
  return Math.max(0, Math.min(entries.length - 1, index));
}

function setSelectedShotImageIndex(shot, kind, index) {
  const key = kind === "asset" ? "selectedAssetImageIndex" : "selectedStoryboardImageIndex";
  shot[key] = Math.max(0, Number(index) || 0);
}

function deleteShotImage(shotIndex, kind, customIndex, previewElement, sourceElement) {
  const shot = state.shots[shotIndex];
  if (!shot || customIndex < 0) return;

  const key = kind === "asset" ? "assetImages" : "storyboardImages";
  const selectedKey = kind === "asset" ? "selectedAssetImageIndex" : "selectedStoryboardImageIndex";
  const items = normalizeShotImageItems(shot[key], shot[kind === "asset" ? "assetImage" : "storyboardImage"], shot[kind === "asset" ? "assetSource" : "storyboardSource"]);
  items.splice(customIndex, 1);
  shot[key] = items;
  shot[selectedKey] = Math.max(0, Math.min(items.length - 1, Number(shot[selectedKey]) || 0));
  if (kind === "asset") {
    shot.assetImage = "";
    shot.assetSource = "";
  } else {
    shot.storyboardImage = "";
    shot.storyboardSource = "";
  }

  renderShotImages(previewElement, shot, kind, kind === "asset" ? getShotAssetSourceText(shot) : getShotStoryboardSourceText(shot), shotIndex, sourceElement);
  if (sourceElement) {
    sourceElement.textContent = kind === "asset" ? getShotAssetSourceText(shot) : getShotStoryboardSourceText(shot);
  }
  scheduleStoryboardSave();
  showToast("已删除图片。");
}

function deleteSelectedShotImage(shotIndex, kind, previewElement, sourceElement) {
  const shot = state.shots[shotIndex];
  if (!shot) return;

  const entries = getShotImageEntries(shot, kind);
  const selectedEntry = entries[getSelectedShotImageIndex(shot, kind, entries)];
  if (!selectedEntry?.removable || selectedEntry.customIndex < 0) {
    showToast(kind === "asset" ? "暂无可删除的资产图。" : "暂无可删除的分镜图。", true);
    return;
  }

  deleteShotImage(shotIndex, kind, selectedEntry.customIndex, previewElement, sourceElement);
}

function createSmallButton(label, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function deleteShot(index) {
  const shot = state.shots[index];
  if (!shot) return;

  const ok = window.confirm(`确定删除镜头 ${index + 1} 吗？`);
  if (!ok) return;

  state.shots.splice(index, 1);
  resetExportPreview();
  renderSourceInfo();
  renderShotList();
  saveStoryboardState();
  showToast(`已删除镜头 ${index + 1}。`);
}

function resetExportPreview() {
  state.exportDataUrl = "";
}

async function addShotAssetImage(index, dataUrl, source, previewElement, sourceElement) {
  const shot = state.shots[index];
  if (!shot || !dataUrl) return;

  shot.assetImages = normalizeShotImageItems(shot.assetImages, shot.assetImage, shot.assetSource);
  shot.assetImage = "";
  shot.assetSource = "";
  shot.assetImages.push({ dataUrl, source });
  shot.selectedAssetImageIndex = shot.assetImages.length - 1;
  renderShotImages(previewElement, shot, "asset", getShotAssetSourceText(shot), index, sourceElement);
  sourceElement.textContent = getShotAssetSourceText(shot);
  scheduleStoryboardSave();
}

async function addShotStoryboardImage(index, dataUrl, source, previewElement, sourceElement) {
  const shot = state.shots[index];
  if (!shot || !dataUrl) return;

  shot.storyboardImages = normalizeShotImageItems(shot.storyboardImages, shot.storyboardImage, shot.storyboardSource);
  shot.storyboardImage = "";
  shot.storyboardSource = "";
  shot.storyboardImages.push({ dataUrl, source });
  shot.selectedStoryboardImageIndex = shot.storyboardImages.length - 1;
  renderShotImages(previewElement, shot, "storyboard", getShotStoryboardSourceText(shot), index, sourceElement);
  sourceElement.textContent = getShotStoryboardSourceText(shot);
  scheduleStoryboardSave();
}

function createHiddenImageFileInput(onDataUrl) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.multiple = true;
  input.className = "shot-image-file";
  input.addEventListener("change", async () => {
    const files = Array.from(input.files || []).filter((file) => /^image\//i.test(file.type || ""));
    if (!files.length) return;

    try {
      for (const file of files) {
        await onDataUrl(await readFileAsDataUrl(file));
      }
      showToast(`已上传 ${files.length} 张图片。`);
    } catch (error) {
      showToast(error.message || "上传图片失败。", true);
    } finally {
      input.value = "";
    }
  });
  return input;
}

function bindImageBoxUpload(container, fileInput, onDataUrl, hint) {
  container.dataset.emptyHint = hint;
  container.title = hint;

  container.addEventListener("click", (event) => {
    if (event.target.closest(".shot-image-choice")) return;
    fileInput.click();
  });

  container.addEventListener("dragenter", (event) => {
    event.preventDefault();
    container.classList.add("is-drag-over");
  });

  container.addEventListener("dragover", (event) => {
    event.preventDefault();
    container.classList.add("is-drag-over");
  });

  container.addEventListener("dragleave", (event) => {
    if (container.contains(event.relatedTarget)) return;
    container.classList.remove("is-drag-over");
  });

  container.addEventListener("drop", async (event) => {
    event.preventDefault();
    container.classList.remove("is-drag-over");
    const files = getImageFiles(event.dataTransfer?.files);
    if (!files.length) {
      showToast("请拖入图片文件。", true);
      return;
    }

    try {
      for (const file of files) {
        await onDataUrl(await readFileAsDataUrl(file));
      }
      showToast(`已上传 ${files.length} 张图片。`);
    } catch (error) {
      showToast(error.message || "拖拽上传图片失败。", true);
    }
  });
}

function getImageFiles(fileList) {
  return Array.from(fileList || []).filter((file) => /^image\//i.test(file.type || ""));
}

async function inferShotDescriptionFromAsset(index, button) {
  const shot = state.shots[index];
  const imageDataUrl = getShotStoryboardDataUrl(shot);
  if (!imageDataUrl) {
    showToast("请先选择抽帧、上传或粘贴分镜图。", true);
    return;
  }

  const previousText = button.textContent;
  button.disabled = true;
  button.textContent = "反推中...";

  try {
    const result = await sendMessage("analyze-storyboard-image", {
      imageDataUrl,
      imageUrl: "",
      alt: `镜头 ${index + 1} 分镜图`,
      pageUrl: state.job?.pageUrl || "",
      pageTitle: state.job?.title || "分镜资产图",
      shotTitle: shot.title || `镜头 ${index + 1}`,
      shotTime: shot.time || "",
      description: shot.description || "",
      bgm: state.context.bgm || "",
      camera: shot.camera || "",
      subject: state.context.subject || "",
      scene: state.context.scene || "",
      style: state.context.style || ""
    });
    applyStoryboardImageAnalysis(index, result);
    showToast("已根据分镜图更新主体、场景、BGM、画面描述和镜头语言。");
  } catch (error) {
    showToast(`反推失败：${error.message}`, true);
  } finally {
    button.disabled = false;
    button.textContent = previousText;
  }
}

async function generateShotAssetImage(index, button, previewElement, sourceElement) {
  const shot = state.shots[index];
  if (!shot) return;

  const previousText = button.textContent;
  button.disabled = true;
  button.textContent = "生成中...";

  try {
    const prompt = await buildShotAssetPrompt(shot, index);
    const result = await sendMessage("generate-image-preview", { prompt });
    const imageUrl = await normalizeGeneratedImageUrl(result.dataUrl || result.imageUrl || "");
    if (!imageUrl) {
      throw new Error("API 没有返回图片。");
    }

    await addShotAssetImage(index, imageUrl, "generated", previewElement, sourceElement);
    showToast("已生成该镜头资产图片。");
  } catch (error) {
    showToast(`生成失败：${error.message}`, true);
  } finally {
    button.disabled = false;
    button.textContent = previousText;
  }
}

async function buildShotAssetPrompt(shot, index) {
  const storyboardImage = getShotStoryboardDataUrl(shot);
  const frameSummary = storyboardImage ? await getImageSummary(storyboardImage, `镜头 ${index + 1} 分镜图`) : "";

  return [
    "生成一张用于分镜脚本预览的资产图片，画面干净，不要文字、水印和 UI 边框。",
    state.context.outline ? `修改大纲：${state.context.outline}` : "",
    state.context.subject ? `主体：${state.context.subject}` : "",
    state.context.scene ? `场景：${state.context.scene}` : "",
    state.context.style ? `风格：${state.context.style}` : "",
    frameSummary ? `分镜画面分析：${frameSummary}` : "",
    `镜头时间：${shot.time || "未识别"}`,
    `画面描述：${shot.description || "未识别"}`,
    `镜头语言：${shot.camera || "未识别"}`,
    "输出应像该镜头的可视化资产图，方便内部对接和脚本预览。"
  ]
    .filter(Boolean)
    .join("\n");
}

async function getImageSummary(imageDataUrl, label) {
  try {
    const result = await sendMessage("analyze-storyboard-image", {
      imageDataUrl,
      imageUrl: "",
      label,
      pageUrl: state.job?.pageUrl || "",
      pageTitle: state.job?.title || "分镜资产图",
      outline: state.context.outline || "",
      subject: state.context.subject || "",
      scene: state.context.scene || "",
      style: state.context.style || ""
    });
    return buildShotDescriptionFromAnalysis(result).slice(0, 420);
  } catch (error) {
    return "";
  }
}

function applyStoryboardImageAnalysis(index, result) {
  const shot = state.shots[index];
  if (!shot) return;

  const updates = {
    description: result?.description || buildShotDescriptionFromAnalysis(result),
    camera: result?.camera || ""
  };

  for (const [field, value] of Object.entries(updates)) {
    const cleanValue = String(value || "").trim();
    if (!cleanValue) continue;
    shot[field] = cleanValue;
    updateShotControlValue(index, field, cleanValue);
  }

  if (result?.subject) {
    state.context.subject = result.subject;
    updateContextControlValue("subject", result.subject);
  }

  if (result?.scene) {
    state.context.scene = result.scene;
    updateContextControlValue("scene", result.scene);
  }

  if (result?.style) {
    state.context.style = result.style;
    updateContextControlValue("style", result.style);
  }

  if (result?.bgm) {
    state.context.bgm = result.bgm;
    updateContextControlValue("bgm", result.bgm);
  }

  scheduleStoryboardSave();
}

function buildShotDescriptionFromAnalysis(result) {
  const parts = [
    result?.subject ? `主体：${result.subject}` : "",
    result?.scene ? `场景：${result.scene}` : "",
    result?.description ? `画面：${result.description}` : "",
    result?.style ? `风格：${result.style}` : "",
    result?.camera ? `镜头：${result.camera}` : "",
    Array.isArray(result?.keywords) && result.keywords.length ? `关键词：${result.keywords.join("、")}` : ""
  ].filter(Boolean);

  return parts.join("；") || result?.prompts?.coverZh || result?.prompts?.zh || "";
}

function updateShotControlValue(index, field, value) {
  const control = document.querySelector(`[data-shot-index="${index}"] [data-field="${field}"]`);
  if (control) {
    control.value = value;
  }
}

function updateContextControlValue(field, value) {
  const control = document.querySelector(`[data-context-field="${field}"]`);
  if (control) {
    control.value = value;
  }
}

function getShotAssetDataUrl(shot) {
  return getSelectedShotImageEntry(shot, "asset")?.dataUrl || "";
}

function getShotAssetDataUrls(shot) {
  return getShotCustomImageItems(shot, "asset").map((item) => item.dataUrl);
}

function getShotAssetSourceText(shot) {
  const items = getShotCustomImageItems(shot, "asset");
  if (items.length) {
    return `资产图片：${items.length} 张 · 选中第 ${getSelectedShotImageIndex(shot, "asset") + 1} 张`;
  }

  return "资产图片：未选择";
}

function getShotStoryboardDataUrl(shot) {
  return getSelectedShotImageEntry(shot, "storyboard")?.dataUrl || "";
}

function getShotStoryboardDataUrls(shot) {
  const urls = [];
  const custom = getShotCustomImageItems(shot, "storyboard").map((item) => item.dataUrl);
  urls.push(...custom);
  const frame = state.frames[shot?.frameIndex];
  if (frame?.dataUrl && !urls.includes(frame.dataUrl)) {
    urls.push(frame.dataUrl);
  }
  return urls;
}

function getShotStoryboardSourceText(shot) {
  const custom = getShotCustomImageItems(shot, "storyboard");
  const frame = state.frames[shot?.frameIndex];
  const parts = [];
  if (custom.length) parts.push(`粘贴 ${custom.length} 张`);
  if (frame) parts.push(`抽帧 ${getFrameLabel(frame, shot.frameIndex)}`);
  return parts.length ? `分镜图：${parts.join(" + ")} · 选中第 ${getSelectedShotImageIndex(shot, "storyboard") + 1} 张` : "分镜图：未选择";
}

function getSelectedShotImageEntry(shot, kind) {
  const entries = getShotImageEntries(shot, kind);
  return entries[getSelectedShotImageIndex(shot, kind, entries)] || null;
}

function getShotCustomImageItems(shot, kind) {
  const list = kind === "asset"
    ? normalizeShotImageItems(shot?.assetImages, shot?.assetImage, shot?.assetSource)
    : normalizeShotImageItems(shot?.storyboardImages, shot?.storyboardImage, shot?.storyboardSource);
  return list.filter((item) => item.dataUrl);
}

function createShotInput(index, field, label, value) {
  const input = document.createElement("input");
  input.type = "text";
  input.value = value || "";
  input.dataset.field = field;
  input.addEventListener("input", () => {
    state.shots[index][field] = input.value.trim();
    scheduleStoryboardSave();
  });
  const wrapper = createFieldLabel(label, input);
  wrapper.classList.add("shot-field-block", `shot-field-${field}`);
  return wrapper;
}

function createShotTextarea(index, field, label, value) {
  const textarea = document.createElement("textarea");
  textarea.value = value || "";
  textarea.dataset.field = field;
  textarea.addEventListener("input", () => {
    state.shots[index][field] = textarea.value.trim();
    scheduleStoryboardSave();
  });
  const wrapper = createFieldLabel(label, textarea);
  wrapper.classList.add("shot-field-block", `shot-field-${field}`);
  return wrapper;
}

function createFieldLabel(label, control) {
  const wrapper = document.createElement("label");
  wrapper.className = "field-label";
  const caption = document.createElement("span");
  caption.textContent = label;
  wrapper.append(caption, control);
  return wrapper;
}

async function generateStoryboardImage() {
  if (!state.shots.length) {
    showToast("暂无分镜可生成。", true);
    return;
  }

  const button = document.querySelector("#generate-image");
  const previousText = button.textContent;
  button.disabled = true;
  button.textContent = "生成中...";

  try {
    state.exportDataUrl = await renderStoryboardCanvas();
    downloadDataUrl(state.exportDataUrl, `${sanitizeFilename(state.job?.title || "storyboard")}-分镜脚本.png`);
    showToast("分镜脚本图片已生成并下载。");
  } catch (error) {
    console.error("[PromptLens Jimeng] 生成分镜图片失败", error);
    showToast(error.message || "生成分镜图片失败。", true);
  } finally {
    button.disabled = false;
    button.textContent = previousText;
  }
}

async function renderStoryboardCanvas() {
  const canvas = document.querySelector("#export-canvas");
  const context = canvas.getContext("2d");
  const width = 1600;
  const margin = 56;
  const contentWidth = width - margin * 2;
  const images = await preloadCanvasImages();

  context.font = "26px Microsoft YaHei";
  const shotHeights = state.shots.map((shot) => measureShotHeight(context, shot, contentWidth));
  const referenceHeight = measureReferenceSectionHeight();
  const scriptSectionsHeight = measureScriptExportHeight(context, contentWidth, state.videoScript);
  const shotTotalHeight = shotHeights.reduce((sum, item) => sum + item + 22, 0);
  const height = 188 + referenceHeight + 34 + scriptSectionsHeight + 34 + 64 + shotTotalHeight + 80;

  canvas.width = width;
  canvas.height = height;

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  drawHeader(context, margin, contentWidth);

  let y = 188;
  y = drawReferenceSection(context, images, margin, y, contentWidth) + 34;
  y = drawScriptSections(context, margin, y, contentWidth, state.videoScript) + 34;

  context.fillStyle = "#123041";
  context.font = "bold 32px Microsoft YaHei";
  context.fillText("分镜脚本", margin, y);
  y += 30;

  for (let index = 0; index < state.shots.length; index += 1) {
    const shot = state.shots[index];
    const cardHeight = shotHeights[index];
    drawShotCard(context, images, shot, index, margin, y, contentWidth, cardHeight);
    y += cardHeight + 22;
  }

  context.fillStyle = "#6d8293";
  context.font = "20px Microsoft YaHei";
  context.fillText(`Generated by PromptLens Jimeng · ${new Date().toLocaleString()}`, margin, height - 42);

  return canvas.toDataURL("image/png");
}

function drawHeader(context, margin, contentWidth) {
  drawRoundRect(context, margin, 38, contentWidth, 110, 26, "#123041");
  context.fillStyle = "#7fe6c3";
  context.font = "bold 24px Microsoft YaHei";
  context.fillText("CHROME插件-识图和识视频", margin + 30, 78);
  context.fillStyle = "#ffffff";
  context.font = "bold 38px Microsoft YaHei";
  context.fillText(state.job?.title || "分镜脚本图片", margin + 30, 122);
  context.fillStyle = "#c8dad5";
  context.font = "20px Microsoft YaHei";
  context.fillText(`${state.shots.length} 个镜头 · ${state.frames.length} 张抽帧`, margin + contentWidth - 310, 92);
}

function drawReferenceSection(context, images, margin, y, contentWidth) {
  const height = measureReferenceSectionHeight();
  drawRoundRect(context, margin, y, contentWidth, height, 22, "#ffffff", "#d3e8f5");
  context.fillStyle = "#123041";
  context.font = "bold 28px Microsoft YaHei";
  context.fillText("全局参考列表", margin + 24, y + 44);

  const cardGap = 16;
  const outlineHeight = getReferenceOutlineHeight();
  let cardY = y + 70;
  if (outlineHeight) {
    drawRoundRect(context, margin + 24, cardY, contentWidth - 48, outlineHeight, 18, "#f8fdff", "#d9edf6");
    context.fillStyle = "#176c70";
    context.font = "bold 22px Microsoft YaHei";
    context.fillText("修改大纲", margin + 44, cardY + 38);
    context.fillStyle = "#263f4f";
    context.font = "20px Microsoft YaHei";
    drawWrappedText(context, state.context.outline, margin + 44, cardY + 76, contentWidth - 88, 28);
    cardY += outlineHeight + 16;
  }

  const cardWidth = (contentWidth - 48 - cardGap * 3) / 4;
  const cardHeight = measureReferenceCardHeight();
  const items = [
    ...REFERENCE_FIELDS.map((field) => ({
      key: field.key,
      label: field.label,
      text: state.context[field.key] || "未填写",
      images: images.references[field.key] || [],
      imageText: "未上传参考图",
      note: "参考图"
    })),
    {
      key: "bgm",
      label: "BGM",
      text: state.context.bgm || "未填写",
      images: [],
      imageText: "无需参考图",
      note: "全局音效"
    }
  ];

  items.forEach((item, index) => {
    const cardX = margin + 24 + index * (cardWidth + cardGap);
    drawRoundRect(context, cardX, cardY, cardWidth, cardHeight, 18, "#f8fdff", "#d9edf6");
    context.fillStyle = "#176c70";
    context.font = "bold 22px Microsoft YaHei";
    context.fillText(item.label, cardX + 18, cardY + 38);

    context.fillStyle = "#263f4f";
    context.font = "20px Microsoft YaHei";
    drawWrappedText(context, item.text, cardX + 18, cardY + 72, cardWidth - 36, 28, 3);

    const imageY = cardY + 142;
    const imageHeight = cardHeight - 190;
    if (item.images.length) {
      drawReferenceImageGrid(context, item.images, cardX + 18, imageY, cardWidth - 36, imageHeight);
    } else {
      drawRoundRect(context, cardX + 18, imageY, cardWidth - 36, imageHeight, 12, "#eaf4f8", "#d3e8f5");
      context.fillStyle = "#8aa1ad";
      context.font = "16px Microsoft YaHei";
      context.fillText(item.imageText, cardX + cardWidth / 2 - 52, imageY + imageHeight / 2 + 6);
    }

    drawRoundRect(context, cardX + 18, cardY + cardHeight - 28, 98, 24, 10, "#ffffff", "#d9edf6");
    context.fillStyle = "#176c70";
    context.font = "bold 14px Microsoft YaHei";
    context.fillText(item.note, cardX + 38, cardY + cardHeight - 11);
  });

  return y + height;
}

function measureReferenceSectionHeight() {
  const outlineHeight = getReferenceOutlineHeight();
  return 70 + outlineHeight + (outlineHeight ? 16 : 0) + measureReferenceCardHeight() + 24;
}

function getReferenceOutlineHeight() {
  const source = String(state.context.outline || "").trim();
  if (!source) return 0;
  const estimatedLines = source.split("\n").reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / 58)), 0);
  return Math.max(132, 76 + estimatedLines * 28);
}

function measureReferenceCardHeight() {
  const maxReferenceCount = Math.max(
    1,
    ...REFERENCE_FIELDS.map((field) => getReferenceImages(field.key).length)
  );
  const rows = Math.ceil(maxReferenceCount / 2);
  return 190 + Math.max(150, rows * 150 + Math.max(0, rows - 1) * 10);
}

function measureScriptExportHeight(context, contentWidth, videoScript) {
  const sections = [
    ["识别视频脚本文案", videoScript]
  ].filter(([, value]) => String(value || "").trim());

  if (!sections.length) return 0;

  context.font = "22px Microsoft YaHei";
  return sections.reduce((sum, [, value]) => sum + Math.max(145, 74 + measureWrappedText(context, value, contentWidth - 48, 32)) + 18, 0);
}

function drawScriptSections(context, x, y, width, videoScript) {
  const sections = [
    ["识别视频脚本文案", videoScript]
  ].filter(([, value]) => String(value || "").trim());

  let currentY = y;
  for (const [title, value] of sections) {
    context.font = "22px Microsoft YaHei";
    const height = Math.max(145, 74 + measureWrappedText(context, value, width - 48, 32));
    drawRoundRect(context, x, currentY, width, height, 22, "#ffffff", "#d3e8f5");
    context.fillStyle = "#123041";
    context.font = "bold 28px Microsoft YaHei";
    context.fillText(title, x + 24, currentY + 44);
    context.fillStyle = "#263f4f";
    context.font = "22px Microsoft YaHei";
    drawWrappedText(context, value, x + 24, currentY + 84, width - 48, 32);
    currentY += height + 18;
  }

  return sections.length ? currentY - 18 : y;
}

function drawShotCard(context, images, shot, index, x, y, width, height) {
  drawRoundRect(context, x, y, width, height, 22, "#ffffff", "#d3e8f5");

  context.fillStyle = "#123041";
  context.font = "bold 28px Microsoft YaHei";
  context.fillText(`镜头 ${index + 1}`, x + 24, y + 44);

  drawRoundRect(context, x + width - 180, y + 22, 142, 42, 21, "#e5fbf3");
  context.fillStyle = "#176c70";
  context.font = "bold 21px Microsoft YaHei";
  context.fillText(shot.time || "未识别", x + width - 160, y + 50);

  const imageX = x + 24;
  const imageY = y + 78;
  const imageW = Math.min(540, Math.max(420, width * 0.38));
  const imageH = Math.min(330, height - 104);
  const imageGap = 12;
  const imageBoxWidth = (imageW - imageGap) / 2;
  drawExportImageBox(context, "分镜图", images.storyboards[index], imageX, imageY, imageBoxWidth, imageH, "未选择分镜");
  drawExportImageBox(context, "资产图", images.assets[index], imageX + imageBoxWidth + imageGap, imageY, imageBoxWidth, imageH, "未上传资产");

  const textX = imageX + imageW + 32;
  const textWidth = x + width - textX - 24;
  let textY = y + 94;
  textY = drawTextSection(context, "画面描述", shot.description || "未识别", textX, textY, textWidth, "#123041");
  drawTextSection(context, "镜头语言", shot.camera || "未识别", textX, textY + 12, textWidth, "#176c70");
}

function drawTextSection(context, label, value, x, y, width, color) {
  context.fillStyle = color;
  context.font = "bold 21px Microsoft YaHei";
  context.fillText(label, x, y);
  context.fillStyle = "#263f4f";
  context.font = "22px Microsoft YaHei";
  return drawWrappedText(context, value, x, y + 32, width, 32);
}

function measureShotHeight(context, shot, width) {
  const imageW = Math.min(540, Math.max(420, width * 0.38));
  const textWidth = width - imageW - 80;
  context.font = "22px Microsoft YaHei";
  const descriptionHeight = measureWrappedText(context, shot.description || "未识别", textWidth, 32);
  const cameraHeight = measureWrappedText(context, shot.camera || "未识别", textWidth, 32);
  return Math.max(440, 126 + descriptionHeight + cameraHeight + 78);
}

async function preloadCanvasImages() {
  const references = {};
  for (const field of REFERENCE_FIELDS) {
    references[field.key] = await loadImageList(getReferenceImages(field.key));
  }

  const frames = {};
  for (let index = 0; index < state.frames.length; index += 1) {
    frames[index] = state.frames[index]?.dataUrl ? await loadImage(state.frames[index].dataUrl) : null;
  }

  const assets = {};
  const storyboards = {};
  for (let index = 0; index < state.shots.length; index += 1) {
    const storyboardUrls = getShotStoryboardDataUrls(state.shots[index]);
    const assetUrls = getShotAssetDataUrls(state.shots[index]);
    storyboards[index] = await loadImageList(storyboardUrls);
    assets[index] = await loadImageList(assetUrls);
  }

  return { references, frames, storyboards, assets };
}

function drawExportImageBox(context, label, image, x, y, width, height, emptyText) {
  drawRoundRect(context, x, y, width, height, 16, "#eaf4f8", "#d3e8f5");
  context.fillStyle = "#176c70";
  context.font = "bold 18px Microsoft YaHei";
  context.fillText(label, x + 12, y + 28);
  const imageY = y + 40;
  const imageHeight = height - 52;

  const imageList = Array.isArray(image) ? image.filter(Boolean) : image ? [image] : [];
  if (imageList.length) {
    const visibleImages = imageList.slice(0, 4);
    const columns = visibleImages.length === 1 ? 1 : 2;
    const rows = Math.ceil(visibleImages.length / columns);
    const gap = 8;
    const cellWidth = (width - 20 - gap * (columns - 1)) / columns;
    const cellHeight = (imageHeight - gap * (rows - 1)) / rows;

    visibleImages.forEach((item, itemIndex) => {
      const col = itemIndex % columns;
      const row = Math.floor(itemIndex / columns);
      drawContainImage(context, item, x + 10 + col * (cellWidth + gap), imageY + row * (cellHeight + gap), cellWidth, cellHeight);
    });

    if (imageList.length > visibleImages.length) {
      context.fillStyle = "rgba(18, 48, 65, 0.76)";
      context.font = "bold 22px Microsoft YaHei";
      context.fillText(`+${imageList.length - visibleImages.length}`, x + width - 48, y + height - 20);
    }
    return;
  }

  context.fillStyle = "#8aa1ad";
  context.font = "18px Microsoft YaHei";
  context.fillText(emptyText, x + 28, y + height / 2 + 10);
}

function drawReferenceImageGrid(context, images, x, y, width, height) {
  const imageList = Array.isArray(images) ? images.filter(Boolean) : [];
  drawRoundRect(context, x, y, width, height, 12, "#eaf4f8", "#d3e8f5");
  if (!imageList.length) return;

  const columns = imageList.length === 1 ? 1 : 2;
  const rows = Math.ceil(imageList.length / columns);
  const gap = 8;
  const cellWidth = (width - 20 - gap * (columns - 1)) / columns;
  const cellHeight = (height - 20 - gap * (rows - 1)) / rows;

  imageList.forEach((image, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    drawContainImage(
      context,
      image,
      x + 10 + col * (cellWidth + gap),
      y + 10 + row * (cellHeight + gap),
      cellWidth,
      cellHeight
    );
  });
}

function drawWrappedText(context, text, x, y, maxWidth, lineHeight, maxLines = Infinity) {
  const lines = getWrappedLines(context, text, maxWidth, maxLines);
  lines.forEach((line, index) => {
    context.fillText(line, x, y + index * lineHeight);
  });
  return y + Math.max(1, lines.length) * lineHeight;
}

function measureWrappedText(context, text, maxWidth, lineHeight) {
  return Math.max(1, getWrappedLines(context, text, maxWidth).length) * lineHeight;
}

function getWrappedLines(context, text, maxWidth, maxLines = Infinity) {
  const source = String(text || "").replace(/\r/g, "");
  const lines = [];

  for (const paragraph of source.split("\n")) {
    let current = "";
    for (const char of paragraph || " ") {
      const next = current + char;
      if (context.measureText(next).width > maxWidth && current) {
        lines.push(current);
        current = char;
        if (lines.length >= maxLines) return lines;
      } else {
        current = next;
      }
    }
    lines.push(current);
    if (lines.length >= maxLines) return lines;
  }

  return lines;
}

function drawRoundRect(context, x, y, width, height, radius, fill, stroke = "") {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
  context.fillStyle = fill;
  context.fill();
  if (stroke) {
    context.strokeStyle = stroke;
    context.lineWidth = 2;
    context.stroke();
  }
}

function drawCoverImage(context, image, x, y, width, height) {
  context.save();
  context.beginPath();
  context.rect(x, y, width, height);
  context.clip();

  const scale = Math.max(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const left = x + (width - drawWidth) / 2;
  const top = y + (height - drawHeight) / 2;
  context.drawImage(image, left, top, drawWidth, drawHeight);
  context.restore();
}

function drawContainImage(context, image, x, y, width, height) {
  context.save();
  context.beginPath();
  context.rect(x, y, width, height);
  context.clip();

  const scale = Math.min(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const left = x + (width - drawWidth) / 2;
  const top = y + (height - drawHeight) / 2;
  context.fillStyle = "#f3f8fb";
  context.fillRect(x, y, width, height);
  context.drawImage(image, left, top, drawWidth, drawHeight);
  context.restore();
}

function loadImage(src) {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

async function loadImageList(urls) {
  const images = [];
  for (const url of urls) {
    const image = await loadImage(url);
    if (image) images.push(image);
  }
  return images;
}

function downloadDataUrl(dataUrl, filename) {
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

function downloadEditableStoryboardFile() {
  saveStoryboardState();
  const html = buildEditableStoryboardHtml();
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${sanitizeFilename(state.job?.title || "storyboard")}-可编辑分镜脚本.html`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1200);
  showToast("已下载可编辑 HTML 文件。");
}

function buildEditableStoryboardHtml() {
  const referenceHtml = [
    state.context.outline
      ? `
      <article class="global-row global-row-outline">
        <h3>修改大纲</h3>
        <p contenteditable="true">${escapeHtml(state.context.outline)}</p>
      </article>
    `
      : "",
    ...REFERENCE_FIELDS.map((field) => {
    const images = getReferenceImages(field.key);
    return `
      <article class="global-row">
        <h3>${escapeHtml(field.label)}</h3>
        <p contenteditable="true">${escapeHtml(state.context[field.key] || "未填写")}</p>
        ${getEditableImagesHtml(images, `${field.label}参考图`)}
      </article>
    `;
    }),
    `
      <article class="global-row">
        <h3>BGM</h3>
        <p contenteditable="true">${escapeHtml(state.context.bgm || "未填写")}</p>
      </article>
    `
  ].join("");

  const shotHtml = state.shots.map((shot, index) => `
    <article class="shot-card">
      <div class="shot-frame">
        <div class="shot-image-section">
          <strong>分镜图</strong>
          ${getEditableImagesHtml(getShotStoryboardDataUrls(shot), "拖拽或点击上传分镜图")}
        </div>
        <div class="shot-image-section">
          <strong>资产图</strong>
          ${getEditableImagesHtml(getShotAssetDataUrls(shot), "拖拽或点击上传资产图")}
        </div>
      </div>
      <div class="shot-fields">
        <div class="shot-head">
          <h3 contenteditable="true">镜头 ${index + 1}</h3>
        </div>
        <section class="shot-field-block shot-field-time">
          <span>镜头时间</span>
          <p contenteditable="true">${escapeHtml(shot.time || "未识别")}</p>
        </section>
        <section class="shot-field-block shot-field-description">
          <span>画面描述</span>
          <p contenteditable="true">${escapeHtml(shot.description || "未识别")}</p>
        </section>
        <section class="shot-field-block shot-field-camera">
          <span>镜头语言</span>
          <p contenteditable="true">${escapeHtml(shot.camera || "未识别")}</p>
        </section>
      </div>
    </article>
  `).join("");

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(state.job?.title || "可编辑分镜脚本")}</title>
  <style>
    :root { --bg: #ffffff; --panel: #ffffff; --panel-2: #f7fbfc; --border: #d5e8ed; --text: #10232b; --muted: #5f7580; --accent: #12866f; --accent-2: #58d7b1; --shadow: 0 18px 42px rgba(39, 90, 112, 0.1); }
    *, *::before, *::after { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; color: var(--text); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; background: var(--bg); }
    button, input, textarea, select { font: inherit; }
    button { border: 1px solid var(--border); border-radius: 12px; padding: 11px 16px; color: var(--text); background: #f3f8fa; font-weight: 800; cursor: pointer; }
    button:hover:not(:disabled) { border-color: rgba(127, 230, 195, 0.65); background: #eaf7f3; }
    .page { width: min(1480px, calc(100vw - 36px)); margin: 0 auto; padding: 28px 0 42px; display: grid; gap: 18px; }
    header, .block { border: 1px solid var(--border); border-radius: 22px; background: var(--panel); box-shadow: var(--shadow); }
    header { padding: 24px; display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; }
    .export-actions { display: flex; gap: 10px; flex-wrap: wrap; justify-content: flex-end; min-width: 360px; }
    .export-actions button { border-color: transparent; color: #ffffff; background: var(--accent); }
    .template-badge { display: inline-grid; place-items: center; min-height: 42px; padding: 0 14px; border-radius: 12px; color: #08715e; background: #d9fbec; font-size: 13px; font-weight: 900; }
    h1, h2, h3, p { margin-top: 0; }
    h1 { margin-bottom: 10px; font-size: 30px; }
    h2 { margin: 0 0 14px; color: var(--accent); font-size: 18px; }
    h3 { margin-bottom: 0; }
    p { margin-bottom: 0; line-height: 1.7; }
    [contenteditable="true"] { outline: 2px dashed transparent; border-radius: 8px; }
    [contenteditable="true"]:focus { outline-color: #7fe6c3; background: #f0fff9; }
    .block { padding: 18px 20px 20px; }
    .global-list { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }
    .global-row { display: grid; grid-template-columns: 1fr; align-content: start; gap: 12px; min-height: 330px; padding: 16px; border: 1px solid var(--border); border-radius: 22px; background: #f8fcfd; }
    .global-row-outline { grid-column: 1 / -1; min-height: auto; }
    .global-row h3 { margin: 0; color: var(--accent); font-size: 16px; }
    .script-box { min-height: 112px; white-space: pre-wrap; border: 1px solid #cfe1e7; border-radius: 16px; padding: 14px; line-height: 1.7; background: #ffffff; }
    .shot-list { display: grid; gap: 14px; }
    .shot-card { display: grid; grid-template-columns: 380px minmax(0, 1fr); gap: 18px; padding: 16px; border: 1px solid var(--border); border-radius: 22px; background: #f8fcfd; }
    .shot-frame { display: grid; gap: 12px; align-content: start; padding: 14px; border: 1px solid var(--border); border-radius: 20px; background: #ffffff; }
    .shot-image-section { display: grid; gap: 9px; padding: 10px; border: 1px solid var(--border); border-radius: 16px; background: #ffffff; }
    .shot-image-section > strong { color: var(--accent); font-size: 13px; }
    .figure-grid { width: 100%; min-height: 120px; max-height: 260px; padding: 8px; display: grid; grid-template-columns: repeat(auto-fit, minmax(74px, 1fr)); align-items: center; justify-items: center; gap: 8px; overflow: hidden; border: 1px dashed transparent; border-radius: 14px; color: var(--muted); background: #f8fcfd; }
    .figure-grid.is-empty { place-items: center; grid-template-columns: 1fr; }
    .figure-grid.has-images { align-items: start; overflow-y: auto; padding-right: 10px; }
    .figure-grid.has-images::-webkit-scrollbar { width: 8px; }
    .figure-grid.has-images::-webkit-scrollbar-thumb { background: #b9d7df; border-radius: 999px; }
    .figure-grid.has-images::-webkit-scrollbar-track { background: #edf6fb; border-radius: 999px; }
    .editable-image-cell { position: relative; width: 100%; min-width: 0; display: grid; gap: 8px; }
    .figure-grid.has-images .editable-image-cell { min-height: 96px; padding: 6px; border: 2px solid transparent; border-radius: 12px; background: #edf6fb; }
    .figure-grid.has-images .editable-image-cell:not(.is-empty) { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(20, 184, 166, 0.14); }
    .image-preview-slot { display: grid; place-items: center; width: 100%; max-width: 100%; min-height: 96px; border-radius: 10px; background: #edf6fb; overflow: hidden; cursor: pointer; }
    .image-preview-slot.is-drag-over { outline: 2px solid var(--accent); background: #edfff9; }
    .figure-grid.is-empty .image-preview-slot { min-height: 120px; }
    .image-thumbnail-frame { display: grid; place-items: center; width: 100%; height: 160px; border-radius: 10px; background: #edf6fb; overflow: hidden; }
    .image-thumbnail-frame img { display: block; width: 100%; height: 160px; object-fit: contain; object-position: center; border-radius: 10px; background: #edf6fb; }
    .editable-image-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; width: 100%; }
    .editable-image-actions button { min-height: 36px; padding: 0 8px; font-size: 12px; }
    .editable-image-actions .danger { color: #b42318; background: #fff5f5; border-color: #ffd6d6; }
    .editable-image-input { display: none; }
    .placeholder { display: grid; place-items: center; width: 100%; min-height: 120px; padding: 10px; color: var(--muted); text-align: center; background: #f8fcfd; border-radius: 10px; }
    .shot-fields { display: grid; align-content: start; gap: 12px; }
    .shot-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-height: 48px; padding: 2px 4px 8px; }
    .shot-head h3 { margin: 0; font-size: 16px; }
    .shot-field-block { display: grid; gap: 12px; padding: 14px; border: 1px solid #cfe1e7; border-radius: 16px; background: #ffffff; }
    .shot-field-block span { color: var(--accent); font-size: 14px; font-weight: 900; }
    .shot-field-block p { width: 100%; margin: 0; border: 1px solid #cfe1e7; border-radius: 14px; padding: 14px 16px; font-weight: 800; line-height: 1.7; background: #ffffff; }
    .shot-field-time p { min-height: 92px; display: flex; align-items: center; }
    .shot-field-description p, .shot-field-camera p { min-height: 160px; }
    @media (max-width: 1120px) { header { flex-direction: column; align-items: stretch; } .export-actions { min-width: 0; justify-content: flex-start; } .global-list { grid-template-columns: 1fr; } }
    @media (max-width: 720px) { .page { width: calc(100vw - 20px); padding-top: 10px; } .shot-card { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main class="page">
    <header>
      <div>
        <h1 contenteditable="true">${escapeHtml(state.job?.title || "可编辑分镜脚本")}</h1>
        <p contenteditable="true">来源：${escapeHtml(state.job?.pageTitle || "未识别")} · ${state.shots.length} 个镜头 · ${state.frames.length} 张抽帧</p>
      </div>
      <div class="export-actions">
        <span class="template-badge">缩略图版 · 完整显示</span>
        <button type="button" onclick="downloadCurrentHtml()">下载当前修改版 HTML</button>
      </div>
    </header>
    <section class="block">
      <h2>全局参考列表</h2>
      <div class="global-list">${referenceHtml}</div>
    </section>
    <section class="block">
      <h2>识别视频脚本文案</h2>
      <div class="script-box" contenteditable="true">${escapeHtml(state.videoScript || "未填写")}</div>
    </section>
    <section class="block">
      <h2>分镜列表</h2>
      <div class="shot-list">${shotHtml}</div>
    </section>
  </main>
  <script id="self-save-script">
    function chooseImageReplacement(button) {
      const cell = button.closest('.editable-image-cell');
      const input = cell && cell.querySelector('.editable-image-input');
      if (input) input.click();
    }

    function handleImageSlotKeydown(event, target) {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      chooseImageReplacement(target);
    }

    function handleImageDragOver(event, target) {
      event.preventDefault();
      target.classList.add('is-drag-over');
    }

    function handleImageDragLeave(event, target) {
      event.preventDefault();
      target.classList.remove('is-drag-over');
    }

    function handleImageDrop(event, target) {
      event.preventDefault();
      target.classList.remove('is-drag-over');
      const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
      if (!file || !/^image\\//i.test(file.type || '')) return;
      replaceCellImage(target.closest('.editable-image-cell'), file);
    }

    function handleImageReplacement(input) {
      const cell = input.closest('.editable-image-cell');
      const file = input.files && input.files[0];
      if (!cell || !file || !/^image\\//i.test(file.type || '')) return;
      replaceCellImage(cell, file);
      input.value = '';
    }

    function replaceCellImage(cell, file) {
      if (!cell || !file) return;
      const reader = new FileReader();
      reader.onload = function() {
        const preview = cell.querySelector('.image-preview-slot');
        preview.replaceChildren(createImagePreview(String(reader.result || ''), cell.dataset.empty || '替换图片'));
        cell.classList.remove('is-empty');
        const uploadButton = cell.querySelector('[data-upload-button]');
        if (uploadButton) uploadButton.textContent = '替换图片';
        syncFigureGridState(cell);
      };
      reader.readAsDataURL(file);
    }

    function clearEditableImage(button) {
      const cell = button.closest('.editable-image-cell');
      if (!cell) return;
      const preview = cell.querySelector('.image-preview-slot');
      const placeholder = document.createElement('div');
      placeholder.className = 'placeholder';
      placeholder.textContent = cell.dataset.empty || '未上传图片';
      preview.replaceChildren(placeholder);
      cell.classList.add('is-empty');
      const uploadButton = cell.querySelector('[data-upload-button]');
      if (uploadButton) uploadButton.textContent = '上传图片';
      syncFigureGridState(cell);
    }

    function syncFigureGridState(cell) {
      const grid = cell && cell.closest('.figure-grid');
      if (!grid) return;
      const hasImage = Boolean(grid.querySelector('.editable-image-cell:not(.is-empty) img'));
      grid.classList.toggle('has-images', hasImage);
      grid.classList.toggle('is-empty', !hasImage);
    }

    function createImagePreview(src, alt) {
      const frame = document.createElement('div');
      frame.className = 'image-thumbnail-frame';
      const image = document.createElement('img');
      image.src = src;
      image.alt = alt || '缩略图';
      frame.append(image);
      return frame;
    }

    function downloadCurrentHtml() {
      const html = '<!doctype html>\\n' + document.documentElement.outerHTML;
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = document.title.replace(/[\\\\/:*?"<>|\\s]+/g, '-') + '-修改版.html';
      document.body.append(a);
      a.click();
      URL.revokeObjectURL(a.href);
      a.remove();
    }
  </script>
</body>
</html>`;
}

function getEditableImagesHtml(urls, emptyText) {
  const list = Array.isArray(urls) ? urls.filter(Boolean) : [];
  if (!list.length) {
    return `<div class="figure-grid is-empty">${getEditableImageCellHtml("", emptyText, 0)}</div>`;
  }

  return `<div class="figure-grid has-images">${list.map((url, index) => getEditableImageCellHtml(url, emptyText, index)).join("")}</div>`;
}

function getEditableImageCellHtml(url, emptyText, index) {
  const hasImage = Boolean(url);
  return `
    <div class="editable-image-cell${hasImage ? "" : " is-empty"}" data-empty="${escapeAttribute(emptyText)}">
      <div class="image-preview-slot" role="button" tabindex="0" onclick="chooseImageReplacement(this)" onkeydown="handleImageSlotKeydown(event, this)" ondragover="handleImageDragOver(event, this)" ondragleave="handleImageDragLeave(event, this)" ondrop="handleImageDrop(event, this)">
        ${hasImage ? `<div class="image-thumbnail-frame"><img src="${escapeAttribute(url)}" alt="${escapeAttribute(emptyText)} ${index + 1}" /></div>` : `<div class="placeholder">${escapeHtml(emptyText)}</div>`}
      </div>
      <div class="editable-image-actions">
        <button type="button" data-upload-button onclick="chooseImageReplacement(this)">${hasImage ? "替换图片" : "上传图片"}</button>
        <button type="button" class="danger" onclick="clearEditableImage(this)">删除</button>
      </div>
      <input class="editable-image-input" type="file" accept="image/*" onchange="handleImageReplacement(this)" />
    </div>
  `;
}

async function copyStoryboardText() {
  const text = formatStoryboardText();
  try {
    await navigator.clipboard.writeText(text);
  } catch (error) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.append(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
  showToast("脚本文本已复制。");
}

function formatStoryboardText() {
  const contextLines = [
    ...REFERENCE_FIELDS.map((field) => `${field.label}：${state.context[field.key] || "未填写"}`)
  ].filter(Boolean);
  if (state.context.bgm) {
    contextLines.push(`BGM：${state.context.bgm}`);
  }
  const shotLines = state.shots.map((shot, index) =>
    [
      `镜头 ${index + 1}`,
      `镜头时间：${shot.time || "未识别"}`,
      `画面描述：${shot.description || "未识别"}`,
      `镜头语言：${shot.camera || "未识别"}`,
      `对应分镜图：${getShotStoryboardSourceText(shot)}`,
      `对应资产图：${getShotAssetSourceText(shot)}`
    ].join("\n")
  );

  return [
    `【主体/场景/风格/BGM】`,
    contextLines.join("\n"),
    state.videoScript ? `\n【识别视频脚本文案】\n${state.videoScript}` : "",
    "",
    `【分镜列表】`,
    shotLines.join("\n\n")
  ].join("\n").trim();
}

function guessFrameIndex(shot, index, frames, totalShots) {
  if (!frames.length) return -1;

  const startTime = parseStartTime(shot?.time || shot?.镜头时间 || "");
  if (Number.isFinite(startTime)) {
    let bestIndex = 0;
    let bestDistance = Infinity;
    frames.forEach((frame, frameIndex) => {
      const frameTime = Number.isFinite(frame.relativeTime) ? frame.relativeTime : frame.time;
      if (!Number.isFinite(frameTime)) return;
      const distance = Math.abs(frameTime - startTime);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = frameIndex;
      }
    });
    return bestIndex;
  }

  return Math.min(frames.length - 1, Math.floor((index / Math.max(1, totalShots)) * frames.length));
}

function parseStartTime(value) {
  const match = String(value || "").match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const number = Number(match[1]);
  return Number.isFinite(number) ? number : null;
}

function getFrameLabel(frame, index) {
  const time = Number.isFinite(frame?.relativeTime) ? frame.relativeTime : frame?.time;
  if (Number.isFinite(time)) return `${Math.round(time)}s`;
  return `第 ${index + 1} 帧`;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("读取图片失败。"));
    reader.readAsDataURL(file);
  });
}

async function readClipboardImageAsDataUrl() {
  if (!navigator.clipboard?.read) {
    throw new Error("当前浏览器不支持读取剪贴板图片，请改用上传。");
  }

  const items = await navigator.clipboard.read();
  for (const item of items) {
    const imageType = item.types.find((type) => /^image\//i.test(type));
    if (!imageType) continue;
    const blob = await item.getType(imageType);
    return readFileAsDataUrl(blob);
  }

  throw new Error("剪贴板里没有图片。");
}

async function readPasteEventImageAsDataUrl(event) {
  const items = Array.from(event.clipboardData?.items || []);
  for (const item of items) {
    if (!/^image\//i.test(item.type || "")) continue;
    const file = item.getAsFile();
    if (!file) continue;
    return readFileAsDataUrl(file);
  }

  return "";
}

async function normalizeGeneratedImageUrl(url) {
  const source = String(url || "").trim();
  if (!source) return "";
  if (/^data:image\//i.test(source)) return source;

  try {
    const response = await fetch(source);
    if (!response.ok) return source;
    const blob = await response.blob();
    if (!/^image\//i.test(blob.type || "")) return source;
    return readFileAsDataUrl(blob);
  } catch (error) {
    return source;
  }
}

function sanitizeFilename(value) {
  return String(value || "storyboard")
    .replace(/[\\/:*?"<>|\s]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "storyboard";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[char]);
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }

    if (Number.isFinite(value)) {
      return String(value);
    }
  }

  return "";
}

function sendMessage(type, payload = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, payload }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      if (response?.ok === false) {
        reject(new Error(response.error || "请求失败。"));
        return;
      }

      resolve(response?.data ?? response);
    });
  });
}

function showToast(message, isError = false) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  if (isError) {
    toast.style.background = "var(--danger)";
  }
  document.body.append(toast);
  window.setTimeout(() => toast.remove(), 2200);
}

const els = {
  stepTabs: Array.from(document.querySelectorAll("[data-step-target]")),
  stepPanels: Array.from(document.querySelectorAll("[data-step-panel]")),
  nextButtons: Array.from(document.querySelectorAll("[data-next-step]")),
  prevButtons: Array.from(document.querySelectorAll("[data-prev-step]")),
  dropzone: document.querySelector("#video-dropzone"),
  videoInput: document.querySelector("#video-file-input"),
  upscaleEnabled: document.querySelector("#upscale-enabled"),
  upscaleRouteInputs: Array.from(document.querySelectorAll("[name='upscale-route']")),
  upscaleTarget: document.querySelector("#upscale-target"),
  upscaleSharpness: document.querySelector("#upscale-sharpness"),
  upscaleSharpnessValue: document.querySelector("#upscale-sharpness-value"),
  upscaleClarity: document.querySelector("#upscale-clarity"),
  upscaleClarityValue: document.querySelector("#upscale-clarity-value"),
  watermarkEnabled: document.querySelector("#watermark-enabled"),
  identifierPreset: document.querySelector("#identifier-preset"),
  saveIdentifierPreset: document.querySelector("#save-identifier-preset"),
  identifierText: document.querySelector("#identifier-text"),
  identifierX: document.querySelector("#identifier-x"),
  identifierY: document.querySelector("#identifier-y"),
  identifierStage: document.querySelector("#identifier-stage"),
  identifierPreviewText: document.querySelector("#identifier-preview-text"),
  watermarkSize: document.querySelector("#watermark-size"),
  watermarkSizeValue: document.querySelector("#watermark-size-value"),
  watermarkOpacity: document.querySelector("#watermark-opacity"),
  watermarkOpacityValue: document.querySelector("#watermark-opacity-value"),
  outputMode: document.querySelector("#output-mode"),
  outputName: document.querySelector("#output-name"),
  outputSize: document.querySelector("#output-size"),
  outputFps: document.querySelector("#output-fps"),
  mergeEnabled: document.querySelector("#merge-enabled"),
  removeEnding: document.querySelector("#remove-ending"),
  endingSeconds: document.querySelector("#ending-seconds"),
  batchRenamePattern: document.querySelector("#batch-rename-pattern"),
  applyBatchRename: document.querySelector("#apply-batch-rename"),
  clearUploadedVideos: document.querySelector("#clear-uploaded-videos"),
  uploadPreview: document.querySelector("#upload-preview"),
  segments: document.querySelector("#segments"),
  selectionSummary: document.querySelector("#selection-summary"),
  taskSummary: document.querySelector("#task-summary"),
  status: document.querySelector("#status"),
  detectEndings: document.querySelector("#detect-endings"),
  applyEndingTail: document.querySelector("#apply-ending-tail"),
  renderOutput: document.querySelector("#render-output"),
  mergeStoryboard: document.querySelector("#merge-storyboard"),
  selectAllSegments: document.querySelector("#select-all-segments"),
  selectNoSegments: document.querySelector("#select-no-segments"),
  downloadProject: document.querySelector("#download-project"),
  importProject: document.querySelector("#import-project"),
  resetProject: document.querySelector("#reset-project"),
  undo: document.querySelector("#undo"),
  redo: document.querySelector("#redo"),
  template: document.querySelector("#segment-template")
};

const previewUrls = new Map();
let draggedSegmentId = "";

const emptySegment = (file = null) => ({
  id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
  path: file?.name || "",
  start: "",
  end: "",
  previewName: file?.name || "",
  duration: 0,
  selected: true,
  upscale: false,
  endingDetectedAt: "",
  note: ""
});

let state = defaultState();
let undoStack = [];
let redoStack = [];
let isRendering = false;
let isProcessing = false;
init();

function init() {
  hydrateFromStorage();
  bindEvents();
  render();
}

function defaultState() {
  return {
    currentStep: "upload",
    upscaleEnabled: true,
    upscaleRoute: "conservative",
    upscaleTarget: "long-3840",
    upscaleSharpness: "35",
    upscaleClarity: "22",
    watermarkEnabled: true,
    identifierText: "视频批处理工具",
    identifierPresets: ["视频批处理工具"],
    identifierX: "50",
    identifierY: "8",
    watermarkSize: "15",
    watermarkOpacity: "85",
    outputMode: "merge",
    outputName: "marked-final.webm",
    outputSize: "1920:1080",
    outputFps: "30",
    mergeEnabled: true,
    removeEnding: true,
    endingMode: "manual",
    endingSeconds: "5",
    watermarkImageName: "",
    watermarkImageDataUrl: "",
    batchRenamePattern: "视频-{n}",
    segments: []
  };
}

function bindEvents() {
  els.stepTabs.forEach((tab) => tab.addEventListener("click", () => updateState({ currentStep: tab.dataset.stepTarget })));
  els.nextButtons.forEach((button) => button.addEventListener("click", () => updateState({ currentStep: button.dataset.nextStep })));
  els.prevButtons.forEach((button) => button.addEventListener("click", () => updateState({ currentStep: button.dataset.prevStep })));

  els.upscaleEnabled.addEventListener("change", () => updateState({ upscaleEnabled: els.upscaleEnabled.checked }));
  els.upscaleRouteInputs.forEach((input) =>
    input.addEventListener("change", () => input.checked && updateState({ upscaleRoute: input.value }))
  );
  els.upscaleTarget.addEventListener("change", () => updateState({ upscaleTarget: els.upscaleTarget.value }));
  els.upscaleSharpness.addEventListener("input", () => updateState({ upscaleSharpness: els.upscaleSharpness.value }));
  els.upscaleClarity.addEventListener("input", () => updateState({ upscaleClarity: els.upscaleClarity.value }));
  els.watermarkEnabled.addEventListener("change", () => updateState({ watermarkEnabled: els.watermarkEnabled.checked }));
  els.identifierPreset.addEventListener("change", () => {
    if (els.identifierPreset.value) updateState({ identifierText: els.identifierPreset.value });
  });
  els.saveIdentifierPreset.addEventListener("click", saveIdentifierPreset);
  els.identifierText.addEventListener("input", () => updateState({ identifierText: els.identifierText.value }));
  els.identifierX.addEventListener("input", () => updateState({ identifierX: els.identifierX.value }));
  els.identifierY.addEventListener("input", () => updateState({ identifierY: els.identifierY.value }));
  els.identifierStage.addEventListener("pointerdown", startIdentifierDrag);
  els.watermarkSize.addEventListener("input", () => updateState({ watermarkSize: els.watermarkSize.value }));
  els.watermarkOpacity.addEventListener("input", () => updateState({ watermarkOpacity: els.watermarkOpacity.value }));
  els.outputMode.addEventListener("change", () => updateState({ outputMode: els.outputMode.value }));
  els.outputName.addEventListener("input", () => updateState({ outputName: els.outputName.value }));
  els.outputSize.addEventListener("change", () => updateState({ outputSize: els.outputSize.value }));
  els.outputFps.addEventListener("change", () => updateState({ outputFps: els.outputFps.value }));
  els.mergeEnabled.addEventListener("change", () => updateState({ mergeEnabled: els.mergeEnabled.checked }));
  els.removeEnding.addEventListener("change", () => updateState({ removeEnding: els.removeEnding.checked }, "自动去落版设置已更新。"));
  els.endingSeconds.addEventListener("input", () => updateState({ endingSeconds: els.endingSeconds.value }, "末尾裁掉秒数已更新。"));

  els.videoInput.addEventListener("change", (event) => addVideoFiles(event.target.files));
  els.batchRenamePattern.addEventListener("input", () => updateState({ batchRenamePattern: els.batchRenamePattern.value }));
  els.applyBatchRename.addEventListener("click", applyBatchRename);
  els.clearUploadedVideos.addEventListener("click", clearUploadedVideos);
  bindDropzone(els.dropzone, (files) => addVideoFiles(files));

  els.detectEndings.addEventListener("click", detectAllEndings);
  els.applyEndingTail.addEventListener("click", applyTailToAllSegments);
  els.renderOutput.addEventListener("click", renderOutput);
  els.selectAllSegments.addEventListener("click", () => setAllSegmentsSelected(true));
  els.selectNoSegments.addEventListener("click", () => setAllSegmentsSelected(false));
  els.downloadProject.addEventListener("click", downloadProject);
  els.importProject.addEventListener("change", importProject);
  els.resetProject.addEventListener("click", () => replaceState(defaultState(), "项目已重置。"));
  els.undo.addEventListener("click", undo);
  els.redo.addEventListener("click", redo);
}

function hydrateFromStorage() {
  try {
    const stored = JSON.parse(localStorage.getItem("promptlens-video-tool") || "null");
    if (stored) {
      state = normalizeProject(stored);
      state.segments = [];
    }
  } catch (error) {
    state = defaultState();
  }
}

function updateState(patch, message = "") {
  if (isRendering) return;
  pushUndo();
  state = normalizeProject({ ...state, ...patch });
  redoStack = [];
  render(message);
}

function replaceState(next, message = "") {
  pushUndo();
  revokeAllPreviewUrls();
  state = normalizeProject(next);
  redoStack = [];
  render(message);
}

function pushUndo() {
  undoStack.push(clone(state));
  undoStack = undoStack.slice(-60);
}

function undo() {
  const previous = undoStack.pop();
  if (!previous) return;
  redoStack.push(clone(state));
  state = previous;
  render("已撤销上一步。");
}

function redo() {
  const next = redoStack.pop();
  if (!next) return;
  undoStack.push(clone(state));
  state = next;
  render("已重做。");
}

function render(message = "") {
  isRendering = true;
  renderSteps();
  renderControls();
  renderIdentifierPreview();
  renderUploadSummary();
  renderSegments();
  renderMergeStoryboard();
  renderSummaries();
  els.undo.disabled = !undoStack.length;
  els.redo.disabled = !redoStack.length;
  els.detectEndings.disabled = !state.segments.length || !state.removeEnding;
  els.renderOutput.disabled = !state.segments.length || isProcessing;
  localStorage.setItem("promptlens-video-tool", JSON.stringify(state));
  if (message) setStatus(message);
  isRendering = false;
}

function renderSteps() {
  els.stepTabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.stepTarget === state.currentStep);
    tab.classList.toggle("focused", tab.dataset.stepTarget === "process" && state.currentStep === "process");
  });
  els.stepPanels.forEach((panel) => {
    panel.hidden = panel.dataset.stepPanel !== state.currentStep;
  });
}

function renderControls() {
  els.upscaleEnabled.checked = state.upscaleEnabled;
  els.upscaleRouteInputs.forEach((input) => (input.checked = input.value === state.upscaleRoute));
  els.upscaleTarget.value = state.upscaleTarget;
  els.upscaleSharpness.value = state.upscaleSharpness;
  els.upscaleSharpnessValue.value = `${state.upscaleSharpness}%`;
  els.upscaleClarity.value = state.upscaleClarity;
  els.upscaleClarityValue.value = `${state.upscaleClarity}%`;
  els.batchRenamePattern.value = state.batchRenamePattern;
  els.watermarkEnabled.checked = state.watermarkEnabled;
  renderIdentifierPresets();
  els.identifierText.value = state.identifierText;
  els.identifierX.value = state.identifierX;
  els.identifierY.value = state.identifierY;
  els.watermarkSize.value = state.watermarkSize;
  els.watermarkSizeValue.value = `${state.watermarkSize}%`;
  els.watermarkOpacity.value = state.watermarkOpacity;
  els.watermarkOpacityValue.value = `${state.watermarkOpacity}%`;
  els.outputMode.value = state.outputMode;
  els.outputName.value = state.outputName;
  els.outputSize.value = state.outputSize;
  els.outputFps.value = state.outputFps;
  els.mergeEnabled.checked = state.mergeEnabled;
  els.removeEnding.checked = state.removeEnding;
  els.endingSeconds.value = state.endingSeconds;
  updateToggleCards();
}

function updateToggleCards() {
  document.querySelector("[data-toggle-card='upscale']").classList.toggle("enabled-card", state.upscaleEnabled);
  document.querySelector("[data-toggle-card='watermark']").classList.toggle("enabled-card", state.watermarkEnabled);
  document.querySelector("[data-toggle-card='ending']").classList.toggle("enabled-card", state.removeEnding);
  document.querySelector("[data-toggle-card='merge']").classList.toggle("enabled-card", state.mergeEnabled);
}

function renderIdentifierPreview() {
  const text = state.identifierText || "标识语";
  els.identifierPreviewText.textContent = text;
  els.identifierPreviewText.style.left = `${clamp(Number(state.identifierX) || 50, 0, 100)}%`;
  els.identifierPreviewText.style.top = `${clamp(Number(state.identifierY) || 8, 0, 100)}%`;
  els.identifierPreviewText.style.fontSize = `${Math.max(12, Number(state.watermarkSize) * 1.3 || 20)}px`;
  els.identifierPreviewText.style.opacity = String(clamp((Number(state.watermarkOpacity) || 85) / 100, 0.1, 1));
}

function renderIdentifierPresets() {
  const current = els.identifierPreset.value;
  els.identifierPreset.replaceChildren();
  const blank = document.createElement("option");
  blank.value = "";
  blank.textContent = "选择常用标识语";
  els.identifierPreset.append(blank);
  state.identifierPresets.forEach((text) => {
    const option = document.createElement("option");
    option.value = text;
    option.textContent = text;
    els.identifierPreset.append(option);
  });
  els.identifierPreset.value = state.identifierPresets.includes(current) ? current : "";
}

function saveIdentifierPreset() {
  const text = String(state.identifierText || "").trim();
  if (!text) {
    setStatus("先输入标识语，再保存为常用。");
    return;
  }
  const identifierPresets = [text, ...state.identifierPresets.filter((item) => item !== text)].slice(0, 12);
  updateState({ identifierPresets }, "标识语已保存为常用。");
}

function renderUploadSummary() {
  els.uploadPreview.replaceChildren();
  state.segments.forEach((segment, index) => {
    const url = previewUrls.get(segment.id);
    if (!url) return;
    const preview = document.createElement("article");
    preview.className = "upload-preview-card";
    preview.dataset.id = segment.id;
    const video = document.createElement("video");
    video.src = url;
    video.controls = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.addEventListener("loadedmetadata", () => {
      const width = video.videoWidth || 16;
      const height = video.videoHeight || 9;
      preview.style.setProperty("--video-ratio", `${width} / ${height}`);
      const scale = Math.min(1, 360 / width, 240 / height);
      preview.style.width = `${Math.max(140, Math.round(width * scale))}px`;
    });
    const name = document.createElement("strong");
    name.textContent = `${index + 1}. ${segment.previewName || segment.path || "未命名视频"}`;
    const controls = document.createElement("div");
    controls.className = "upload-preview-controls";
    const rename = document.createElement("input");
    rename.className = "preview-name-input";
    rename.value = segment.previewName || segment.path || "";
    rename.placeholder = "视频名称";
    rename.addEventListener("change", () => renameSegment(segment.id, rename.value));
    const upscale = document.createElement("label");
    upscale.className = "preview-upscale-check";
    const upscaleInput = document.createElement("input");
    upscaleInput.type = "checkbox";
    upscaleInput.checked = Boolean(segment.upscale);
    upscaleInput.addEventListener("change", () => updateSegmentFields(segment.id, { upscale: upscaleInput.checked }));
    upscale.append(upscaleInput, document.createTextNode("高清处理"));
    controls.append(rename, upscale);
    const remove = document.createElement("button");
    remove.className = "preview-remove";
    remove.type = "button";
    remove.title = "移除视频";
    remove.textContent = "×";
    remove.addEventListener("click", () => removeSegment(segment.id));
    preview.append(video, name, controls, remove);
    els.uploadPreview.append(preview);
  });
}

function startIdentifierDrag(event) {
  if (event.target !== els.identifierPreviewText) return;
  event.preventDefault();
  const rect = els.identifierStage.getBoundingClientRect();

  const onMove = (moveEvent) => {
    const x = clamp(((moveEvent.clientX - rect.left) / rect.width) * 100, 0, 100);
    const y = clamp(((moveEvent.clientY - rect.top) / rect.height) * 100, 0, 100);
    state = normalizeProject({ ...state, identifierX: String(Math.round(x)), identifierY: String(Math.round(y)) });
    renderIdentifierPreview();
    renderControls();
  };

  const onUp = () => {
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
    pushUndo();
    localStorage.setItem("promptlens-video-tool", JSON.stringify(state));
    renderSummaries();
  };

  document.addEventListener("pointermove", onMove);
  document.addEventListener("pointerup", onUp);
}

function renderWaveform(container, seed) {
  if (!container || container.childElementCount) return;
  const base = Array.from(String(seed || "segment")).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  for (let index = 0; index < 80; index += 1) {
    const bar = document.createElement("span");
    const value = 18 + ((base + index * 17 + (index % 7) * 11) % 30);
    bar.style.height = `${value}%`;
    container.append(bar);
  }
}

async function generateFilmstrip(segmentId, node) {
  const thumbs = node.querySelector("[data-strip-thumbs]");
  if (!thumbs || thumbs.dataset.ready === "true") return;
  const url = previewUrls.get(segmentId);
  if (!url) return;
  thumbs.dataset.ready = "true";
  thumbs.textContent = "";

  try {
    const video = await createLoadedVideo(url);
    const duration = Number(video.duration) || 0;
    const count = 8;
    for (let index = 0; index < count; index += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = 96;
      canvas.height = 54;
      const time = duration ? (duration * (index + 0.5)) / count : 0;
      await seekVideo(video, Math.min(time, Math.max(0, duration - 0.1)));
      drawVideoContain(canvas.getContext("2d", { alpha: false }), video, 0, 0, canvas.width, canvas.height);
      thumbs.append(canvas);
    }
  } catch (error) {
    thumbs.dataset.ready = "false";
  }
}

function renderSegments() {
  els.segments.className = state.segments.length ? "segments-list" : "segments-empty";
  els.segments.replaceChildren();

  if (!state.segments.length) {
    els.segments.textContent = "上传视频后，可在这里逐个检测预览和调整剪辑区间。";
    return;
  }

  state.segments.forEach((segment, index) => {
    const node = els.template.content.firstElementChild.cloneNode(true);
    const video = node.querySelector("[data-preview-video]");
    node.dataset.id = segment.id;
    node.querySelector("[data-segment-selected]").checked = segment.selected !== false;
    node.querySelector("strong").textContent = `片段 ${index + 1}`;
    node.querySelector("[data-preview-name]").textContent = segment.previewName || segment.path || "未命名视频";
    node.querySelector("[data-segment-note]").textContent = segment.note || "";
    node.querySelector("[data-strip-label]").textContent =
      `${segment.previewName || segment.path || "未命名视频"}  ${formatShortTime(parseTime(segment.start) || 0)} - ${formatShortTime(parseTime(segment.end) || segment.duration || 0)}`;
    renderWaveform(node.querySelector("[data-strip-wave]"), segment.id);

    const url = previewUrls.get(segment.id);
    if (url) video.src = url;
    video.addEventListener("loadedmetadata", () => {
      const patch = { duration: video.duration };
      if (state.removeEnding && state.endingMode === "manual" && !segment.end) {
        const tail = Number(state.endingSeconds) || 0;
        const end = Math.max(0, video.duration - tail);
        if (end > 0 && end < video.duration) patch.end = formatSeconds(end);
      }
      updateSegmentFields(segment.id, patch, false);
      syncTimeline(node, segment.id, video);
      generateFilmstrip(segment.id, node);
      renderSummaries();
    });
    video.addEventListener("timeupdate", () => syncTimeline(node, segment.id, video));

    const timeline = node.querySelector("[data-timeline]");
    timeline.addEventListener("pointerdown", (event) => seekOnTimeline(event, segment.id, video, timeline));
    const range = node.querySelector("[data-range]");
    range.addEventListener("pointerdown", (event) => startRangeDrag(event, segment.id, timeline, "move"));
    range.querySelector("[data-handle='start']").addEventListener("pointerdown", (event) =>
      startRangeDrag(event, segment.id, timeline, "start")
    );
    range.querySelector("[data-handle='end']").addEventListener("pointerdown", (event) =>
      startRangeDrag(event, segment.id, timeline, "end")
    );
    const strip = node.querySelector("[data-editor-strip]");
    strip.addEventListener("pointerdown", (event) => {
      if (event.target.closest("[data-strip-range]")) return;
      seekOnTimeline(event, segment.id, video, strip);
    });
    const stripRange = node.querySelector("[data-strip-range]");
    stripRange.addEventListener("pointerdown", (event) => startRangeDrag(event, segment.id, strip, "move"));
    stripRange.querySelector("[data-strip-handle='start']").addEventListener("pointerdown", (event) =>
      startRangeDrag(event, segment.id, strip, "start")
    );
    stripRange.querySelector("[data-strip-handle='end']").addEventListener("pointerdown", (event) =>
      startRangeDrag(event, segment.id, strip, "end")
    );

    node.addEventListener("dragstart", () => (draggedSegmentId = segment.id));
    node.addEventListener("dragover", (event) => {
      event.preventDefault();
      node.classList.add("drag-over");
    });
    node.addEventListener("dragleave", () => node.classList.remove("drag-over"));
    node.addEventListener("drop", (event) => {
      event.preventDefault();
      node.classList.remove("drag-over");
      moveSegmentById(draggedSegmentId, segment.id);
    });

    node.querySelector("[data-segment-selected]").addEventListener("change", (event) =>
      updateSegmentFields(segment.id, { selected: event.target.checked })
    );
    node.querySelector("[data-action='scissor']").addEventListener("click", () => createOrResetRange(segment.id, video));
    node.querySelector("[data-action='detect-ending']").addEventListener("click", () => detectEndingForSegment(segment.id));
    node.querySelector("[data-action='clear-range']").addEventListener("click", () => clearRange(segment.id));
    node.querySelector("[data-action='play-range']").addEventListener("click", () => previewRange(segment.id, video));
    node.querySelector("[data-segment-file]").addEventListener("change", (event) => replaceSegmentVideo(event, segment.id));
    node.querySelector("[data-action='remove']").addEventListener("click", () => removeSegment(segment.id));
    node.querySelector("[data-action='add-after']").addEventListener("click", () => addSegmentAfter(index));
    node.querySelector("[data-action='up']").addEventListener("click", () => moveSegment(index, -1));
    node.querySelector("[data-action='down']").addEventListener("click", () => moveSegment(index, 1));

    els.segments.append(node);
    syncTimeline(node, segment.id, video);
    generateFilmstrip(segment.id, node);
  });
}

function renderMergeStoryboard() {
  els.mergeStoryboard.replaceChildren();
  const selected = getSelectedSegments();
  if (!selected.length) {
    els.mergeStoryboard.textContent = "勾选视频后，会在这里按 A + B + C 的形式显示拼接顺序。";
    return;
  }

  selected.forEach((segment, index) => {
    if (index > 0) {
      const plus = document.createElement("span");
      plus.className = "story-plus";
      plus.textContent = "+";
      els.mergeStoryboard.append(plus);
    }

    const item = document.createElement("article");
    item.className = "story-card";
    item.draggable = true;
    item.dataset.id = segment.id;
    const letter = document.createElement("span");
    letter.className = "story-letter";
    letter.textContent = String.fromCharCode(65 + index);
    const video = document.createElement("video");
    const url = previewUrls.get(segment.id);
    if (url) video.src = url;
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    const name = document.createElement("strong");
    name.textContent = segment.previewName || segment.path || "未命名视频";
    item.append(video, letter, name);
    item.addEventListener("dragstart", () => (draggedSegmentId = segment.id));
    item.addEventListener("dragover", (event) => {
      event.preventDefault();
      item.classList.add("drag-over");
    });
    item.addEventListener("dragleave", () => item.classList.remove("drag-over"));
    item.addEventListener("drop", (event) => {
      event.preventDefault();
      item.classList.remove("drag-over");
      moveSegmentById(draggedSegmentId, segment.id);
    });
    els.mergeStoryboard.append(item);
  });
}

function renderSummaries() {
  const selected = getSelectedSegments();
  const total = selected.reduce((sum, segment) => sum + clipDuration(segment), 0);
  els.selectionSummary.textContent = `已选择 ${selected.length} / ${state.segments.length} 个视频，预计总时长 ${total.toFixed(1)}s`;
  const operations = [];
  const upscaleCount = selected.filter((segment) => segment.upscale).length;
  if (state.upscaleEnabled && upscaleCount) operations.push(`高清增强 ${upscaleCount} 个 (${upscaleLabel()})`);
  if (state.watermarkEnabled) operations.push(`添加标识语 (${state.identifierX}%, ${state.identifierY}%)`);
  if (state.removeEnding) operations.push(`去除落版 (${state.endingMode})`);
  operations.push(state.mergeEnabled && state.outputMode === "merge" ? `拼接视频 (${selected.length} 个)` : "逐段导出");
  els.taskSummary.textContent = `${selected.length} 个视频 | 操作：${operations.join(" → ")}`;
}

function renameSegment(segmentId, rawName) {
  const name = ensureExtension(sanitizeFileBaseName(rawName || "video"), "mp4");
  updateSegmentFields(segmentId, { previewName: name, path: name });
  render("视频名称已更新。");
}

function applyBatchRename() {
  const pattern = String(state.batchRenamePattern || "").trim();
  if (!pattern) {
    setStatus("请输入批量命名规则，例如：作品-{n}");
    return;
  }

  let renameIndex = 0;
  const segments = state.segments.map((segment, index) => {
    if (segment.selected === false) return segment;
    renameIndex += 1;
    const originalBase = sanitizeFileBaseName(segment.previewName || segment.path || `video-${index + 1}`);
    const nextBase = sanitizeFileBaseName(
      pattern
        .replaceAll("{nn}", String(renameIndex).padStart(2, "0"))
        .replaceAll("{n}", String(renameIndex))
        .replaceAll("{name}", originalBase)
    );
    const nextName = ensureExtension(nextBase || `video-${renameIndex}`, "mp4");
    return { ...segment, previewName: nextName, path: nextName };
  });

  if (!renameIndex) {
    setStatus("请先勾选需要改名的视频。");
    return;
  }

  updateState({ segments }, `已批量修改 ${renameIndex} 个已勾选视频名称。`);
}

function clearUploadedVideos() {
  if (!state.segments.length) {
    setStatus("当前没有已上传视频。");
    return;
  }
  pushUndo();
  revokeAllPreviewUrls();
  state = normalizeProject({ ...state, segments: [] });
  redoStack = [];
  render("已清空所有已上传视频。");
}

function bindDropzone(element, handler) {
  element.addEventListener("dragover", (event) => {
    event.preventDefault();
    element.classList.add("dragging");
  });
  element.addEventListener("dragleave", () => element.classList.remove("dragging"));
  element.addEventListener("drop", (event) => {
    event.preventDefault();
    element.classList.remove("dragging");
    handler(event.dataTransfer.files);
  });
}

function addVideoFiles(fileList) {
  const files = Array.from(fileList || []).filter((file) => file.type.startsWith("video/") || /\.(mp4|mov|avi|mkv|webm|flv)$/i.test(file.name));
  if (!files.length) return;

  pushUndo();
  const segments = [...state.segments];
  files.forEach((file) => {
    const segment = emptySegment(file);
    previewUrls.set(segment.id, URL.createObjectURL(file));
    segments.push(segment);
  });
  state = normalizeProject({ ...state, segments });
  redoStack = [];
  render(`已添加 ${files.length} 个视频片段。`);
  els.videoInput.value = "";
}

function replaceSegmentVideo(event, segmentId) {
  const [file] = event.target.files || [];
  if (!file || (!file.type.startsWith("video/") && !/\.(mp4|mov|avi|mkv|webm|flv)$/i.test(file.name))) return;
  revokePreviewUrl(segmentId);
  previewUrls.set(segmentId, URL.createObjectURL(file));
  updateSegmentFields(segmentId, {
    path: file.name,
    previewName: file.name,
    start: "",
    end: "",
    duration: 0,
    selected: true,
    upscale: false,
    note: ""
  });
  render("片段视频已更新。");
  event.target.value = "";
}

function createOrResetRange(segmentId, video) {
  const segment = getSegment(segmentId);
  if (!segment) return;
  const duration = getDuration(segment, video);
  if (!duration) return;

  const current = clamp(video.currentTime || 0, 0, duration);
  const rangeLength = Math.min(5, Math.max(0.5, duration * 0.2));
  let start = current;
  let end = Math.min(duration, current + rangeLength);

  if (end - start < 0.25) {
    start = Math.max(0, duration - rangeLength);
    end = duration;
  }

  updateSegmentFields(segmentId, { start: formatSeconds(start), end: formatSeconds(end) });
  setStatus("已创建剪辑区间，可拖动区间或两侧边缘调整。");
}

function clearRange(segmentId) {
  updateSegmentFields(segmentId, { start: "", end: "", note: "" });
  setStatus("已去掉剪辑区间。");
}

function applyTailToAllSegments() {
  const tail = Number(state.endingSeconds) || 0;
  if (!state.segments.length) {
    setStatus("请先上传视频。");
    return;
  }
  pushUndo();
  state = normalizeProject({
    ...state,
    segments: state.segments.map((segment) => {
      const duration = Number(segment.duration) || 0;
      if (!duration || !tail || tail >= duration) return segment;
      return {
        ...segment,
        start: segment.start || "00:00:00.000",
        end: formatSeconds(Math.max(0.25, duration - tail)),
        note: `已按末尾 ${tail}s 去除落版。`
      };
    })
  });
  redoStack = [];
  render("已按末尾秒数应用到全部视频。");
}

function seekOnTimeline(event, segmentId, video, timeline) {
  if (event.target.closest("[data-range]")) return;
  const segment = getSegment(segmentId);
  const duration = getDuration(segment, video);
  if (!duration) return;
  video.currentTime = ratioFromEvent(event, timeline) * duration;
}

function startRangeDrag(event, segmentId, timeline, mode) {
  event.preventDefault();
  event.stopPropagation();
  const segment = getSegment(segmentId);
  const duration = getDuration(segment);
  if (!duration) return;
  const start = parseTime(segment.start) ?? 0;
  const end = parseTime(segment.end) ?? duration;
  const startRatio = start / duration;
  const endRatio = end / duration;
  const startPointerRatio = ratioFromEvent(event, timeline);

  const onMove = (moveEvent) => {
    const pointerRatio = ratioFromEvent(moveEvent, timeline);
    const delta = pointerRatio - startPointerRatio;
    let nextStart = startRatio;
    let nextEnd = endRatio;

    if (mode === "move") {
      const width = endRatio - startRatio;
      nextStart = clamp(startRatio + delta, 0, 1 - width);
      nextEnd = nextStart + width;
    } else if (mode === "start") {
      nextStart = clamp(pointerRatio, 0, endRatio - 0.01);
    } else {
      nextEnd = clamp(pointerRatio, startRatio + 0.01, 1);
    }

    updateSegmentFields(segmentId, {
      start: formatSeconds(nextStart * duration),
      end: formatSeconds(nextEnd * duration)
    }, false);
    syncRenderedRange(segmentId);
    renderSummaries();
  };

  const onUp = () => {
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
    localStorage.setItem("promptlens-video-tool", JSON.stringify(state));
  };

  document.addEventListener("pointermove", onMove);
  document.addEventListener("pointerup", onUp);
}

function previewRange(segmentId, video) {
  const segment = getSegment(segmentId);
  if (!segment) return;
  const start = parseTime(segment.start) ?? 0;
  const duration = getDuration(segment, video);
  if (!duration) return;
  video.currentTime = clamp(start, 0, duration);
  video.play();
}

async function detectAllEndings() {
  const segments = getSelectedSegments().filter((segment) => previewUrls.has(segment.id));
  if (!segments.length) {
    setStatus("请先上传并勾选视频，再识别落版。");
    return;
  }

  els.detectEndings.disabled = true;
  pushUndo();
  let detected = 0;

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    setStatus(`正在识别落版 ${index + 1}/${segments.length}：${segment.previewName || segment.path || "未命名视频"}`);
    const result = await analyzeEnding(segment, "auto");
    if (result?.cutAt) detected += 1;
    applyEndingDetection(segment.id, result);
  }

  redoStack = [];
  render(`落版识别完成：${detected}/${segments.length} 段已设置裁切点。`);
}

async function detectEndingForSegment(segmentId) {
  const segment = getSegment(segmentId);
  if (!segment) return;
  if (!previewUrls.has(segmentId)) {
    setStatus("这个片段需要重新选择本地视频后才能识别。");
    return;
  }

  setStatus(`正在识别落版：${segment.previewName || segment.path || "未命名视频"}`);
  pushUndo();
  const result = await analyzeEnding(segment, "auto");
  applyEndingDetection(segmentId, result);
  redoStack = [];
  render(result?.cutAt ? "已识别并设置落版裁切点。" : "未找到明显落版，已保留原裁切。");
}

function applyEndingDetection(segmentId, result) {
  const segment = getSegment(segmentId);
  if (!segment || !result) return;

  const patch = {
    endingDetectedAt: result.cutAt ? formatSeconds(result.cutAt) : "",
    note: result.message
  };

  if (result.cutAt) {
    const start = parseTime(segment.start) ?? 0;
    patch.end = formatSeconds(Math.max(start + 0.25, result.cutAt));
  }

  state = normalizeProject({
    ...state,
    segments: state.segments.map((item) => (item.id === segmentId ? { ...item, ...patch } : item))
  });
  localStorage.setItem("promptlens-video-tool", JSON.stringify(state));
}

async function analyzeEnding(segment, mode = "auto") {
  const url = previewUrls.get(segment.id);
  if (!url) return null;

  const video = await createLoadedVideo(url);
  const duration = getDuration(segment, video);
  if (!duration || duration < 2) {
    return { cutAt: 0, message: "视频太短，未识别落版。" };
  }

  if (mode === "manual") {
    return fallbackEnding(duration, "已按手动秒数裁切末尾。");
  }

  const tailWindow = Math.min(12, Math.max(3, duration * 0.28));
  const startAt = Math.max(0, duration - tailWindow);
  const step = duration < 8 ? 0.35 : 0.5;
  const samples = [];

  for (let time = startAt; time <= duration - 0.12; time += step) {
    await seekVideo(video, time);
    samples.push({ time, signature: frameSignature(video) });
  }

  const diffs = [];
  for (let index = 1; index < samples.length; index += 1) {
    diffs.push({
      time: samples[index].time,
      value: signatureDiff(samples[index - 1].signature, samples[index].signature)
    });
  }

  if (!diffs.length) return fallbackEnding(duration, "样本不足，已按末尾秒数裁切。");

  const sorted = diffs.map((item) => item.value).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] || 0;
  const threshold = Math.max(10, median * 2.4);
  let bestCut = 0;

  for (let index = diffs.length - 1; index >= 0; index -= 1) {
    const candidate = diffs[index];
    const after = diffs.slice(index + 1);
    const stableTail = after.length >= 2 && after.every((item) => item.value < threshold * 0.75);
    const longEnough = duration - candidate.time >= 0.8;
    if (candidate.value >= threshold && stableTail && longEnough) {
      bestCut = candidate.time;
      break;
    }
  }

  if (bestCut) {
    return {
      cutAt: bestCut,
      message: `疑似落版从 ${formatShortTime(bestCut)} 开始，已裁到这里。`
    };
  }

  return fallbackEnding(duration, "未找到明显落版切入，已按末尾秒数裁切。");
}

function fallbackEnding(duration, message) {
  const tail = Number(state.endingSeconds) || 0;
  if (!tail || tail >= duration) return { cutAt: 0, message };
  return { cutAt: Math.max(0, duration - tail), message };
}

function syncTimeline(node, segmentId, video) {
  const segment = getSegment(segmentId);
  if (!segment) return;

  const duration = getDuration(segment, video);
  const current = duration ? video.currentTime || 0 : 0;
  const progress = node.querySelector("[data-progress]");
  const range = node.querySelector("[data-range]");
  const clear = node.querySelector("[data-action='clear-range']");
  const currentTime = node.querySelector("[data-current-time]");
  const startLabel = node.querySelector("[data-start-label]");
  const endLabel = node.querySelector("[data-end-label]");
  const stripRange = node.querySelector("[data-strip-range]");
  const stripPlayhead = node.querySelector("[data-strip-playhead]");
  const stripLabel = node.querySelector("[data-strip-label]");

  progress.style.width = duration ? `${clamp(current / duration, 0, 1) * 100}%` : "0%";
  if (stripPlayhead) stripPlayhead.style.left = duration ? `${clamp(current / duration, 0, 1) * 100}%` : "0%";
  currentTime.textContent = formatShortTime(current);
  startLabel.textContent = segment.start ? formatShortTime(parseTime(segment.start) || 0) : "0:00";
  endLabel.textContent = segment.end ? formatShortTime(parseTime(segment.end) || 0) : duration ? formatShortTime(duration) : "0:00";
  if (stripLabel) {
    stripLabel.textContent = `${segment.previewName || segment.path || "未命名视频"}  ${startLabel.textContent} - ${endLabel.textContent}`;
  }

  const start = parseTime(segment.start);
  const end = parseTime(segment.end);
  if (duration && start !== null && end !== null && end > start) {
    range.classList.remove("hidden");
    clear.classList.remove("hidden");
    range.style.left = `${(start / duration) * 100}%`;
    range.style.width = `${((end - start) / duration) * 100}%`;
    if (stripRange) {
      stripRange.style.left = `${(start / duration) * 100}%`;
      stripRange.style.width = `${((end - start) / duration) * 100}%`;
    }
    if (current >= end) video.pause();
  } else {
    range.classList.add("hidden");
    clear.classList.add("hidden");
    if (stripRange) {
      stripRange.style.left = "0%";
      stripRange.style.width = "100%";
    }
  }
}

function syncRenderedRange(segmentId) {
  const node = els.segments.querySelector(`[data-id="${cssEscape(segmentId)}"]`);
  const video = node?.querySelector("[data-preview-video]");
  if (node && video) syncTimeline(node, segmentId, video);
}

function removeSegment(segmentId) {
  revokePreviewUrl(segmentId);
  updateState({ segments: state.segments.filter((item) => item.id !== segmentId) }, "已删除片段。");
}

function addSegmentAfter(index) {
  const segments = [...state.segments];
  segments.splice(index + 1, 0, emptySegment());
  updateState({ segments }, "已在当前片段后面添加空片段。");
}

function moveSegment(index, direction) {
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= state.segments.length) return;
  const segments = [...state.segments];
  [segments[index], segments[nextIndex]] = [segments[nextIndex], segments[index]];
  updateState({ segments }, "片段顺序已调整。");
}

function moveSegmentById(sourceId, targetId) {
  if (!sourceId || sourceId === targetId) return;
  const segments = [...state.segments];
  const sourceIndex = segments.findIndex((item) => item.id === sourceId);
  const targetIndex = segments.findIndex((item) => item.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return;
  const [source] = segments.splice(sourceIndex, 1);
  segments.splice(targetIndex, 0, source);
  updateState({ segments }, "片段顺序已调整。");
}

function setAllSegmentsSelected(selected) {
  updateState({
    segments: state.segments.map((segment) => ({ ...segment, selected }))
  });
}

function updateSegmentFields(id, patch, saveHistory = true) {
  if (saveHistory) pushUndo();
  state = normalizeProject({
    ...state,
    segments: state.segments.map((item) => (item.id === id ? { ...item, ...patch } : item))
  });
  if (saveHistory) redoStack = [];
  els.undo.disabled = !undoStack.length;
  els.redo.disabled = !redoStack.length;
  localStorage.setItem("promptlens-video-tool", JSON.stringify(state));
}

async function renderOutput() {
  if (isProcessing) return;
  const jobs = getSelectedSegments().filter((segment) => previewUrls.has(segment.id));
  if (!jobs.length) {
    setStatus("请先上传并勾选视频，再批量输出。");
    return;
  }

  if (!HTMLCanvasElement.prototype.captureStream || !window.MediaRecorder) {
    setStatus("当前浏览器不支持本地视频渲染，请用新版 Chrome/Edge 打开。");
    return;
  }

  isProcessing = true;
  els.renderOutput.disabled = true;
  els.detectEndings.disabled = true;

  try {
    const identifier = state.watermarkEnabled && state.identifierText ? { text: state.identifierText } : null;
    const size = await getPlannedOutputSize(jobs[0]);
    setStatus(`输出画布：${size.width}x${size.height}，正在准备渲染...`);
    const mergeAsOne = state.mergeEnabled && state.outputMode === "merge";
    if (!mergeAsOne) {
      for (let index = 0; index < jobs.length; index += 1) {
        setStatus(`正在输出 ${index + 1}/${jobs.length}：${jobs[index].previewName || jobs[index].path || "未命名视频"}`);
        const blob = await renderSegmentsToBlob([jobs[index]], identifier);
        downloadBlob(blob, outputFileName(index + 1));
      }
      setStatus(`已创建 ${jobs.length} 个导出文件。`);
    } else {
      setStatus(`正在合并输出 ${jobs.length} 段视频...`);
      const blob = await renderSegmentsToBlob(jobs, identifier);
      downloadBlob(blob, outputFileName());
      setStatus("合并视频已创建。");
    }
  } catch (error) {
    setStatus(`输出失败：${error.message}`);
  } finally {
    isProcessing = false;
    render();
  }
}

async function renderSegmentsToBlob(segments, identifier) {
  const firstVideo = await createLoadedVideo(previewUrls.get(segments[0].id));
  const size = getOutputCanvasSize(firstVideo);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d", { alpha: false });
  const audioContext = new AudioContext();
  const audioDestination = audioContext.createMediaStreamDestination();
  const canvasStream = canvas.captureStream(Number(state.outputFps) || 30);
  const stream = new MediaStream([...canvasStream.getVideoTracks(), ...audioDestination.stream.getAudioTracks()]);
  const chunks = [];
  const recorder = new MediaRecorder(stream, { mimeType: getRecorderMimeType() });

  recorder.addEventListener("dataavailable", (event) => {
    if (event.data?.size) chunks.push(event.data);
  });

  const done = new Promise((resolve) => recorder.addEventListener("stop", resolve, { once: true }));
  recorder.start(1000);

  for (const segment of segments) {
    const video = await createLoadedVideo(previewUrls.get(segment.id));
    const source = audioContext.createMediaElementSource(video);
    source.connect(audioDestination);
    await drawSegment(video, segment, ctx, canvas, identifier);
    source.disconnect();
  }

  recorder.stop();
  await done;
  await audioContext.close();
  stream.getTracks().forEach((track) => track.stop());
  return new Blob(chunks, { type: recorder.mimeType || "video/webm" });
}

async function drawSegment(video, segment, ctx, canvas, identifier) {
  const duration = getDuration(segment, video);
  const start = clamp(parseTime(segment.start) ?? 0, 0, duration);
  const end = clamp(parseTime(segment.end) ?? duration, start + 0.05, duration);
  const upscaleActive = state.upscaleEnabled && Boolean(segment.upscale);

  await seekVideo(video, start);
  video.playbackRate = 1;
  await video.play();

  while (!video.ended && video.currentTime < end) {
    drawVideoFrame(ctx, canvas, video, identifier, upscaleActive);
    await nextFrame();
  }

  video.pause();
  drawVideoFrame(ctx, canvas, video, identifier, upscaleActive);
}

function drawVideoFrame(ctx, canvas, video, identifier, upscaleActive = state.upscaleEnabled) {
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = upscaleActive ? "high" : "medium";

  const videoRatio = video.videoWidth / video.videoHeight;
  const canvasRatio = canvas.width / canvas.height;
  let width = canvas.width;
  let height = canvas.height;

  if (videoRatio > canvasRatio) {
    height = width / videoRatio;
  } else {
    width = height * videoRatio;
  }

  const clarity = upscaleActive ? Number(state.upscaleClarity) || 0 : 0;
  const sharpness = upscaleActive ? Number(state.upscaleSharpness) || 0 : 0;
  const contrast = 100 + clarity * (state.upscaleRoute === "detail" ? 0.42 : 0.26) + sharpness * 0.08;
  const saturation = 100 + clarity * (state.upscaleRoute === "detail" ? 0.22 : 0.1);
  const brightness = upscaleActive ? 101 : 100;
  ctx.save();
  ctx.filter = `contrast(${contrast}%) saturate(${saturation}%) brightness(${brightness}%)`;
  ctx.drawImage(video, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
  ctx.restore();
  if (upscaleActive) applySharpen(ctx, canvas);
  if (identifier) drawIdentifierText(ctx, canvas, identifier.text);
}

function drawVideoContain(ctx, video, x, y, width, height) {
  ctx.fillStyle = "#07090f";
  ctx.fillRect(x, y, width, height);
  const videoRatio = video.videoWidth / video.videoHeight;
  const boxRatio = width / height;
  let drawWidth = width;
  let drawHeight = height;

  if (videoRatio > boxRatio) {
    drawHeight = drawWidth / videoRatio;
  } else {
    drawWidth = drawHeight * videoRatio;
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(video, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}

function drawIdentifierText(ctx, canvas, text) {
  const fontSize = Math.max(16, Math.round(canvas.width * (Number(state.watermarkSize) || 15) / 100 * 0.18));
  const x = canvas.width * clamp(Number(state.identifierX) || 50, 0, 100) / 100;
  const y = canvas.height * clamp(Number(state.identifierY) || 8, 0, 100) / 100;
  ctx.save();
  ctx.globalAlpha = clamp((Number(state.watermarkOpacity) || 85) / 100, 0.1, 1);
  ctx.font = `700 ${fontSize}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(0, 0, 0, 0.72)";
  ctx.lineWidth = Math.max(3, fontSize * 0.12);
  ctx.fillStyle = "#ffffff";
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
  ctx.restore();
}

function applySharpen(ctx, canvas) {
  const amount = clamp((Number(state.upscaleSharpness) || 0) / 100, 0, 1);
  if (!amount || canvas.width * canvas.height > 2300000) return;

  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const src = image.data;
  const out = new Uint8ClampedArray(src);
  const width = canvas.width;
  const height = canvas.height;
  const center = 1 + amount * (state.upscaleRoute === "detail" ? 3.2 : 2.2);
  const side = -amount * (state.upscaleRoute === "detail" ? 0.8 : 0.55);

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        const value =
          src[index + channel] * center +
          src[index - 4 + channel] * side +
          src[index + 4 + channel] * side +
          src[index - width * 4 + channel] * side +
          src[index + width * 4 + channel] * side;
        out[index + channel] = clamp(value, 0, 255);
      }
    }
  }

  image.data.set(out);
  ctx.putImageData(image, 0, 0);
}

async function getPlannedOutputSize(segment) {
  const url = previewUrls.get(segment.id);
  if (!url) return { width: 0, height: 0 };
  const video = await createLoadedVideo(url);
  return getOutputCanvasSize(video);
}

function upscaleLabel() {
  if (!state.upscaleEnabled) return "off";
  if (/^\d+:\d+$/.test(state.upscaleTarget)) return `${state.upscaleRoute}/${state.upscaleTarget.replace(":", "x")}`;
  if (state.upscaleTarget === "output") return state.upscaleRoute === "detail" ? "detail/output" : "conservative/output";
  const edge = state.upscaleTarget.replace("long-", "");
  return `${state.upscaleRoute === "detail" ? "detail" : "conservative"}/long-${edge}`;
}

function getSelectedSegments() {
  return state.segments.filter((segment) => segment.selected !== false);
}

function clipDuration(segment) {
  const duration = Number(segment.duration) || 0;
  if (!duration) return 0;
  const start = parseTime(segment.start) ?? 0;
  const end = parseTime(segment.end) ?? duration;
  return Math.max(0, end - start);
}

function downloadProject() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  downloadBlob(blob, ensureExtension(sanitizeFileBaseName(state.outputName || "video-project"), "json"));
  setStatus("项目文件已导出。");
}

async function importProject(event) {
  const [file] = event.target.files || [];
  if (!file) return;
  try {
    const text = await file.text();
    replaceState(JSON.parse(text), "项目已导入。");
  } catch (error) {
    setStatus(`项目导入失败：${error.message}`);
  } finally {
    event.target.value = "";
  }
}

function normalizeProject(project) {
  const defaults = defaultState();
  const value = project && typeof project === "object" ? project : defaults;
  const segments = Array.isArray(value.segments) ? value.segments : [];
  return {
    ...defaults,
    currentStep: ["upload", "configure", "process"].includes(value.currentStep) ? value.currentStep : defaults.currentStep,
    upscaleEnabled: "upscaleEnabled" in value ? Boolean(value.upscaleEnabled) : defaults.upscaleEnabled,
    upscaleRoute: ["conservative", "detail"].includes(value.upscaleRoute) ? value.upscaleRoute : defaults.upscaleRoute,
    upscaleTarget: ["output", "1280:720", "720:1280", "long-1920", "long-2560", "long-3840"].includes(value.upscaleTarget)
      ? value.upscaleTarget
      : defaults.upscaleTarget,
    upscaleSharpness: String(value.upscaleSharpness || defaults.upscaleSharpness),
    upscaleClarity: String(value.upscaleClarity || defaults.upscaleClarity),
    watermarkEnabled: "watermarkEnabled" in value ? Boolean(value.watermarkEnabled) : defaults.watermarkEnabled,
    identifierText: String(value.identifierText || value.watermarkImageName || defaults.identifierText),
    identifierPresets: Array.isArray(value.identifierPresets)
      ? value.identifierPresets.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 12)
      : defaults.identifierPresets,
    identifierX: String(value.identifierX || defaults.identifierX),
    identifierY: String(value.identifierY || defaults.identifierY),
    watermarkSize: String(value.watermarkSize || defaults.watermarkSize),
    watermarkOpacity: String(value.watermarkOpacity || defaults.watermarkOpacity),
    outputMode: ["merge", "batch"].includes(value.outputMode) ? value.outputMode : defaults.outputMode,
    outputName: String(value.outputName || defaults.outputName),
    outputSize: ["source", "1920:1080", "1280:720", "1080:1920", "720:1280"].includes(value.outputSize) ? value.outputSize : defaults.outputSize,
    outputFps: ["24", "30", "60"].includes(String(value.outputFps)) ? String(value.outputFps) : defaults.outputFps,
    mergeEnabled: "mergeEnabled" in value ? Boolean(value.mergeEnabled) : defaults.mergeEnabled,
    removeEnding: "removeEnding" in value ? Boolean(value.removeEnding) : defaults.removeEnding,
    endingMode: ["manual", "auto"].includes(value.endingMode) ? value.endingMode : defaults.endingMode,
    endingSeconds: String(value.endingSeconds || defaults.endingSeconds),
    watermarkImageName: String(value.watermarkImageName || ""),
    watermarkImageDataUrl: String(value.watermarkImageDataUrl || ""),
    batchRenamePattern: String(value.batchRenamePattern || defaults.batchRenamePattern),
    segments: segments.map((item) => ({
      id: item.id || emptySegment().id,
      path: String(item.path || ""),
      start: String(item.start || ""),
      end: String(item.end || ""),
      previewName: String(item.previewName || item.path || ""),
      duration: Number(item.duration) || 0,
      selected: "selected" in item ? Boolean(item.selected) : true,
      upscale: "upscale" in item ? Boolean(item.upscale) : false,
      endingDetectedAt: String(item.endingDetectedAt || ""),
      note: String(item.note || "")
    }))
  };
}

function getSegment(segmentId) {
  return state.segments.find((item) => item.id === segmentId);
}

function getDuration(segment, video = null) {
  return Number(video?.duration) || Number(segment?.duration) || 0;
}

function getOutputCanvasSize(video) {
  const sourceWidth = video.videoWidth || 1280;
  const sourceHeight = video.videoHeight || 720;
  let size;
  if (state.outputSize === "source") {
    size = { width: sourceWidth, height: sourceHeight };
  } else {
    const [width, height] = state.outputSize.split(":").map((item) => Number(item));
    size = { width: width || 1280, height: height || 720 };
  }

  if (state.upscaleEnabled && /^\d+:\d+$/.test(state.upscaleTarget)) {
    const [width, height] = state.upscaleTarget.split(":").map((item) => Number(item));
    size = { width: width || size.width, height: height || size.height };
  } else if (state.upscaleEnabled && state.upscaleTarget !== "output") {
    const targetLongEdge = Number(state.upscaleTarget.replace("long-", "")) || 3840;
    const ratio = size.width >= size.height ? size.height / size.width : size.width / size.height;
    size = size.width >= size.height
      ? { width: targetLongEdge, height: Math.round(targetLongEdge * ratio) }
      : { width: Math.round(targetLongEdge * ratio), height: targetLongEdge };
  }

  return { width: evenNumber(size.width), height: evenNumber(size.height) };
}

function outputFileName(index = 0) {
  const baseName = sanitizeFileBaseName(state.outputName || "marked-final");
  return ensureExtension(index ? `${baseName}-${String(index).padStart(2, "0")}` : baseName, "webm");
}

function getRecorderMimeType() {
  const candidates = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
  return candidates.find((mime) => MediaRecorder.isTypeSupported(mime)) || "";
}

function createLoadedVideo(url) {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.preload = "auto";
    video.playsInline = true;
    video.src = url;
    video.addEventListener("loadedmetadata", () => resolve(video), { once: true });
    video.addEventListener("error", () => reject(new Error("视频读取失败")), { once: true });
  });
}

function seekVideo(video, time) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
    };
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("视频定位失败"));
    };
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    video.currentTime = clamp(time, 0, Math.max(0, Number(video.duration) || 0));
  });
}

function frameSignature(video) {
  const width = 96;
  const height = 54;
  const canvas = frameSignature.canvas || (frameSignature.canvas = document.createElement("canvas"));
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(video, 0, 0, width, height);
  const data = ctx.getImageData(0, 0, width, height).data;
  const signature = [];
  for (let y = 0; y < height; y += 6) {
    for (let x = 0; x < width; x += 6) {
      const index = (y * width + x) * 4;
      signature.push(data[index], data[index + 1], data[index + 2]);
    }
  }
  return signature;
}

function signatureDiff(a, b) {
  const length = Math.min(a.length, b.length);
  if (!length) return 0;
  let total = 0;
  for (let index = 0; index < length; index += 1) total += Math.abs(a[index] - b[index]);
  return total / length;
}

function ratioFromEvent(event, element) {
  const rect = element.getBoundingClientRect();
  return clamp((event.clientX - rect.left) / rect.width, 0, 1);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片读取失败"));
    image.src = src;
  });
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function parseTime(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  if (/^\d+(?:\.\d+)?$/.test(text)) return Number(text);
  const match = text.match(/^(\d{1,2}):(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?$/);
  if (!match) return null;
  const [, h, m, s, ms = "0"] = match;
  return Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms.padEnd(3, "0")) / 1000;
}

function formatSeconds(value) {
  const totalMs = Math.max(0, Math.round(Number(value || 0) * 1000));
  const ms = String(totalMs % 1000).padStart(3, "0");
  const totalSeconds = Math.floor(totalMs / 1000);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  const minutes = String(Math.floor(totalSeconds / 60) % 60).padStart(2, "0");
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}.${ms}`;
}

function formatShortTime(value) {
  const totalSeconds = Math.max(0, Math.floor(Number(value || 0)));
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}

function sanitizeFileName(value) {
  return String(value || "marked-final")
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 90) || "marked-final";
}

function sanitizeFileBaseName(value) {
  return sanitizeFileName(value).replace(/\.(?:mp4|m4a|webm|mov|mkv|json)$/i, "");
}

function ensureExtension(value, extension) {
  const clean = sanitizeFileName(value).replace(new RegExp(`\\.${extension}$`, "i"), "");
  return `${clean}.${extension}`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function evenNumber(value) {
  const rounded = Math.max(2, Math.round(Number(value) || 2));
  return rounded % 2 === 0 ? rounded : rounded - 1;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("读取文件失败"));
    reader.readAsDataURL(file);
  });
}

function revokePreviewUrl(segmentId) {
  const url = previewUrls.get(segmentId);
  if (url) URL.revokeObjectURL(url);
  previewUrls.delete(segmentId);
}

function revokeAllPreviewUrls() {
  for (const id of previewUrls.keys()) revokePreviewUrl(id);
}

function cssEscape(value) {
  return globalThis.CSS?.escape ? CSS.escape(value) : String(value).replace(/"/g, '\\"');
}

function setStatus(message) {
  els.status.textContent = message;
}


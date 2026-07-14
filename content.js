(function () {
  const state = {
    activeElement: null,
    activeKind: "",
    hideTimer: 0,
    pointerX: 0,
    pointerY: 0,
    lastAnalyzedVideo: null,
    settings: null,
    manualToolbarPosition: null,
    toolbarDrag: null,
    suppressToolbarClickUntil: 0
  };
  const VIDEO_CLIP_DURATIONS = [5, 10, 15, 25, 30, 35];
  const EXTRA_VIDEO_CLIP_DURATIONS = [60, 45];
  const JIMENG_URL = "https://www.jimeng.com/";
  const MEDIA_SEARCH_DEPTH = 8;

  const root = document.createElement("div");
  root.className = "plj-root";

  const toolbar = document.createElement("div");
  toolbar.className = "plj-toolbar";
  toolbar.hidden = true;

  const panel = document.createElement("section");
  panel.className = "plj-panel";
  panel.hidden = true;

  const framePreview = document.createElement("div");
  framePreview.className = "plj-frame-preview";
  framePreview.hidden = true;

  root.append(toolbar, panel, framePreview);
  document.documentElement.appendChild(root);

  loadSettings();
  bindEvents();
  scheduleSourceVideoLocation();

  function bindEvents() {
    document.addEventListener("pointerover", handlePointerOver, true);
    document.addEventListener("pointermove", handlePointerMove, true);
    window.addEventListener("scroll", keepToolbarAligned, true);
    window.addEventListener("resize", keepToolbarAligned);

    toolbar.addEventListener("pointerenter", () => clearTimeout(state.hideTimer));
    toolbar.addEventListener("pointerleave", scheduleHideToolbar);
    toolbar.addEventListener("pointerdown", handleToolbarDragStart);
    toolbar.addEventListener("dblclick", handleToolbarDoubleClick);
    toolbar.addEventListener("click", handleToolbarClick);
    framePreview.addEventListener("click", (event) => {
      if (event.target === framePreview || event.target.closest("[data-frame-preview-close]")) {
        closeFramePreview();
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !framePreview.hidden) {
        closeFramePreview();
      }
    });
  }

  async function loadSettings() {
    try {
      state.settings = await sendMessage("get-settings");
    } catch (error) {
      state.settings = null;
    }
  }

  function handlePointerOver(event) {
    state.pointerX = event.clientX;
    state.pointerY = event.clientY;

    const media = findMediaElement(event.target, event.clientX, event.clientY) || findMediaElementAtPoint(event.clientX, event.clientY);
    if (!media) {
      if (!root.contains(event.target)) {
        scheduleHideToolbar();
      }
      return;
    }

    setActiveMedia(media);
  }

  function handlePointerMove(event) {
    state.pointerX = event.clientX;
    state.pointerY = event.clientY;

    const media = findMediaElement(event.target, event.clientX, event.clientY) || findMediaElementAtPoint(event.clientX, event.clientY);
    if (media) {
      setActiveMedia(media);
      return;
    }

    keepToolbarAligned();
  }

  function setActiveMedia(media) {
    const kind = media.tagName === "VIDEO" ? "video" : "image";
    const changed = state.activeElement !== media || state.activeKind !== kind || toolbar.hidden;

    state.activeElement = media;
    state.activeKind = kind;

    if (changed) {
      renderToolbar(kind);
    }

    positionToolbar(media);
  }

  function findMediaElement(target, x = state.pointerX, y = state.pointerY) {
    if (!target || root.contains(target)) return null;

    const element = target.closest?.("img, video");
    const directMedia = getValidMediaElement(element);
    if (directMedia) return directMedia;

    return findMediaElementInAncestors(target, x, y);
  }

  function findMediaElementInAncestors(target, x, y) {
    let node = target;

    for (let depth = 0; node && depth < MEDIA_SEARCH_DEPTH; depth += 1) {
      const media = findBestMediaElementInside(node, x, y);
      if (media) return media;

      const rootNode = node.getRootNode?.();
      node = node.parentElement || node.assignedSlot || (rootNode instanceof ShadowRoot ? rootNode.host : null);
    }

    return null;
  }

  function findBestMediaElementInside(container, x, y) {
    if (!container || typeof container.querySelectorAll !== "function" || root.contains(container)) return null;

    const candidates = Array.from(container.querySelectorAll("video, img"))
      .map((element) => getValidMediaElement(element))
      .filter(Boolean)
      .filter((element) => isPointInsideElement(element, x, y, 24));

    candidates.sort((left, right) => {
      const leftRect = left.getBoundingClientRect();
      const rightRect = right.getBoundingClientRect();
      const leftScore = getMediaElementScore(left, leftRect);
      const rightScore = getMediaElementScore(right, rightRect);
      return rightScore - leftScore;
    });

    return candidates[0] || null;
  }

  function getValidMediaElement(element) {
    if (!element || root.contains(element) || !element.isConnected) return null;

    if (element.tagName !== "IMG" && element.tagName !== "VIDEO") return null;

    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    if (
      rect.width <= 0 ||
      rect.height <= 0 ||
      rect.right < 0 ||
      rect.bottom < 0 ||
      rect.left > window.innerWidth ||
      rect.top > window.innerHeight ||
      style.display === "none" ||
      style.visibility === "hidden" ||
      Number(style.opacity) === 0
    ) {
      return null;
    }

    if (element.tagName === "IMG") {
      if (rect.width < 96 || rect.height < 96) return null;
      if (!getImageUrl(element)) return null;
      return element;
    }

    if (rect.width < 160 || rect.height < 90) return null;
    return element;
  }

  function isPointInsideElement(element, x, y, padding = 0) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return true;

    const rect = element.getBoundingClientRect();
    return (
      x >= rect.left - padding &&
      x <= rect.right + padding &&
      y >= rect.top - padding &&
      y <= rect.bottom + padding
    );
  }

  function getMediaElementScore(element, rect) {
    const area = rect.width * rect.height;
    const videoBonus = element.tagName === "VIDEO" ? 100000000 : 0;
    return videoBonus + area;
  }

  function renderToolbar(kind) {
    clearTimeout(state.hideTimer);
    toolbar.replaceChildren();

    toolbar.append(createToolbarDragHandle());

    if (kind === "image") {
      toolbar.append(
        createToolbarButton("识图", "analyze-image"),
        createToolbarButton("设置", "settings")
      );
    } else {
      toolbar.append(
        createToolbarButton("识视频", "analyze-video"),
        createToolbarButton("下载", "download-video"),
        createToolbarButton("设置", "settings")
      );
    }

    toolbar.hidden = false;
  }

  function createToolbarDragHandle() {
    const handle = document.createElement("button");
    handle.type = "button";
    handle.className = "plj-toolbar-drag";
    handle.title = "拖动工具条，双击恢复自动位置";
    handle.setAttribute("aria-label", "拖动工具条");
    handle.textContent = "↕";
    return handle;
  }

  function createToolbarButton(label, action) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "plj-toolbar-button";
    button.dataset.action = action;
    button.textContent = label;
    return button;
  }

  function handleToolbarDragStart(event) {
    const handle = event.target?.closest?.(".plj-toolbar-drag");
    if (!handle) return;

    event.preventDefault();
    event.stopPropagation();
    clearTimeout(state.hideTimer);

    const rect = toolbar.getBoundingClientRect();
    state.toolbarDrag = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top
    };
    state.suppressToolbarClickUntil = Date.now() + 250;
    toolbar.classList.add("is-dragging");
    toolbar.setPointerCapture?.(event.pointerId);
    document.addEventListener("pointermove", handleToolbarDragMove, true);
    document.addEventListener("pointerup", handleToolbarDragEnd, true);
    document.addEventListener("pointercancel", handleToolbarDragEnd, true);
  }

  function handleToolbarDragMove(event) {
    const drag = state.toolbarDrag;
    if (!drag || event.pointerId !== drag.pointerId) return;

    event.preventDefault();
    event.stopPropagation();
    applyManualToolbarPosition(event.clientX - drag.offsetX, event.clientY - drag.offsetY);
  }

  function handleToolbarDragEnd(event) {
    const drag = state.toolbarDrag;
    if (!drag || event.pointerId !== drag.pointerId) return;

    event.preventDefault();
    event.stopPropagation();
    state.toolbarDrag = null;
    state.suppressToolbarClickUntil = Date.now() + 250;
    toolbar.classList.remove("is-dragging");
    toolbar.releasePointerCapture?.(event.pointerId);
    document.removeEventListener("pointermove", handleToolbarDragMove, true);
    document.removeEventListener("pointerup", handleToolbarDragEnd, true);
    document.removeEventListener("pointercancel", handleToolbarDragEnd, true);
  }

  function handleToolbarDoubleClick(event) {
    const handle = event.target?.closest?.(".plj-toolbar-drag");
    if (!handle) return;

    event.preventDefault();
    event.stopPropagation();
    state.manualToolbarPosition = null;
    toolbar.classList.remove("is-manual-position", "is-dragging");
    if (state.activeElement) {
      positionToolbar(state.activeElement);
    }
  }

  async function handleToolbarClick(event) {
    if (Date.now() < state.suppressToolbarClickUntil) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    const action = event.target?.dataset?.action;
    if (!action) return;

    event.preventDefault();
    event.stopPropagation();

    if (action === "settings") {
      await sendMessage("open-options");
      return;
    }

    const activeElement = resolveActionElement(action);
    if (!activeElement) return;

    if (action === "analyze-image") {
      await analyzeImage(activeElement);
      return;
    }

    if (action === "analyze-video") {
      showVideoClipPicker(activeElement);
      return;
    }

    if (action === "download-video") {
      await downloadVideo(activeElement);
    }
  }

  function resolveActionElement(action) {
    const tagName = action === "analyze-image" ? "IMG" : "VIDEO";
    const pointedElement = findMediaElementAtPoint(state.pointerX, state.pointerY, tagName);

    if (pointedElement) {
      setActiveMedia(pointedElement);
      return pointedElement;
    }

    if (isValidMediaElement(state.activeElement, tagName)) {
      return state.activeElement;
    }

    return null;
  }

  function findMediaElementAtPoint(x, y, tagName) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

    const elements = document.elementsFromPoint(x, y);
    for (const element of elements) {
      if (root.contains(element)) continue;

      const media = findMediaElement(element, x, y);
      if (isValidMediaElement(media, tagName)) {
        return media;
      }
    }

    return findMediaElementBehindRoot(x, y, tagName);
  }

  function findMediaElementBehindRoot(x, y, tagName) {
    const previousPointerEvents = root.style.pointerEvents;
    root.style.pointerEvents = "none";

    try {
      const element = document.elementFromPoint(x, y);
      const media = findMediaElement(element, x, y);
      return isValidMediaElement(media, tagName) ? media : null;
    } finally {
      root.style.pointerEvents = previousPointerEvents;
    }
  }

  function isValidMediaElement(element, tagName) {
    return Boolean(getValidMediaElement(element) && (!tagName || element.tagName === tagName));
  }

  async function analyzeImage(image) {
    showLoading("正在识图", "正在反推适合即梦的生图关键词。");

    try {
      const imageUrl = getImageUrl(image);
      const imageDataUrl = captureImageDataUrl(image);
      const result = await sendMessage("analyze-image", {
        imageUrl,
        imageDataUrl,
        alt: image.alt || image.title || "",
        pageUrl: location.href,
        pageTitle: document.title
      });
      result.sampleImages = [
        {
          dataUrl: imageDataUrl || imageUrl,
          sourceUrl: imageUrl,
          label: image.alt || image.title || "当前图片"
        }
      ].filter((item) => item.dataUrl);
      renderAnalysis(result);
    } catch (error) {
      showError("识图失败", error.message);
    }
  }

  function showVideoClipPicker(video) {
    panel.hidden = false;
    panel.replaceChildren();

    const header = document.createElement("div");
    header.className = "plj-panel-header";

    const title = document.createElement("h2");
    title.textContent = "选择视频节选";

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "plj-icon-button";
    closeButton.textContent = "×";
    closeButton.title = "关闭";
    closeButton.addEventListener("click", () => {
      panel.hidden = true;
    });

    const currentTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;
    const detail = document.createElement("p");
    detail.className = "plj-helper-text";
    detail.textContent = `从当前播放点 ${formatTime(currentTime)} 开始节选，抽帧后反推即梦视频提示词。`;

    const choices = createVideoDurationSelector((seconds) => analyzeVideo(video, seconds));

    header.append(title, closeButton);
    panel.append(header, detail, choices);
  }

  async function analyzeVideo(video, clipSeconds) {
    state.lastAnalyzedVideo = video;
    const targetFrameCount = getRecommendedFrameCount(clipSeconds);
    showLoading("正在识视频", `正在抽取当前播放点后 ${clipSeconds}s 的约 ${targetFrameCount} 张关键帧。`);

    let frames = [];
    let sampleError = "";
    let clipStart = Number.isFinite(video.currentTime) ? video.currentTime : null;
    let clipEnd = Number.isFinite(clipStart) ? clipStart + clipSeconds : null;

    try {
      const sample = await captureVideoFrames(video, clipSeconds);
      frames = sample.frames;
      clipStart = sample.clipStart;
      clipEnd = sample.clipEnd;
    } catch (error) {
      sampleError = error.message;
    }

    if (frames.length === 0 && !video.poster) {
      showError("抽帧失败", sampleError || "没有拿到可分析的视频画面。");
      return;
    }

    showLoading("正在分析", `已拿到 ${frames.length || 1} 张画面，正在请求识别模型。`);

    try {
      const result = await sendMessage("analyze-video", {
        frames,
        sampleError,
        posterUrl: video.poster || "",
        videoUrl: getVideoUrl(video),
        pageUrl: location.href,
        pageTitle: document.title,
        duration: Number.isFinite(video.duration) ? video.duration : null,
        currentTime: Number.isFinite(video.currentTime) ? video.currentTime : null,
        clipSeconds,
        clipStart,
        clipEnd
      });
      result.clipStart = clipStart;
      result.clipEnd = clipEnd;
      result.clipSeconds = clipSeconds;
      bindResultVideo(result, video);
      result.sampleFrames = frames
        .filter((frame) => frame?.dataUrl)
        .map((frame, index) => ({
          dataUrl: frame.dataUrl,
          time: Number.isFinite(frame.time) ? frame.time : null,
          relativeTime: Number.isFinite(frame.time) && Number.isFinite(clipStart) ? Math.max(0, frame.time - clipStart) : null,
          displayWidth: Number.isFinite(frame.displayWidth) ? frame.displayWidth : null,
          displayHeight: Number.isFinite(frame.displayHeight) ? frame.displayHeight : null,
          source: frame.source || "",
          index: index + 1
        }));
      normalizeShotTimesToClip(result, clipStart, clipSeconds);
      renderAnalysis(result);
    } catch (error) {
      showError("识视频失败", error.message);
    }
  }

  function normalizeShotTimesToClip(result, clipStart, clipSeconds) {
    if (!Number.isFinite(clipStart) || !Array.isArray(result?.shotList)) return;

    for (const shot of result.shotList) {
      const originalTime = firstShotValue(shot?.镜头时间, shot?.shotTime, shot?.time, shot?.frame, shot?.duration);
      const normalizedTime = normalizeShotTimeValue(originalTime, clipStart, clipSeconds);
      if (!normalizedTime || normalizedTime === originalTime) continue;

      shot.镜头时间 = normalizedTime;
      shot.shotTime = normalizedTime;
      shot.time = normalizedTime;
    }
  }

  function normalizeShotTimeValue(value, clipStart, clipSeconds) {
    const source = String(value || "").trim();
    if (!source) return source;

    const timeMatches = Array.from(source.matchAll(/(\d+(?:\.\d+)?)\s*s?/gi));
    if (!timeMatches.length) return source;

    const numericTimes = timeMatches.map((match) => Number(match[1])).filter(Number.isFinite);
    if (!numericTimes.length) return source;
    const maxTime = Math.max(...numericTimes);
    const looksAlreadyClipRelative = Number.isFinite(clipSeconds) && maxTime <= clipSeconds + 1;
    const looksAbsoluteFromClip = Number.isFinite(clipStart) && clipStart > 0 && numericTimes[0] >= clipStart - 0.25;
    const shouldShiftToClipStart = looksAbsoluteFromClip && !looksAlreadyClipRelative;

    return source.replace(/(\d+(?:\.\d+)?)\s*s?/gi, (match, rawNumber, offset) => {
      const numericTime = Number(rawNumber);
      if (!Number.isFinite(numericTime)) return match;
      const relativeTime = shouldShiftToClipStart ? numericTime - clipStart : numericTime;
      return `${formatRelativeSeconds(Math.max(0, relativeTime))}s`;
    });
  }

  function formatRelativeSeconds(value) {
    const rounded = Math.max(0, Number(value) || 0);
    return String(Math.round(rounded));
  }

  async function downloadVideo(video) {
    const candidate = await getVideoDownloadCandidate(video);
    const videoUrl = candidate.url;

    if (candidate.reason === "quality-options") {
      showVideoDownloadOptions(video, candidate.message, candidate.candidates);
      return;
    }

    if (!videoUrl) {
      showVideoDownloadOptions(
        video,
        candidate.message || "没有找到当前视频的直接 MP4 文件地址。这个页面可能只暴露了播放器流。",
        candidate.candidates
      );
      return;
    }

    if (candidate.reason === "blob") {
      showVideoDownloadOptions(video, "当前视频地址是 blob/MediaSource 临时播放流，不是真实 MP4 文件。", candidate.candidates);
      return;
    }

    if (candidate.reason === "stream") {
      showVideoDownloadOptions(video, "当前视频是 m3u8 或分片流，需要合并分片后才能保存，浏览器下载管理器不能直接下载。", candidate.candidates);
      return;
    }

    showLoading("准备下载", candidate.source === "page-data" ? "已从页面数据中找到疑似直链，正在交给浏览器下载管理器。" : "正在交给浏览器下载管理器。");

    try {
      await sendMessage("download-video", {
        videoUrl,
        pageUrl: location.href,
        filename: buildLocalVideoName(),
        contentType: candidate.contentType || ""
      });
      showNotice("下载已创建", "请在浏览器下载栏确认保存位置。");
    } catch (error) {
      showVideoDownloadOptions(video, error.message, candidate.candidates);
    }
  }

  function showVideoDownloadOptions(video, reason, candidates) {
    panel.hidden = false;
    panel.replaceChildren();

    const header = document.createElement("div");
    header.className = "plj-panel-header";

    const title = document.createElement("h2");
    title.textContent = "下载视频";

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "plj-icon-button";
    closeButton.textContent = "×";
    closeButton.title = "关闭";
    closeButton.addEventListener("click", () => {
      panel.hidden = true;
    });

    const detail = document.createElement("p");
    detail.className = "plj-helper-text";
    detail.textContent = `${reason || "直链 MP4 下载不可用。"} 如果下方有检测到的直链，优先点直链下载；没有直链时再尝试录制。`;

    const recorderMimeType = getSupportedMp4RecorderMimeType();
    const actions = document.createElement("div");
    actions.className = "plj-duration-grid";
    const directBlock = createDirectDownloadCandidateBlock(candidates);

    if (recorderMimeType) {
      for (const seconds of VIDEO_CLIP_DURATIONS) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = `录制 ${seconds}s`;
        button.addEventListener("click", () => recordVideoDownload(video, seconds, recorderMimeType));
        actions.append(button);
      }
    } else {
      const unsupported = document.createElement("p");
      unsupported.className = "plj-helper-text";
      unsupported.textContent = "当前浏览器不支持用 MediaRecorder 输出 MP4。只能下载页面暴露的真实 video/mp4 直链。";
      actions.append(unsupported);
    }

    header.append(title, closeButton);
    panel.append(header, detail);
    if (directBlock) panel.append(directBlock);
    panel.append(actions);
  }

  function createDirectDownloadCandidateBlock(candidates) {
    const directCandidates = findDirectDownloadCandidates(normalizeMediaCandidates(candidates)).slice(0, 8);
    if (!directCandidates.length) return null;

    const block = document.createElement("div");
    block.className = "plj-block plj-download-candidates";

    const header = document.createElement("div");
    header.className = "plj-block-header";

    const title = document.createElement("h3");
    title.textContent = "检测到的直链";

    const hint = document.createElement("span");
    hint.className = "plj-inline-hint";
    hint.textContent = `${directCandidates.length} 个`;

    const list = document.createElement("div");
    list.className = "plj-candidate-grid";

    directCandidates.forEach((candidate, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = `下载直链 ${index + 1}${candidate.qualityLabel ? ` · ${candidate.qualityLabel}` : ""}`;
      button.title = candidate.url;
      button.addEventListener("click", () => downloadCandidateUrl(candidate, button));
      list.append(button);
    });

    header.append(title, hint);
    block.append(header, list);
    return block;
  }

  async function downloadCandidateUrl(candidate, button) {
    const previousText = button.textContent;
    button.disabled = true;
    button.textContent = "下载中...";

    try {
      await sendMessage("download-video", {
        videoUrl: candidate.url,
        pageUrl: location.href,
        filename: buildLocalVideoName(),
        contentType: candidate.contentType || ""
      });
      button.textContent = "已创建下载";
      showNotice("下载已创建", "请在浏览器下载栏确认保存位置。");
    } catch (error) {
      button.textContent = "下载失败";
      showError("下载失败", error.message);
    } finally {
      window.setTimeout(() => {
        button.disabled = false;
        button.textContent = previousText;
      }, 1500);
    }
  }

  async function recordVideoDownload(video, seconds, mimeType) {
    showLoading("正在录制", `正在从当前播放点录制 ${seconds}s；如果画布录制被跨域限制，会自动改用视频流录制。`);

    try {
      const blob = await recordVideoClip(video, seconds, mimeType);
      triggerBlobDownload(blob, `${buildLocalVideoName()}-${seconds}s.mp4`);
      showNotice("录制完成", "已生成 MP4 文件，请在浏览器下载栏确认保存。");
    } catch (error) {
      const message = /跨域限制|不允许直接录制视频流|画布录制不可用/i.test(String(error.message || ""))
        ? `${error.message} 请优先使用上方“检测到的直链”下载；如果没有直链，请刷新页面并播放目标视频 5-10 秒后再点下载。`
        : error.message;
      showError("录制失败", message);
    }
  }

  async function recordVideoClip(video, seconds, mimeType) {
    await ensureVideoReady(video);
    try {
      return await recordVideoClipFromCanvas(video, seconds, mimeType);
    } catch (error) {
      if (isCanvasRecordingBlocked(error)) {
        return recordVideoClipFromElementStream(video, seconds, mimeType);
      }

      throw error;
    }
  }

  function isCanvasRecordingBlocked(error) {
    return /origin-clean|taint|cross.?origin|Canvas is not origin-clean/i.test(String(error?.message || ""));
  }

  async function recordVideoClipFromCanvas(video, seconds, mimeType) {
    const rect = video.getBoundingClientRect();
    const width = Math.max(2, Math.round(rect.width || video.videoWidth));
    const height = Math.max(2, Math.round(rect.height || video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d", { alpha: false });
    drawVisibleVideoFrame(context, video, width, height);
    const stream = canvas.captureStream(30);
    const audioStream = getVideoAudioStream(video);
    for (const track of audioStream?.getAudioTracks?.() || []) {
      stream.addTrack(track);
    }
    const chunks = [];
    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 4500000,
      audioBitsPerSecond: 128000
    });
    const wasPaused = video.paused;

    return new Promise((resolve, reject) => {
      let settled = false;
      let frameId = 0;
      let stopTimer = 0;

      function drawFrame() {
        try {
          drawVisibleVideoFrame(context, video, width, height);
        } catch (error) {
          settle(error);
          return;
        }

        frameId = requestAnimationFrame(drawFrame);
      }

      function cleanup() {
        window.clearTimeout(stopTimer);
        cancelAnimationFrame(frameId);
        stream.getTracks().forEach((track) => track.stop());
        audioStream?.getTracks?.().forEach((track) => track.stop());
        video.removeEventListener("ended", stopRecording);
        if (wasPaused) {
          video.pause();
        }
      }

      function settle(error, blob) {
        if (settled) return;
        settled = true;
        cleanup();
        if (error) {
          reject(error);
          return;
        }
        resolve(blob);
      }

      function stopRecording() {
        if (recorder.state !== "inactive") {
          recorder.stop();
        }
      }

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data?.size > 0) {
          chunks.push(event.data);
        }
      });

      recorder.addEventListener("error", () => {
        settle(new Error("浏览器录制失败。"));
      });

      recorder.addEventListener("stop", () => {
        if (chunks.length === 0) {
          settle(new Error("录制完成但没有生成视频数据。"));
          return;
        }

        settle(null, new Blob(chunks, { type: mimeType }));
      });

      video.addEventListener("ended", stopRecording);
      recorder.start(500);
      drawFrame();
      stopTimer = window.setTimeout(stopRecording, Math.max(1, seconds) * 1000);

      if (video.paused) {
        video.play().catch((error) => {
          settle(new Error(`视频播放失败，无法录制：${error.message}`));
        });
      }
    });
  }

  async function recordVideoClipFromElementStream(video, seconds, mimeType) {
    const captureStream = video.captureStream || video.mozCaptureStream;
    if (!captureStream) {
      throw new Error("当前视频跨域限制导致画布录制不可用，且浏览器不支持直接录制视频流。");
    }

    let stream = null;
    try {
      stream = captureStream.call(video);
    } catch (error) {
      throw new Error("当前视频跨域限制导致画布录制不可用，且页面不允许直接录制视频流。");
    }

    if (!stream?.getVideoTracks?.().length) {
      stream?.getTracks?.().forEach((track) => track.stop());
      throw new Error("没有拿到可录制的视频轨道。");
    }

    const chunks = [];
    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 4500000,
      audioBitsPerSecond: 128000
    });
    const wasPaused = video.paused;

    return new Promise((resolve, reject) => {
      let settled = false;
      let stopTimer = 0;

      function cleanup() {
        window.clearTimeout(stopTimer);
        stream.getTracks().forEach((track) => track.stop());
        video.removeEventListener("ended", stopRecording);
        if (wasPaused) {
          video.pause();
        }
      }

      function settle(error, blob) {
        if (settled) return;
        settled = true;
        cleanup();
        if (error) {
          reject(error);
          return;
        }
        resolve(blob);
      }

      function stopRecording() {
        if (recorder.state !== "inactive") {
          recorder.stop();
        }
      }

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data?.size > 0) {
          chunks.push(event.data);
        }
      });

      recorder.addEventListener("error", () => {
        settle(new Error("浏览器直接录制视频流失败。"));
      });

      recorder.addEventListener("stop", () => {
        if (chunks.length === 0) {
          settle(new Error("录制完成但没有生成视频数据。"));
          return;
        }

        settle(null, new Blob(chunks, { type: mimeType }));
      });

      video.addEventListener("ended", stopRecording);
      recorder.start(500);
      stopTimer = window.setTimeout(stopRecording, Math.max(1, seconds) * 1000);

      if (video.paused) {
        video.play().catch((error) => {
          settle(new Error(`视频播放失败，无法录制：${error.message}`));
        });
      }
    });
  }

  function drawVisibleVideoFrame(context, video, width, height) {
    const videoWidth = video.videoWidth || width;
    const videoHeight = video.videoHeight || height;
    const style = window.getComputedStyle(video);
    const objectFit = style.objectFit || "fill";
    const position = parseObjectPosition(style.objectPosition || "50% 50%");

    context.fillStyle = style.backgroundColor && style.backgroundColor !== "rgba(0, 0, 0, 0)" ? style.backgroundColor : "#000000";
    context.fillRect(0, 0, width, height);

    if (objectFit === "fill") {
      context.drawImage(video, 0, 0, width, height);
      return;
    }

    let drawWidth = videoWidth;
    let drawHeight = videoHeight;

    if (objectFit === "cover") {
      const scale = Math.max(width / videoWidth, height / videoHeight);
      drawWidth = videoWidth * scale;
      drawHeight = videoHeight * scale;
    } else if (objectFit === "contain" || objectFit === "scale-down") {
      const containScale = Math.min(width / videoWidth, height / videoHeight);
      const scale = objectFit === "scale-down" ? Math.min(1, containScale) : containScale;
      drawWidth = videoWidth * scale;
      drawHeight = videoHeight * scale;
    }

    const left = (width - drawWidth) * position.x;
    const top = (height - drawHeight) * position.y;
    context.drawImage(video, left, top, drawWidth, drawHeight);
  }

  function parseObjectPosition(value) {
    const parts = String(value || "50% 50%").trim().split(/\s+/);
    return {
      x: parsePositionPart(parts[0], 0.5),
      y: parsePositionPart(parts[1] || "50%", 0.5)
    };
  }

  function parsePositionPart(value, fallback) {
    const text = String(value || "").trim().toLowerCase();
    if (text === "left" || text === "top") return 0;
    if (text === "right" || text === "bottom") return 1;
    if (text === "center") return 0.5;
    if (text.endsWith("%")) {
      const number = Number.parseFloat(text);
      return Number.isFinite(number) ? Math.max(0, Math.min(1, number / 100)) : fallback;
    }
    return fallback;
  }

  function getVideoAudioStream(video) {
    const captureStream = video.captureStream || video.mozCaptureStream;
    if (!captureStream) return null;

    try {
      const stream = captureStream.call(video);
      return stream.getAudioTracks().length ? stream : null;
    } catch (error) {
      return null;
    }
  }

  async function captureVideoFrames(video, clipSeconds) {
    await ensureVideoReady(video);

    const settings = state.settings || {};
    const maxFrames = getTargetFrameCount(clipSeconds, settings.maxVideoFrames);
    const maxSize = clampNumber(settings.maxFrameSize, 384, 1280, 768);
    const wasPaused = video.paused;
    const originalTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;
    const segment = buildVideoSegment(video, originalTime, clipSeconds);
    const frames = [];

    if (!wasPaused) {
      video.pause();
    }

    try {
      const times = buildSampleTimes(video, maxFrames, segment);

      let lastError = null;

      for (const time of times) {
        try {
          if (Number.isFinite(time)) {
            await seekVideo(video, time);
          }

          frames.push(drawVideoFrame(video, maxSize));
        } catch (error) {
          lastError = error;

          if (isCanvasFrameExportBlocked(error)) {
            break;
          }

          if (frames.length === 0) {
            try {
              frames.push(drawVideoFrame(video, maxSize));
            } catch (drawError) {
              lastError = drawError;
              if (isCanvasFrameExportBlocked(drawError)) {
                break;
              }
            }
          }

          if (frames.length > 0) {
            break;
          }
        }
      }

      if (frames.length === 0 && isCanvasFrameExportBlocked(lastError)) {
        showLoading("正在识视频", "当前视频跨域受限，已切换为可见画面截图抽帧。请保持视频画面在窗口内。");
        frames.push(...(await captureVideoFramesFromVisibleTab(video, times, maxSize)));
      }

      if (frames.length === 0 && lastError) {
        throw lastError;
      }
    } finally {
      if (Number.isFinite(originalTime) && Number.isFinite(video.duration)) {
        try {
          video.currentTime = Math.min(originalTime, video.duration);
        } catch (error) {
          // Restoring playback position is best effort.
        }
      }

      if (!wasPaused) {
        video.play().catch(() => {});
      }
    }

    return {
      frames,
      clipStart: segment.start,
      clipEnd: segment.end
    };
  }

  function buildVideoSegment(video, currentTime, clipSeconds) {
    const duration = Number(video.duration);
    const seconds = clampNumber(clipSeconds, 1, 60, 10);

    if (!Number.isFinite(duration) || duration <= 0) {
      return {
        start: Number.isFinite(currentTime) ? Math.max(0, currentTime) : 0,
        end: Number.isFinite(currentTime) ? Math.max(0, currentTime) + seconds : seconds
      };
    }

    const safeDuration = Math.max(0.1, duration);
    let start = Math.min(Math.max(0, currentTime), safeDuration);
    let end = Math.min(safeDuration, start + seconds);

    if (end - start < 0.25) {
      start = Math.max(0, safeDuration - seconds);
      end = safeDuration;
    }

    return { start, end };
  }

  function buildSampleTimes(video, maxFrames, segment) {
    const duration = Number(video.duration);
    const start = Number(segment?.start);
    const end = Number(segment?.end);

    if (
      !Number.isFinite(duration) ||
      duration <= 1 ||
      video.seekable.length === 0 ||
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      end <= start
    ) {
      return [null];
    }

    const ratios = buildSampleRatios(maxFrames);
    const span = Math.max(0.1, end - start);
    return ratios.map((ratio) => Math.min(duration - 0.05, Math.max(0, start + span * ratio)));
  }

  function getTargetFrameCount(clipSeconds, configuredMax) {
    const recommended = getRecommendedFrameCount(clipSeconds);
    const configured = clampNumber(configuredMax, 1, 24, recommended);
    return Math.max(recommended, configured);
  }

  function getRecommendedFrameCount(clipSeconds) {
    const seconds = clampNumber(clipSeconds, 1, 60, 10);
    return Math.max(1, Math.min(24, Math.ceil(seconds / 2.5) + 3));
  }

  function buildSampleRatios(frameCount) {
    if (frameCount <= 1) return [0.5];

    const count = clampNumber(frameCount, 1, 24, 8);
    const start = 0.04;
    const end = 0.96;
    const step = (end - start) / Math.max(1, count - 1);
    return Array.from({ length: count }, (_, index) => start + step * index);
  }

  async function ensureVideoReady(video) {
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth && video.videoHeight) {
      return;
    }

    await new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error("视频还没有加载到可抽帧状态。"));
      }, 5000);

      function cleanup() {
        window.clearTimeout(timeout);
        video.removeEventListener("loadeddata", handleReady);
        video.removeEventListener("loadedmetadata", handleReady);
        video.removeEventListener("error", handleError);
      }

      function handleReady() {
        if (video.videoWidth && video.videoHeight) {
          cleanup();
          resolve();
        }
      }

      function handleError() {
        cleanup();
        reject(new Error("视频加载失败，无法抽帧。"));
      }

      video.addEventListener("loadeddata", handleReady);
      video.addEventListener("loadedmetadata", handleReady);
      video.addEventListener("error", handleError);
      video.load?.();
    });
  }

  async function seekVideo(video, time) {
    if (!Number.isFinite(time)) return;

    const target = Math.max(0, time);
    if (Math.abs(video.currentTime - target) < 0.05) {
      await nextFrame();
      return;
    }

    await new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error("视频不允许跳转抽帧。"));
      }, 3500);

      function cleanup() {
        window.clearTimeout(timeout);
        video.removeEventListener("seeked", handleSeeked);
        video.removeEventListener("error", handleError);
      }

      function handleSeeked() {
        cleanup();
        resolve();
      }

      function handleError() {
        cleanup();
        reject(new Error("视频跳转失败，无法抽帧。"));
      }

      video.addEventListener("seeked", handleSeeked);
      video.addEventListener("error", handleError);

      try {
        video.currentTime = target;
      } catch (error) {
        cleanup();
        reject(new Error("当前视频不允许脚本抽帧。"));
      }
    });

    await nextFrame();
  }

  function drawVideoFrame(video, maxSize) {
    const width = video.videoWidth;
    const height = video.videoHeight;

    if (!width || !height) {
      throw new Error("视频尺寸不可用，无法抽帧。");
    }

    const scale = Math.min(1, maxSize / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));

    const context = canvas.getContext("2d", { alpha: false });
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    try {
      const displaySize = getVideoDisplaySize(video);
      return {
        dataUrl: canvas.toDataURL("image/jpeg", 0.78),
        time: Number.isFinite(video.currentTime) ? video.currentTime : null,
        displayWidth: displaySize.width,
        displayHeight: displaySize.height,
        source: "video-canvas"
      };
    } catch (error) {
      throw new Error("当前视频跨域受限，页面不能导出关键帧。");
    }
  }

  function isCanvasFrameExportBlocked(error) {
    const message = String(error?.message || "");
    return isCanvasRecordingBlocked(error) || /跨域受限|不能导出关键帧|taint|origin-clean/i.test(message);
  }

  async function captureVideoFramesFromVisibleTab(video, times, maxSize) {
    const frames = [];
    const sourceTimes = Array.isArray(times) && times.length ? times : [null];
    const previousVisibility = root.style.visibility;
    const previousControls = video.controls;
    const originalScrollX = window.scrollX;
    const originalScrollY = window.scrollY;
    const hiddenOverlays = [];

    root.style.visibility = "hidden";
    video.controls = false;

    try {
      try {
        video.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
      } catch (error) {
        video.scrollIntoView({ block: "center", inline: "center" });
      }

      await nextFrame();
      await sleep(160);

      for (let index = 0; index < sourceTimes.length; index += 1) {
        const time = sourceTimes[index];
        if (Number.isFinite(time)) {
          await seekVideo(video, time);
        }

        await nextFrame();
        await sleep(index === 0 ? 180 : 560);

        const rect = getVisibleVideoContentRect(video);
        hideVideoOverlays(video, rect, hiddenOverlays);
        await nextFrame();
        await sleep(80);
        const capture = await sendMessage("capture-visible-tab", { format: "jpeg", quality: 90 });
        frames.push(await cropVisibleTabCapture(capture?.dataUrl, rect, maxSize, video.currentTime));
      }
    } catch (error) {
      throw new Error(`当前视频跨域受限，截图抽帧兜底也失败：${error.message}`);
    } finally {
      restoreHiddenOverlays(hiddenOverlays);
      root.style.visibility = previousVisibility;
      video.controls = previousControls;
      try {
        window.scrollTo(originalScrollX, originalScrollY);
      } catch (error) {
        // Restoring page scroll is best effort.
      }
    }

    return frames;
  }

  function hideVideoOverlays(video, rect, hiddenOverlays) {
    const samplePoints = getRectSamplePoints(rect);
    const videoAncestors = getElementAncestors(video);
    const alreadyHidden = new Set(hiddenOverlays.map((item) => item.element));
    const candidates = new Set();

    for (const point of samplePoints) {
      for (const element of document.elementsFromPoint(point.x, point.y)) {
        if (!shouldHideVideoOverlayElement(element, video, videoAncestors, rect)) continue;
        candidates.add(element);
      }
    }

    for (const element of candidates) {
      if (alreadyHidden.has(element)) continue;
      hiddenOverlays.push({
        element,
        visibility: element.style.visibility,
        pointerEvents: element.style.pointerEvents
      });
      element.style.visibility = "hidden";
      element.style.pointerEvents = "none";
      alreadyHidden.add(element);
    }
  }

  function restoreHiddenOverlays(hiddenOverlays) {
    for (const item of hiddenOverlays.reverse()) {
      if (!item?.element) continue;
      item.element.style.visibility = item.visibility;
      item.element.style.pointerEvents = item.pointerEvents;
    }
  }

  function getRectSamplePoints(rect) {
    const insetX = Math.min(24, Math.max(1, rect.width * 0.08));
    const insetY = Math.min(24, Math.max(1, rect.height * 0.08));
    const xs = [rect.left + insetX, rect.left + rect.width * 0.5, rect.left + rect.width - insetX];
    const ys = [rect.top + insetY, rect.top + rect.height * 0.5, rect.top + rect.height - insetY];
    const points = [];

    for (const x of xs) {
      for (const y of ys) {
        points.push({
          x: Math.max(1, Math.min(window.innerWidth - 1, x)),
          y: Math.max(1, Math.min(window.innerHeight - 1, y))
        });
      }
    }

    return points;
  }

  function getElementAncestors(element) {
    const ancestors = new Set();
    let current = element;

    while (current) {
      ancestors.add(current);
      current = current.parentElement || (current.getRootNode?.() instanceof ShadowRoot ? current.getRootNode().host : null);
    }

    return ancestors;
  }

  function shouldHideVideoOverlayElement(element, video, videoAncestors, rect) {
    if (!element || element === video || root.contains(element)) return false;
    if (element === document.documentElement || element === document.body) return false;
    if (videoAncestors.has(element) || element.contains(video) || video.contains(element)) return false;

    const tagName = element.tagName;
    if (tagName === "VIDEO" || tagName === "CANVAS" || tagName === "IFRAME") return false;

    const style = window.getComputedStyle(element);
    if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) === 0) return false;

    const elementRect = element.getBoundingClientRect();
    if (!rectsOverlap(elementRect, rect)) return false;

    const area = Math.max(1, elementRect.width * elementRect.height);
    const videoArea = Math.max(1, rect.width * rect.height);
    if (area > videoArea * 6) return false;

    return true;
  }

  function rectsOverlap(left, right) {
    return (
      left.right > right.left &&
      left.left < right.left + right.width &&
      left.bottom > right.top &&
      left.top < right.top + right.height
    );
  }

  function getVisibleVideoContentRect(video) {
    const elementRect = video.getBoundingClientRect();
    const contentRect = getVideoContentRect(video, elementRect);
    const clippedRect = intersectRects(contentRect, elementRect, {
      left: 0,
      top: 0,
      width: window.innerWidth,
      height: window.innerHeight
    });
    const { left, top, width, height } = clippedRect;

    if (width < 8 || height < 8) {
      throw new Error("视频画面不在当前视窗内，无法截图抽帧。请把视频滚动到可见区域后重试。");
    }

    return { left, top, width, height };
  }

  function getVideoContentRect(video, rect) {
    const videoWidth = video.videoWidth || rect.width;
    const videoHeight = video.videoHeight || rect.height;
    if (!videoWidth || !videoHeight || !rect.width || !rect.height) return rect;

    const style = window.getComputedStyle(video);
    const objectFit = style.objectFit || "fill";
    const position = parseObjectPosition(style.objectPosition || "50% 50%");
    let drawWidth = rect.width;
    let drawHeight = rect.height;

    if (objectFit === "contain" || objectFit === "scale-down") {
      const containScale = Math.min(rect.width / videoWidth, rect.height / videoHeight);
      const scale = objectFit === "scale-down" ? Math.min(1, containScale) : containScale;
      drawWidth = videoWidth * scale;
      drawHeight = videoHeight * scale;
    } else if (objectFit === "cover") {
      const scale = Math.max(rect.width / videoWidth, rect.height / videoHeight);
      drawWidth = videoWidth * scale;
      drawHeight = videoHeight * scale;
    } else if (objectFit === "none") {
      drawWidth = videoWidth;
      drawHeight = videoHeight;
    }

    return {
      left: rect.left + (rect.width - drawWidth) * position.x,
      top: rect.top + (rect.height - drawHeight) * position.y,
      width: drawWidth,
      height: drawHeight
    };
  }

  function intersectRects(...rects) {
    const left = Math.max(...rects.map((rect) => rect.left));
    const top = Math.max(...rects.map((rect) => rect.top));
    const right = Math.min(...rects.map((rect) => rect.left + rect.width));
    const bottom = Math.min(...rects.map((rect) => rect.top + rect.height));

    return {
      left,
      top,
      width: Math.max(0, right - left),
      height: Math.max(0, bottom - top)
    };
  }

  async function cropVisibleTabCapture(dataUrl, rect, maxSize, currentTime) {
    if (!dataUrl) {
      throw new Error("没有拿到标签页截图。");
    }

    const image = await loadDataUrlImage(dataUrl);
    const scaleX = image.naturalWidth / Math.max(1, window.innerWidth);
    const scaleY = image.naturalHeight / Math.max(1, window.innerHeight);
    const sourceX = Math.max(0, Math.round(rect.left * scaleX));
    const sourceY = Math.max(0, Math.round(rect.top * scaleY));
    const sourceWidth = Math.min(image.naturalWidth - sourceX, Math.round(rect.width * scaleX));
    const sourceHeight = Math.min(image.naturalHeight - sourceY, Math.round(rect.height * scaleY));

    if (sourceWidth < 8 || sourceHeight < 8) {
      throw new Error("截图里没有足够的视频画面。");
    }

    const outputScale = Math.min(1, maxSize / Math.max(sourceWidth, sourceHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(sourceWidth * outputScale));
    canvas.height = Math.max(1, Math.round(sourceHeight * outputScale));

    const context = canvas.getContext("2d", { alpha: false });
    context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);

    return {
      dataUrl: canvas.toDataURL("image/jpeg", 0.82),
      time: Number.isFinite(currentTime) ? currentTime : null,
      displayWidth: Math.round(rect.width),
      displayHeight: Math.round(rect.height),
      source: "visible-tab-capture"
    };
  }

  function getVideoDisplaySize(video) {
    try {
      const rect = getVisibleVideoContentRect(video);
      return {
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      };
    } catch (error) {
      const rect = video.getBoundingClientRect();
      return {
        width: Math.round(rect.width || video.videoWidth || 0),
        height: Math.round(rect.height || video.videoHeight || 0)
      };
    }
  }

  function loadDataUrlImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("标签页截图加载失败。"));
      image.src = dataUrl;
    });
  }

  function captureImageDataUrl(image) {
    if (!image.naturalWidth || !image.naturalHeight) {
      return "";
    }

    const settings = state.settings || {};
    const maxSize = clampNumber(settings.maxFrameSize, 384, 1280, 768);
    const scale = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

    try {
      const context = canvas.getContext("2d", { alpha: false });
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", 0.82);
    } catch (error) {
      return "";
    }
  }

  function renderAnalysis(result) {
    panel.hidden = false;
    panel.replaceChildren();

    const header = document.createElement("div");
    header.className = "plj-panel-header";

    const title = document.createElement("h2");
    title.textContent = result.title || (result.kind === "video" ? "视频反推提示词" : "图片反推提示词");

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "plj-icon-button";
    closeButton.textContent = "×";
    closeButton.title = "关闭";
    closeButton.addEventListener("click", () => {
      panel.hidden = true;
    });

    header.append(title, closeButton);
    panel.append(header);

    if (result.kind === "video") {
      panel.append(createVideoResultActions(result));
      if (Array.isArray(result.sampleFrames) && result.sampleFrames.length) {
        panel.append(createFrameThumbnailsBlock(result.sampleFrames));
      }
    } else if (Array.isArray(result.sampleImages) && result.sampleImages.length) {
      panel.append(
        createFrameThumbnailsBlock(result.sampleImages, {
          title: "图片缩略图",
          unit: "张",
          fallbackLabel: "当前图片",
          previewTitle: "图片",
          filenamePrefix: "promptlens-image",
          downloadText: "下载图片"
        })
      );
    }

    if (result.prompts?.zh) {
      panel.append(result.kind === "image" ? createImagePromptEditorBlock(result) : createPromptBlock("即梦中文提示词", result.prompts.zh));
    }

    if (result.prompts?.coverZh) {
      panel.append(createPromptBlock("首帧/封面提示词", result.prompts.coverZh));
    }

    if (Array.isArray(result.shotList) && result.shotList.length) {
      panel.append(createStoryboardEditorBlock(result));
    }
  }

  function createFrameVoiceoverBlock(frameVoiceovers) {
    const block = document.createElement("div");
    block.className = "plj-block";

    const header = document.createElement("div");
    header.className = "plj-block-header";

    const title = document.createElement("h3");
    title.textContent = "逐帧口播文案";

    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.textContent = "复制";
    copyButton.addEventListener("click", () => copyText(formatFrameVoiceovers(frameVoiceovers), copyButton));

    const body = document.createElement("p");
    body.textContent = formatFrameVoiceovers(frameVoiceovers);

    header.append(title, copyButton);
    block.append(header, body);
    return block;
  }

  function formatFrameVoiceovers(frameVoiceovers) {
    return dedupeFrameVoiceoverVisibleText(frameVoiceovers)
      .map((item, index) => {
        const label = item.time || `Frame ${item.frame || index + 1}`;
        const visibleText = item.visibleText ? `字幕/OCR：${item.visibleText}` : "";
        const voiceover = item.voiceover ? `口播：${item.voiceover}` : "口播：未识别";
        return [`${index + 1}. ${label}`, visibleText, voiceover].filter(Boolean).join("\n");
      })
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

  function createVideoResultActions(result) {
    const block = document.createElement("div");
    block.className = "plj-video-actions";

    const primaryActions = document.createElement("div");
    primaryActions.className = "plj-action-row";

    const jimengButton = document.createElement("button");
    jimengButton.type = "button";
    jimengButton.textContent = "复制提示词并打开即梦";
    jimengButton.addEventListener("click", () => openJimengWithPrompt(result, jimengButton));

    const downloadButton = document.createElement("button");
    downloadButton.type = "button";
    downloadButton.textContent = "下载视频";
    downloadButton.addEventListener("click", () => {
      const video = getResultVideo(result) || getActiveVideo();
      if (!video) {
        showError("下载失败", "当前没有可操作的视频。请重新悬停到目标视频后再试。");
        return;
      }
      downloadVideo(video);
    });

    primaryActions.append(jimengButton, downloadButton);

    const helper = document.createElement("p");
    helper.className = "plj-helper-text";
    helper.textContent = "也可以从当前播放点重新节选识别：";

    const durations = createVideoDurationSelector((seconds) => {
      const video = getResultVideo(result) || getActiveVideo();
      if (!video) {
        showError("识视频失败", "当前没有可操作的视频。请重新悬停到目标视频后再试。");
        return;
      }
      analyzeVideo(video, seconds);
    }, { compact: true });

    block.append(primaryActions, helper, durations);
    return block;
  }

  function createVideoDurationSelector(onSelect, options = {}) {
    const wrapper = document.createElement("div");
    wrapper.className = options.compact ? "plj-duration-selector plj-duration-selector-compact" : "plj-duration-selector";

    const primary = document.createElement("div");
    primary.className = options.compact ? "plj-duration-grid plj-duration-grid-compact" : "plj-duration-grid";
    appendDurationButtons(primary, VIDEO_CLIP_DURATIONS, onSelect);
    wrapper.append(primary);

    const more = document.createElement("details");
    more.className = "plj-duration-more";

    const summary = document.createElement("summary");
    summary.textContent = "更多秒数";

    const extra = document.createElement("div");
    extra.className = "plj-duration-grid plj-duration-grid-extra";
    appendDurationButtons(extra, EXTRA_VIDEO_CLIP_DURATIONS, onSelect);

    more.append(summary, extra);
    wrapper.append(more);
    return wrapper;
  }

  function appendDurationButtons(container, durations, onSelect) {
    for (const seconds of durations) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = formatDurationLabel(seconds);
      button.addEventListener("click", () => onSelect(seconds));
      container.append(button);
    }
  }

  function formatDurationLabel(seconds) {
    const value = Number(seconds);
    if (Number.isFinite(value) && value >= 60 && value % 60 === 0) {
      return `${value / 60}min`;
    }
    return `${value}s`;
  }

  function createFrameThumbnailsBlock(frames, options = {}) {
    const block = document.createElement("div");
    block.className = "plj-block plj-frame-block";

    const header = document.createElement("div");
    header.className = "plj-block-header";

    const title = document.createElement("h3");
    title.textContent = options.title || "抽帧缩略图";

    const hint = document.createElement("span");
    hint.className = "plj-inline-hint";
    hint.textContent = `${frames.length} ${options.unit || "帧"}`;

    const strip = document.createElement("div");
    strip.className = "plj-frame-strip";

    frames.forEach((frame, index) => {
      const previewUrl = getPreviewImageUrl(frame);
      if (!previewUrl) return;
      const item = document.createElement("figure");
      item.className = "plj-frame-thumb";

      const image = document.createElement("img");
      image.src = previewUrl;
      image.alt = frame.label || `${options.previewTitle || "抽帧"} ${index + 1}`;
      image.loading = "lazy";

      const caption = document.createElement("figcaption");
      caption.textContent = getPreviewLabel(frame, index, options);

      item.tabIndex = 0;
      item.role = "button";
      item.title = "点击查看大图并下载";
      item.addEventListener("click", () => showFramePreview(frame, index, options));
      item.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          showFramePreview(frame, index, options);
        }
      });

      item.append(image, caption);
      strip.append(item);
    });

    header.append(title, hint);
    block.append(header, strip);
    return block;
  }

  function getPreviewImageUrl(frame) {
    return frame?.dataUrl || frame?.sourceUrl || frame?.url || "";
  }

  function getPreviewLabel(frame, index, options = {}) {
    if (frame?.label) return String(frame.label).trim() || `${options.fallbackLabel || "第"} ${index + 1}`;
    const relativeTime = Number.isFinite(frame?.relativeTime) ? frame.relativeTime : frame?.time;
    if (Number.isFinite(relativeTime)) return `${formatRelativeSeconds(relativeTime)}s`;
    return options.fallbackLabel || `第 ${index + 1} 帧`;
  }

  function showFramePreview(frame, index, options = {}) {
    const previewUrl = getPreviewImageUrl(frame);
    if (!previewUrl) return;

    framePreview.hidden = false;
    framePreview.replaceChildren();

    const timeLabel = getPreviewLabel(frame, index, options);
    const filename = `${options.filenamePrefix || "promptlens-frame"}-${String(index + 1).padStart(2, "0")}-${sanitizeDownloadPart(timeLabel)}.${getImageDownloadExtension(previewUrl)}`;

    const dialog = document.createElement("div");
    dialog.className = "plj-frame-dialog";
    dialog.addEventListener("click", (event) => event.stopPropagation());

    const header = document.createElement("div");
    header.className = "plj-frame-dialog-header";

    const title = document.createElement("strong");
    title.textContent = `${options.previewTitle || "抽帧"} ${index + 1} · ${timeLabel}`;

    const actions = document.createElement("div");
    actions.className = "plj-frame-dialog-actions";

    const downloadButton = document.createElement("button");
    downloadButton.type = "button";
    downloadButton.textContent = options.downloadText || "下载当前帧";
    downloadButton.addEventListener("click", async () => {
      const originalText = downloadButton.textContent;
      downloadButton.disabled = true;
      downloadButton.textContent = "下载中...";

      try {
        await downloadPreviewImage(previewUrl, filename);
        downloadButton.textContent = "已下载";
        window.setTimeout(() => {
          downloadButton.textContent = originalText;
        }, 1200);
      } catch (error) {
        console.error("[PromptLens Jimeng] 图片下载失败", error);
        downloadButton.textContent = "下载失败";
        window.setTimeout(() => {
          downloadButton.textContent = originalText;
        }, 1600);
      } finally {
        window.setTimeout(() => {
          downloadButton.disabled = false;
        }, 300);
      }
    });

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.textContent = "关闭";
    closeButton.dataset.framePreviewClose = "true";
    closeButton.addEventListener("click", closeFramePreview);

    actions.append(downloadButton, closeButton);
    header.append(title, actions);

    const image = document.createElement("img");
    image.src = previewUrl;
    image.alt = `${options.previewTitle || "抽帧"} ${index + 1}`;
    applyPreviewImageDisplaySize(image, frame);

    dialog.append(header, image);
    framePreview.append(dialog);
  }

  function applyPreviewImageDisplaySize(image, frame) {
    const width = Number(frame?.displayWidth);
    const height = Number(frame?.displayHeight);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;

    const maxWidth = Math.max(120, window.innerWidth - 64);
    const maxHeight = Math.max(120, window.innerHeight - 128);
    const scale = Math.min(1, maxWidth / width, maxHeight / height);

    image.style.width = `${Math.max(1, Math.round(width * scale))}px`;
    image.style.height = `${Math.max(1, Math.round(height * scale))}px`;
  }

  function closeFramePreview() {
    framePreview.hidden = true;
    framePreview.replaceChildren();
  }

  async function downloadPreviewImage(url, filename) {
    if (/^data:image\//i.test(String(url || ""))) {
      downloadDataUrlLocally(url, filename);
      return;
    }

    await sendMessage("download-media-file", {
      url,
      filename,
      kind: "image",
      saveAs: false
    });
  }

  function downloadDataUrlLocally(dataUrl, filename) {
    const anchor = document.createElement("a");
    anchor.href = dataUrl;
    anchor.download = filename;
    anchor.rel = "noopener";
    document.documentElement.append(anchor);
    anchor.click();
    anchor.remove();
  }

  function getImageDownloadExtension(url) {
    const source = String(url || "");
    const dataMatch = source.match(/^data:image\/(png|webp|jpeg|jpg)/i);
    if (dataMatch) return dataMatch[1].toLowerCase() === "jpeg" ? "jpg" : dataMatch[1].toLowerCase();
    const pathMatch = source.split("?")[0].match(/\.([a-z0-9]{2,5})$/i);
    if (pathMatch && ["jpg", "jpeg", "png", "webp", "gif", "avif"].includes(pathMatch[1].toLowerCase())) {
      return pathMatch[1].toLowerCase() === "jpeg" ? "jpg" : pathMatch[1].toLowerCase();
    }
    return "jpg";
  }

  function sanitizeDownloadPart(value) {
    return String(value || "frame").replace(/[\\/:*?"<>|\s]+/g, "-").replace(/^-+|-+$/g, "") || "frame";
  }
  function createStoryboardEditorBlock(result) {
    const block = document.createElement("div");
    block.className = "plj-block plj-storyboard-editor";

    const header = document.createElement("div");
    header.className = "plj-block-header";

    const title = document.createElement("h3");
    title.textContent = "分镜视频结构";

    const actions = document.createElement("div");
    actions.className = "plj-editor-actions";

    const applyButton = document.createElement("button");
    applyButton.type = "button";
    applyButton.textContent = "应用替换";
    applyButton.addEventListener("click", () => applyStoryboardGlobals(block, applyButton));

    const editorButton = document.createElement("button");
    editorButton.type = "button";
    editorButton.className = "plj-primary-action";
    editorButton.textContent = "打开分镜编辑器";
    editorButton.addEventListener("click", () => openStoryboardEditor(block, result, editorButton));

    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.textContent = "复制分镜";
    copyButton.addEventListener("click", () => {
      const editableData = readStoryboardEditor(block);
      copyText(formatStoryboardEditorText(editableData.context, editableData.shots), copyButton);
    });

    actions.append(applyButton, copyButton, editorButton);
    header.append(title, actions);

    const contextGrid = document.createElement("div");
    contextGrid.className = "plj-story-context";
    contextGrid.append(
      createContextEditorField("修改大纲", "outline", result.outline || result.raw?.outline || "", true),
      createContextEditorField("主体", "subject", result.subject || ""),
      createContextEditorField("场景", "scene", result.scene || ""),
      createContextEditorField("风格", "style", result.style || ""),
      createContextEditorField("BGM", "bgm", getGlobalBgmFromResult(result))
    );

    const helper = document.createElement("p");
    helper.className = "plj-helper-text";
    helper.textContent = "修改大纲用于提供新的故事内容；点“应用替换”会按大纲重写后续镜头，并清理每段里重复的全局参考。";

    const contextPanel = document.createElement("div");
    contextPanel.className = "plj-story-context-panel";

    const contextTitle = document.createElement("h4");
    contextTitle.textContent = "全局参考列表";

    const list = document.createElement("div");
    list.className = "plj-shot-list plj-shot-editor-list";

    result.shotList.forEach((shot, index) => {
      const normalizedShot = normalizeEditableShot(shot, index);
      const item = document.createElement("article");
      item.className = "plj-shot-item plj-shot-editor";
      item.dataset.shotIndex = String(index);

      const shotTitle = document.createElement("h4");
      shotTitle.textContent = `镜头 ${index + 1}`;

      const shotHead = document.createElement("div");
      shotHead.className = "plj-shot-editor-head";

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "plj-shot-delete";
      deleteButton.textContent = "删除";
      deleteButton.addEventListener("click", () => deleteStoryboardShot(item));

      shotHead.append(shotTitle, deleteButton);

      item.append(
        shotHead,
        createShotTimeEditorField(normalizedShot.time, result.clipStart),
        createShotEditorField("画面描述", "description", normalizedShot.description, true),
        createShotEditorField("镜头语言", "camera", normalizedShot.camera, true)
      );

      list.append(item);
    });

    const shotPanel = document.createElement("div");
    shotPanel.className = "plj-shot-edit-panel";

    const shotHeader = document.createElement("div");
    shotHeader.className = "plj-subsection-header";

    const shotTitle = document.createElement("h4");
    shotTitle.textContent = "镜头调整";

    const shotCount = document.createElement("span");
    shotCount.className = "plj-inline-hint";
    shotCount.dataset.shotCount = "true";
    shotCount.textContent = `${result.shotList.length} 个镜头`;

    shotHeader.append(shotTitle, shotCount);
    contextPanel.append(contextTitle, contextGrid, helper);
    shotPanel.append(shotHeader, list);
    block.append(header, contextPanel, shotPanel);
    return block;
  }

  function deleteStoryboardShot(item) {
    if (!item) return;
    item.remove();
    renumberStoryboardShots(item.closest(".plj-storyboard-editor"));
  }

  function renumberStoryboardShots(block) {
    if (!block) return;
    const items = Array.from(block.querySelectorAll("[data-shot-index]"));
    items.forEach((item, index) => {
      item.dataset.shotIndex = String(index);
      const title = item.querySelector(".plj-shot-editor-head h4");
      if (title) title.textContent = `镜头 ${index + 1}`;
      const timeInput = item.querySelector("[data-shot-field='time']");
      if (timeInput && /^镜头\s+\d+$/u.test(timeInput.value.trim())) {
        timeInput.value = `镜头 ${index + 1}`;
      }
    });

    const count = block.querySelector("[data-shot-count]");
    if (count) count.textContent = `${items.length} 个镜头`;
  }

  async function openStoryboardEditor(block, result, button) {
    const editableData = readStoryboardEditor(block);
    const video = getResultVideo(result) || getActiveVideo() || getStoryboardVideo();
    const previousText = button.textContent;
    button.disabled = true;
    button.textContent = "正在打开...";

    try {
      await sendMessage("open-storyboard-tool", {
        title: result.title || document.title || "分镜脚本",
        pageTitle: document.title,
        pageUrl: location.href,
        sourceLocator: buildSourceVideoLocator(video, result),
        context: editableData.context,
        shots: editableData.shots,
        frames: Array.isArray(result.sampleFrames) ? result.sampleFrames : [],
        prompts: result.prompts || {},
        raw: result.raw || {},
        clipStart: Number.isFinite(result.clipStart) ? result.clipStart : null,
        clipEnd: Number.isFinite(result.clipEnd) ? result.clipEnd : null,
        clipSeconds: Number.isFinite(result.clipSeconds) ? result.clipSeconds : null
      });
      button.textContent = "已打开";
    } catch (error) {
      console.error("[PromptLens Jimeng] 打开分镜编辑器失败", error);
      button.textContent = "打开失败";
      showError("打开失败", error.message || "无法打开分镜编辑器。");
    } finally {
      window.setTimeout(() => {
        button.disabled = false;
        button.textContent = previousText;
      }, 1200);
    }
  }

  function createContextEditorField(label, field, value, multiline = false) {
    const wrapper = document.createElement("label");
    wrapper.className = "plj-story-field";

    const caption = document.createElement("span");
    caption.textContent = label;

    const input = document.createElement(multiline ? "textarea" : "input");
    if (!multiline) input.type = "text";
    input.className = multiline ? "plj-story-textarea" : "plj-story-input";
    input.dataset.storyContext = field;
    input.dataset.storyOriginal = value || "";
    input.value = value || "";
    if (multiline) input.rows = 3;

    wrapper.append(caption, input);
    return wrapper;
  }

  function createShotTimeEditorField(value, clipStart) {
    const wrapper = document.createElement("div");
    wrapper.className = "plj-story-field";

    const caption = document.createElement("span");
    caption.textContent = "镜头时间";

    const row = document.createElement("div");
    row.className = "plj-shot-time-row";

    const input = document.createElement("input");
    input.type = "text";
    input.className = "plj-story-input";
    input.dataset.shotField = "time";
    input.value = value || "";
    input.title = "点击跳转到该镜头起始帧，也可以直接编辑时间";

    const seekButton = document.createElement("button");
    seekButton.type = "button";
    seekButton.textContent = "跳转";
    seekButton.title = "跳到该镜头起始帧";

    input.addEventListener("click", () => seekToStoryboardShot(input.value, clipStart, seekButton));
    seekButton.addEventListener("click", () => seekToStoryboardShot(input.value, clipStart, seekButton));

    row.append(input, seekButton);
    wrapper.append(caption, row);
    return wrapper;
  }

  function createShotEditorField(label, field, value, multiline = false) {
    const wrapper = document.createElement("label");
    wrapper.className = "plj-story-field";

    const caption = document.createElement("span");
    caption.textContent = label;

    const control = document.createElement(multiline ? "textarea" : "input");
    if (!multiline) control.type = "text";
    control.className = multiline ? "plj-story-textarea" : "plj-story-input";
    control.dataset.shotField = field;
    control.value = value || "";
    if (multiline) control.rows = field === "description" ? 3 : 2;

    wrapper.append(caption, control);
    return wrapper;
  }

  async function seekToStoryboardShot(timeText, clipStart, feedbackButton) {
    const relativeTime = parseStoryboardStartTime(timeText);
    if (!Number.isFinite(relativeTime)) {
      flashButtonText(feedbackButton, "无时间");
      return;
    }

    const video = getStoryboardVideo();
    if (!video) {
      flashButtonText(feedbackButton, "找不到视频");
      return;
    }

    const baseTime = Number.isFinite(clipStart) ? clipStart : 0;
    const duration = Number.isFinite(video.duration) ? video.duration : null;
    const targetTime = duration === null ? Math.max(0, baseTime + relativeTime) : clampNumber(baseTime + relativeTime, 0, Math.max(0, duration - 0.05), 0);

    try {
      flashButtonText(feedbackButton, "定位中", 1200);
      video.pause?.();
      await seekVideo(video, targetTime);
      video.pause?.();
      flashButtonText(feedbackButton, "已跳转");
    } catch (error) {
      console.error("[PromptLens Jimeng] 分镜跳转失败", error);
      flashButtonText(feedbackButton, "跳转失败");
    }
  }

  function parseStoryboardStartTime(value) {
    const source = String(value || "").trim();
    const match = source.match(/(\d+(?:\.\d+)?)/);
    if (!match) return null;
    const seconds = Number(match[1]);
    return Number.isFinite(seconds) ? seconds : null;
  }

  function getStoryboardVideo() {
    if (isValidMediaElement(state.lastAnalyzedVideo, "VIDEO")) {
      return state.lastAnalyzedVideo;
    }

    return getActiveVideo();
  }

  function flashButtonText(button, text, delay = 1200) {
    if (!button) return;
    const originalText = button.dataset.originalText || button.textContent;
    button.dataset.originalText = originalText;
    button.textContent = text;
    window.clearTimeout(Number(button.dataset.flashTimer || 0));
    button.dataset.flashTimer = String(
      window.setTimeout(() => {
        button.textContent = button.dataset.originalText || originalText;
      }, delay)
    );
  }

  function normalizeEditableShot(shot, index) {
    return {
      time: firstShotValue(shot?.镜头时间, shot?.shotTime, shot?.time, shot?.frame, shot?.duration) || `镜头 ${index + 1}`,
      description: firstShotValue(shot?.画面描述, shot?.visualDescription, shot?.visual, shot?.scene, shot?.description),
      camera: firstShotValue(shot?.镜头语言, shot?.cameraLanguage, shot?.camera, shot?.cameraMovement, shot?.lens)
    };
  }

  function getGlobalBgmFromResult(result) {
    const direct = firstShotValue(
      result?.bgm,
      result?.raw?.bgm,
      result?.raw?.BGM,
      result?.raw?.music,
      result?.raw?.sound,
      result?.raw?.audio,
      result?.raw?.rhythm
    );
    if (direct) return direct;

    const shots = Array.isArray(result?.shotList) ? result.shotList : [];
    for (const shot of shots) {
      const value = firstShotValue(shot?.BGM, shot?.bgm, shot?.music, shot?.sound, shot?.audio, shot?.rhythm);
      if (value) return value;
    }

    return "";
  }

  function readStoryboardEditor(block) {
    const context = {
      outline: block.querySelector("[data-story-context='outline']")?.value.trim() || "",
      subject: block.querySelector("[data-story-context='subject']")?.value.trim() || "",
      scene: block.querySelector("[data-story-context='scene']")?.value.trim() || "",
      style: block.querySelector("[data-story-context='style']")?.value.trim() || "",
      bgm: block.querySelector("[data-story-context='bgm']")?.value.trim() || ""
    };

    const shots = Array.from(block.querySelectorAll("[data-shot-index]")).map((item, index) => ({
      title: `镜头 ${index + 1}`,
      time: item.querySelector("[data-shot-field='time']")?.value.trim() || `镜头 ${index + 1}`,
      description: item.querySelector("[data-shot-field='description']")?.value.trim() || "未识别",
      camera: item.querySelector("[data-shot-field='camera']")?.value.trim() || "未识别"
    }));

    return { context, shots };
  }

  async function applyStoryboardGlobals(block, button) {
    const editableData = readStoryboardEditor(block);
    if (editableData.context.outline) {
      const previousText = button?.textContent || "应用替换";
      if (button) {
        button.disabled = true;
        button.textContent = "按大纲重写中...";
      }

      try {
        const result = await sendMessage("rewrite-storyboard-shots", {
          pageTitle: document.title,
          context: editableData.context,
          shots: editableData.shots.map((shot) => ({
            ...shot,
            description: stripStoryboardContextPrefix(shot.description),
            camera: stripStoryboardContextPrefix(shot.camera)
          }))
        });
        applyStoryboardRewriteResult(block, result);
        updateStoryboardOriginalContext(block);
        if (button) {
          button.textContent = "已按大纲重写";
          window.setTimeout(() => {
            button.disabled = false;
            button.textContent = previousText;
          }, 1400);
        }
        return;
      } catch (error) {
        console.error("[PromptLens Jimeng] 按大纲重写分镜失败", error);
        applyStoryboardLocalReplacement(block);
        if (button) {
          button.textContent = "重写失败，已基础替换";
          window.setTimeout(() => {
            button.disabled = false;
            button.textContent = previousText;
          }, 1800);
        }
        return;
      }
    }

    applyStoryboardLocalReplacement(block);
    updateStoryboardOriginalContext(block);
  }

  function applyStoryboardLocalReplacement(block) {
    const replacements = getStoryboardContextReplacements(block);

    block.querySelectorAll("[data-shot-field='description'], [data-shot-field='camera']").forEach((control) => {
      const cleanValue = stripStoryboardContextPrefix(control.value);
      control.value = applyStoryboardTextReplacements(cleanValue, replacements);
    });
  }

  function updateStoryboardOriginalContext(block) {
    block.querySelectorAll("[data-story-context]").forEach((control) => {
      control.dataset.storyOriginal = control.value.trim();
    });
  }

  function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function applyStoryboardRewriteResult(block, result) {
    if (isPlainObject(result)) {
      for (const field of ["outline", "subject", "scene", "style", "bgm"]) {
        const value = String(result[field] || "").trim();
        const control = block.querySelector(`[data-story-context='${field}']`);
        if (value && control) {
          control.value = value;
        }
      }
    }

    const rewrittenShots = Array.isArray(result?.shotList) ? result.shotList : [];
    const shotItems = Array.from(block.querySelectorAll("[data-shot-index]"));
    shotItems.forEach((item, index) => {
      const shot = rewrittenShots[index];
      if (!isPlainObject(shot)) return;

      const time = firstShotValue(shot.time, shot.镜头时间, shot.shotTime);
      const description = stripStoryboardContextPrefix(
        firstShotValue(shot.description, shot.画面描述, shot.visualDescription, shot.visual)
      );
      const camera = stripStoryboardContextPrefix(
        firstShotValue(shot.camera, shot.镜头语言, shot.cameraLanguage, shot.cameraMovement)
      );

      const timeInput = item.querySelector("[data-shot-field='time']");
      const descriptionInput = item.querySelector("[data-shot-field='description']");
      const cameraInput = item.querySelector("[data-shot-field='camera']");

      if (time && timeInput) timeInput.value = time;
      if (description && descriptionInput) descriptionInput.value = description;
      if (camera && cameraInput) cameraInput.value = camera;
    });
  }

  function getStoryboardContextReplacements(block) {
    return ["subject", "scene", "style"]
      .map((field) => {
        const control = block.querySelector(`[data-story-context='${field}']`);
        const from = String(control?.dataset?.storyOriginal || "").trim();
        const to = String(control?.value || "").trim();
        return { from, to };
      })
      .filter((item) => item.from && item.to && item.from !== item.to && item.from.length >= 2);
  }

  function applyStoryboardTextReplacements(value, replacements) {
    let nextValue = String(value || "");
    for (const { from, to } of replacements) {
      nextValue = nextValue.split(from).join(to);
    }
    return nextValue;
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

  function createPromptBlock(label, value) {
    const block = document.createElement("div");
    block.className = "plj-block";

    const header = document.createElement("div");
    header.className = "plj-block-header";

    const title = document.createElement("h3");
    title.textContent = label;

    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.textContent = "复制";
    copyButton.addEventListener("click", () => copyText(String(value || ""), copyButton));

    const body = document.createElement("p");
    body.textContent = value;

    header.append(title, copyButton);
    block.append(header, body);
    return block;
  }

  function createImagePromptEditorBlock(result) {
    const block = document.createElement("div");
    block.className = "plj-block plj-prompt-editor";

    const header = document.createElement("div");
    header.className = "plj-block-header";

    const title = document.createElement("h3");
    title.textContent = "即梦中文提示词";

    const actions = document.createElement("div");
    actions.className = "plj-editor-actions";

    const generateButton = document.createElement("button");
    generateButton.type = "button";
    generateButton.textContent = "生图预览";

    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.textContent = "复制提示词";

    actions.append(generateButton, copyButton);
    header.append(title, actions);

    const promptField = document.createElement("label");
    promptField.className = "plj-story-field";

    const promptCaption = document.createElement("span");
    promptCaption.textContent = "提示词，可直接编辑";

    const promptTextarea = document.createElement("textarea");
    promptTextarea.className = "plj-story-textarea plj-prompt-textarea";
    promptTextarea.rows = 7;
    promptTextarea.value = result.prompts?.zh || "";
    promptTextarea.dataset.imagePrompt = "true";

    promptField.append(promptCaption, promptTextarea);

    const helper = document.createElement("p");
    helper.className = "plj-helper-text";
    helper.textContent = "可以直接修改完整提示词，然后复制或生成预览。";

    const previewStatus = document.createElement("p");
    previewStatus.className = "plj-helper-text plj-preview-status";
    previewStatus.hidden = true;

    const previewSlot = document.createElement("div");
    previewSlot.className = "plj-generated-preview-slot";
    previewSlot.hidden = true;

    copyButton.addEventListener("click", () => copyText(promptTextarea.value.trim(), copyButton));

    generateButton.addEventListener("click", async () => {
      await generateImagePreviewFromPrompt(promptTextarea.value, generateButton, previewStatus, previewSlot);
    });

    block.append(header, promptField, helper, previewStatus, previewSlot);
    return block;
  }

  async function generateImagePreviewFromPrompt(prompt, button, statusElement, previewSlot) {
    const cleanPrompt = String(prompt || "").trim();
    if (!cleanPrompt) {
      statusElement.hidden = false;
      statusElement.textContent = "请先填写提示词，再生成预览。";
      return;
    }

    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = "生成中...";
    statusElement.hidden = false;
    statusElement.textContent = "正在调用生图预览 API，可能需要几十秒。";

    try {
      const result = await sendMessage("generate-image-preview", { prompt: cleanPrompt });
      const previewUrl = result.dataUrl || result.imageUrl || "";
      if (!previewUrl) {
        throw new Error("没有拿到可预览的图片。");
      }

      previewSlot.hidden = false;
      previewSlot.replaceChildren(
        createFrameThumbnailsBlock(
          [
            {
              dataUrl: previewUrl,
              sourceUrl: result.imageUrl || "",
              label: "生图预览"
            }
          ],
          {
            title: "生图预览",
            unit: "张",
            fallbackLabel: "生图预览",
            previewTitle: "生图预览",
            filenamePrefix: "promptlens-preview",
            downloadText: "下载预览图"
          }
        )
      );
      statusElement.textContent = result.revisedPrompt ? "已生成预览，可点击放大或下载。模型优化过提示词。" : "已生成预览，可点击放大或下载。";
    } catch (error) {
      statusElement.textContent = `生图预览失败：${error.message}`;
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
  }

  function showLoading(title, detail) {
    showStatus(title, detail, "loading");
  }

  function showNotice(title, detail) {
    showStatus(title, detail, "notice");
  }

  function showError(title, detail) {
    showStatus(title, detail, "error");
  }

  function showStatus(titleText, detailText, tone) {
    panel.hidden = false;
    panel.replaceChildren();

    const status = document.createElement("div");
    status.className = `plj-status plj-status-${tone}`;

    const title = document.createElement("h2");
    title.textContent = titleText;

    const detail = document.createElement("p");
    detail.textContent = detailText || "";

    const actions = document.createElement("div");
    actions.className = "plj-status-actions";

    if (isExtensionContextInvalidatedMessage(detailText)) {
      const reloadButton = document.createElement("button");
      reloadButton.type = "button";
      reloadButton.textContent = "刷新页面";
      reloadButton.addEventListener("click", () => {
        window.location.reload();
      });
      actions.append(reloadButton);
    } else {
      const settingsButton = document.createElement("button");
      settingsButton.type = "button";
      settingsButton.textContent = "打开设置";
      settingsButton.addEventListener("click", () => sendMessage("open-options"));
      actions.append(settingsButton);
    }

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.textContent = "关闭";
    closeButton.addEventListener("click", () => {
      panel.hidden = true;
    });

    actions.append(closeButton);
    status.append(title, detail, actions);
    panel.append(status);
  }

  async function copyText(text, button) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }

    const previous = button.textContent;
    button.textContent = "已复制到剪贴板";
    showInlineCopyStatus(button);
    window.setTimeout(() => {
      button.textContent = previous;
    }, 1200);
  }

  function showInlineCopyStatus(button) {
      const container = button.closest(".plj-block, .plj-status");
    if (!container) return;

    let status = container.querySelector(".plj-copy-status");
    if (!status) {
      status = document.createElement("span");
      status.className = "plj-copy-status";
      container.append(status);
    }

    status.textContent = "已复制。";
    window.setTimeout(() => {
      status.textContent = "";
    }, 1800);
  }

  async function openJimengWithPrompt(result, button) {
    const prompt = result.prompts?.zh || result.prompts?.coverZh || result.prompts?.en || "";

    if (prompt) {
      await copyText(prompt, button);
      button.textContent = "已复制，正在打开即梦";
    }

    window.open(JIMENG_URL, "_blank", "noopener");
  }

  function formatStoryboardEditorText(context, shots) {
    const contextLines = [
      context?.subject ? `主体：${context.subject}` : "",
      context?.scene ? `场景：${context.scene}` : "",
      context?.style ? `风格：${context.style}` : "",
      context?.bgm ? `BGM：${context.bgm}` : ""
    ].filter(Boolean);

    const shotLines = shots.map((shot, index) =>
      [
        `镜头 ${index + 1}`,
        `镜头时间：${shot.time || "未识别"}`,
        `画面描述：${shot.description || "未识别"}`,
        `镜头语言：${shot.camera || "未识别"}`
      ].join("\n")
    );

    return [
      contextLines.length ? `【主体/场景/风格/BGM】\n${contextLines.join("\n")}` : "",
      shotLines.length ? `【分镜列表】\n${shotLines.join("\n\n")}` : ""
    ]
      .filter(Boolean)
      .join("\n\n")
      .trim();
  }
  function firstShotValue(...values) {
    for (const value of values) {
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }

      if (Number.isFinite(value)) {
        return `${value}s`;
      }
    }

    return "";
  }

  function getActiveVideo() {
    if (isValidMediaElement(state.activeElement, "VIDEO")) {
      return state.activeElement;
    }

    return findMediaElementAtPoint(state.pointerX, state.pointerY, "VIDEO");
  }

  function bindResultVideo(result, video) {
    if (!result || !isValidMediaElement(video, "VIDEO")) return;

    Object.defineProperties(result, {
      __promptLensVideo: {
        value: video,
        configurable: true
      },
      __promptLensVideoSignature: {
        value: getVideoElementSignature(video),
        configurable: true
      }
    });
  }

  function getResultVideo(result) {
    const video = result?.__promptLensVideo;
    if (!isValidMediaElement(video, "VIDEO")) return null;

    const signature = result?.__promptLensVideoSignature || "";
    if (signature && signature !== getVideoElementSignature(video)) {
      return null;
    }

    return video;
  }

  function getVideoElementSignature(video) {
    if (!video) return "";

    return [
      getVideoUrl(video),
      video.videoWidth || "",
      video.videoHeight || "",
      video.dataset?.videoId || "",
      video.getAttribute("data-id") || "",
      video.getAttribute("aria-label") || ""
    ].join("|");
  }

  function buildSourceVideoLocator(video, result = {}) {
    if (!isValidMediaElement(video, "VIDEO")) return {};

    const rect = video.getBoundingClientRect();
    return {
      videoSignature: getVideoElementSignature(video),
      videoUrl: getVideoUrl(video),
      currentTime: Number.isFinite(video.currentTime) ? video.currentTime : null,
      clipStart: Number.isFinite(result?.clipStart) ? result.clipStart : null,
      width: video.videoWidth || Math.round(rect.width || 0) || null,
      height: video.videoHeight || Math.round(rect.height || 0) || null,
      dataVideoId: video.dataset?.videoId || video.getAttribute("data-id") || "",
      ariaLabel: video.getAttribute("aria-label") || "",
      scrollY: Number.isFinite(window.scrollY) ? window.scrollY : null,
      rect: {
        left: Math.round(rect.left || 0),
        top: Math.round(rect.top || 0),
        width: Math.round(rect.width || 0),
        height: Math.round(rect.height || 0)
      }
    };
  }

  function scheduleSourceVideoLocation() {
    if (!hasSourceLocateHash()) return;

    window.setTimeout(() => locateSourceVideoFromStoryboardJob(), 700);
    window.setTimeout(() => locateSourceVideoFromStoryboardJob(), 2200);
    window.setTimeout(() => locateSourceVideoFromStoryboardJob(), 5200);
  }

  function hasSourceLocateHash() {
    return /(?:^|[#&?])promptlens-locate-video(?:=1)?(?:$|[&?])/i.test(String(location.hash || ""));
  }

  async function locateSourceVideoFromStoryboardJob() {
    if (!hasSourceLocateHash()) return;

    try {
      const job = await sendMessage("get-storyboard-job");
      const locator = job?.sourceLocator || {};
      const video = findBestSourceVideo(locator);
      if (!video) return;

      state.lastAnalyzedVideo = video;
      state.activeElement = video;
      state.activeKind = "video";
      video.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });

      const targetTime = Number.isFinite(locator.clipStart) ? locator.clipStart : locator.currentTime;
      if (Number.isFinite(targetTime)) {
        await sleep(450);
        await seekVideo(video, targetTime).catch(() => {});
      }

      renderToolbar("video");
      positionToolbar(video);
      toolbar.hidden = false;
    } catch (error) {
      console.warn("[PromptLens Jimeng] 原页面视频定位失败", error);
    }
  }

  function findBestSourceVideo(locator = {}) {
    const videos = Array.from(document.querySelectorAll("video")).filter((video) => isValidMediaElement(video, "VIDEO"));
    if (!videos.length) return null;
    if (videos.length === 1) return videos[0];

    const scored = videos
      .map((video) => ({ video, score: scoreSourceVideo(video, locator) }))
      .sort((left, right) => right.score - left.score);

    return scored[0]?.video || null;
  }

  function scoreSourceVideo(video, locator = {}) {
    let score = 0;
    const signature = getVideoElementSignature(video);
    const videoUrl = getVideoUrl(video);
    const rect = video.getBoundingClientRect();
    const area = Math.max(0, rect.width) * Math.max(0, rect.height);

    if (locator.videoSignature && signature === locator.videoSignature) score += 10000;
    if (locator.videoUrl && videoUrl && videoUrl === locator.videoUrl) score += 8000;
    if (locator.videoUrl && videoUrl && shortMediaUrlFingerprint(videoUrl) === shortMediaUrlFingerprint(locator.videoUrl)) score += 2500;
    if (locator.dataVideoId && (video.dataset?.videoId === locator.dataVideoId || video.getAttribute("data-id") === locator.dataVideoId)) score += 3000;
    if (locator.ariaLabel && video.getAttribute("aria-label") === locator.ariaLabel) score += 1000;
    if (locator.width && video.videoWidth && Math.abs(video.videoWidth - locator.width) <= 4) score += 300;
    if (locator.height && video.videoHeight && Math.abs(video.videoHeight - locator.height) <= 4) score += 300;
    if (Number.isFinite(locator.scrollY)) {
      const videoPageTop = rect.top + window.scrollY;
      const targetTop = locator.scrollY + Number(locator.rect?.top || 0);
      score += Math.max(0, 800 - Math.abs(videoPageTop - targetTop));
    }
    if (!video.paused) score += 600;
    score += Math.min(1200, area / 900);

    return score;
  }

  function shortMediaUrlFingerprint(url) {
    try {
      const parsed = new URL(String(url || ""), location.href);
      return `${parsed.hostname}${parsed.pathname}`.replace(/\/+$/g, "");
    } catch (error) {
      return String(url || "").split("?")[0].slice(0, 180);
    }
  }

  function getSupportedMp4RecorderMimeType() {
    if (typeof MediaRecorder === "undefined") {
      return "";
    }

    const candidates = [
      "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
      "video/mp4;codecs=h264,aac",
      "video/mp4"
    ];

    return candidates.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) || "";
  }

  function getImageUrl(image) {
    return image.currentSrc || image.src || "";
  }

  function getVideoUrl(video) {
    if (video.currentSrc || video.src) {
      return video.currentSrc || video.src;
    }

    const source = video.querySelector("source[src]");
    return source?.src || "";
  }

  async function getVideoDownloadCandidate(video) {
    const elementCandidates = normalizeMediaCandidates(getVideoElementCandidates(video));
    const elementDirect = findDirectDownloadCandidate(elementCandidates);
    if (elementDirect) return { ...elementDirect, candidates: elementCandidates };

    const elementTemporary = findTemporaryVideoCandidate(elementCandidates);
    const canUseGlobalCandidates = shouldUseGlobalDownloadCandidates(video);
    const globalCandidates = normalizeMediaCandidates([
      ...extractPerformanceVideoCandidates(),
      ...extractPageVideoCandidates(),
      ...(await getNetworkMediaCandidates())
    ]);

    if (elementTemporary && !canUseGlobalCandidates) {
      const directCandidates = findDirectDownloadCandidates(globalCandidates);
      const allCandidates = normalizeMediaCandidates([...elementCandidates, ...globalCandidates]);
      if (directCandidates.length === 1) {
        return {
          ...directCandidates[0],
          candidates: allCandidates,
          message: "当前视频元素是临时播放流，已从页面数据中找到唯一可下载直链。"
        };
      }

      return {
        ...elementTemporary,
        reason: elementTemporary.reason || (/^blob:/i.test(elementTemporary.url) ? "blob" : "stream"),
        message: directCandidates.length
          ? "当前页面同时存在多个视频。为避免自动下错，已把检测到的直链列在下面，请选择目标直链下载。"
          : "当前页面同时存在多个视频。没有找到可确认的当前视频直链；请重新播放目标视频后再试。",
        candidates: allCandidates
      };
    }

    if (!canUseGlobalCandidates) {
      const directCandidates = findDirectDownloadCandidates(globalCandidates);
      const allCandidates = normalizeMediaCandidates([...elementCandidates, ...globalCandidates]);
      if (directCandidates.length === 1) {
        return {
          ...directCandidates[0],
          candidates: allCandidates,
          message: "已从页面数据中找到唯一可下载直链。"
        };
      }

      return {
        url: "",
        source: "",
        reason: "",
        message: directCandidates.length
          ? "当前页面同时存在多个视频。为避免自动下错，已把检测到的直链列在下面，请选择目标直链下载。"
          : "当前页面同时存在多个视频。没有找到可确认的当前视频直链；请重新播放目标视频后再试。",
        candidates: allCandidates
      };
    }

    const candidates = [
      ...elementCandidates,
      ...globalCandidates
    ];
    const normalized = normalizeMediaCandidates(candidates);

    const direct = findDirectDownloadCandidate(normalized);
    const bestVideoOnly = findVideoOnlyDownloadCandidate(normalized);

    if (direct && bestVideoOnly && (bestVideoOnly.qualityRank || 0) > (direct.qualityRank || 0)) {
      return {
        url: "",
        source: "",
        reason: "quality-options",
        message: `检测到更高清的 YouTube 分离视频流（${bestVideoOnly.qualityLabel || "高分辨率"}），但它可能没有声音。自动下载会得到较低清晰度的合并 MP4，可在下面手动下载高清视频流或复制地址。`,
        candidates: normalized
      };
    }

    if (!direct && bestVideoOnly) {
      return {
        url: "",
        source: "",
        reason: "quality-options",
        message: "只检测到 YouTube 分离视频流，可能没有声音。可在下面手动下载视频流，或复制视频/音频地址交给外部工具合并。",
        candidates: normalized
      };
    }

    if (direct) return { ...direct, candidates: normalized };

    const stream = normalized.find((candidate) => candidate.kind === "stream" || (/^https?:/i.test(candidate.url) && isSegmentedVideoUrl(candidate.url)));
    if (stream) return { ...stream, reason: "stream", candidates: normalized };

    const blob = normalized.find((candidate) => /^blob:/i.test(candidate.url));
    if (blob) return { ...blob, reason: "blob", candidates: normalized };

    return { url: "", source: "", reason: "", candidates: normalized };
  }

  function findDirectDownloadCandidate(candidates) {
    return findDirectDownloadCandidates(candidates)[0] || null;
  }

  function findDirectDownloadCandidates(candidates) {
    return (candidates || []).filter(
      (candidate) => (candidate.kind === "mp4" || isDirectMp4Candidate(candidate.url)) && !candidate.videoOnly && !candidate.audioOnly
    );
  }

  function findVideoOnlyDownloadCandidate(candidates) {
    return (candidates || []).find(
      (candidate) => (candidate.kind === "mp4" || isDirectMp4Candidate(candidate.url)) && candidate.videoOnly && !candidate.audioOnly
    );
  }

  function findTemporaryVideoCandidate(candidates) {
    return (candidates || []).find((candidate) => candidate.kind === "stream" || isSegmentedVideoUrl(candidate.url)) ||
      (candidates || []).find((candidate) => /^blob:/i.test(candidate.url));
  }

  function shouldUseGlobalDownloadCandidates(video) {
    if (isYouTubeWatchPage()) return true;

    const visibleVideos = Array.from(document.querySelectorAll("video"))
      .map((element) => getValidMediaElement(element))
      .filter(Boolean);

    return visibleVideos.length <= 1 && visibleVideos[0] === video;
  }

  function isYouTubeWatchPage() {
    return /(^|\.)youtube\.com$/i.test(location.hostname) && location.pathname === "/watch";
  }

  function getVideoElementCandidates(video) {
    const values = [
      video.currentSrc,
      video.src,
      video.getAttribute("src"),
      ...Array.from(video.querySelectorAll("source[src]")).map((source) => source.src || source.getAttribute("src"))
    ];

    return uniqueUrls(values).map((url) => ({
      url,
      source: "element",
      reason: ""
    }));
  }

  function extractPageVideoCandidates() {
    const values = [];
    const candidates = [];
    const metaSelectors = [
      "meta[property='og:video']",
      "meta[property='og:video:url']",
      "meta[property='og:video:secure_url']",
      "meta[name='twitter:player:stream']"
    ];

    for (const selector of metaSelectors) {
      const content = document.querySelector(selector)?.content;
      if (content) values.push(content);
    }

    for (const script of document.scripts) {
      const text = decodeEscapedVideoText(script.textContent || "");
      if (!text || !isVideoishText(text)) continue;

      candidates.push(...extractYouTubePlayerCandidates(text));

      const matches = text.match(/https?:\/\/[^"'<>\\\s]+/gi) || [];
      for (const match of matches) {
        if (isLikelyVideoUrl(match) && !isDisallowedDownloadUrl(match)) {
          values.push(match);
        }
      }
    }

    return [
      ...uniqueUrls(values).map((url) => ({
        url,
        source: "page-data",
        reason: ""
      })),
      ...candidates
    ];
  }

  function extractYouTubePlayerCandidates(text) {
    const responses = extractYouTubePlayerResponses(text);
    const candidates = [];

    for (const response of responses) {
      const streamingData = response?.streamingData || {};
      const formats = [
        ...(Array.isArray(streamingData.formats) ? streamingData.formats : []),
        ...(Array.isArray(streamingData.adaptiveFormats) ? streamingData.adaptiveFormats : [])
      ];

      for (const format of formats) {
        const candidate = createYouTubeFormatCandidate(format);
        if (candidate) candidates.push(candidate);
      }
    }

    return candidates;
  }

  function extractYouTubePlayerResponses(text) {
    const responses = [];
    const seen = new Set();

    const addResponse = (value) => {
      const response = parseJsonSafely(value);
      if (!response?.streamingData) return;
      const key = JSON.stringify(response.streamingData).slice(0, 500);
      if (seen.has(key)) return;
      seen.add(key);
      responses.push(response);
    };

    for (const jsonText of extractJsonObjectsAfterNeedle(text, "ytInitialPlayerResponse")) {
      addResponse(jsonText);
    }

    for (const match of text.matchAll(/"(?:player_response|playerResponse|embedded_player_response)"\s*:\s*"((?:\\.|[^"\\])*)"/g)) {
      addResponse(decodeJsonStringLiteral(match[1]));
    }

    return responses;
  }

  function extractJsonObjectsAfterNeedle(text, needle) {
    const objects = [];
    let searchStart = 0;

    while (objects.length < 3) {
      const needleIndex = text.indexOf(needle, searchStart);
      if (needleIndex < 0) break;

      const objectStart = text.indexOf("{", needleIndex);
      if (objectStart < 0 || objectStart - needleIndex > 500) {
        searchStart = needleIndex + needle.length;
        continue;
      }

      const objectEnd = findJsonObjectEnd(text, objectStart);
      if (objectEnd > objectStart) {
        objects.push(text.slice(objectStart, objectEnd + 1));
        searchStart = objectEnd + 1;
      } else {
        searchStart = objectStart + 1;
      }
    }

    return objects;
  }

  function findJsonObjectEnd(text, objectStart) {
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let position = objectStart; position < text.length; position += 1) {
      const character = text[position];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (character === "\\") {
          escaped = true;
        } else if (character === "\"") {
          inString = false;
        }
        continue;
      }

      if (character === "\"") {
        inString = true;
      } else if (character === "{") {
        depth += 1;
      } else if (character === "}") {
        depth -= 1;
        if (depth === 0) return position;
      }
    }

    return -1;
  }

  function createYouTubeFormatCandidate(format) {
    if (!format || typeof format !== "object") return null;

    const url = normalizePageUrl(format.url || resolveYouTubeCipherUrl(format.signatureCipher || format.cipher || ""));
    if (!url || !isLikelyVideoUrl(url) || isDisallowedDownloadUrl(url)) return null;

    const mime = normalizeMediaMime(String(format.mimeType || "").split(";")[0]) || getMediaMimeFromUrl(url);
    const audioOnly = /^audio\//i.test(mime);
    const videoOnly = /^video\//i.test(mime) && !/audio/i.test(format.mimeType || "") && !hasLikelyAudioTrack(getUrlSearchParams(url), format.itag);
    const qualityLabel = format.qualityLabel || youtubeItagLabel(format.itag) || youtubeQualityLabel(format.quality) || "";

    return {
      url,
      source: "yt-player",
      kind: audioOnly ? "audio" : isSegmentedVideoUrl(url) ? "stream" : "mp4",
      contentType: format.mimeType || mime,
      contentLength: Number(format.contentLength) || null,
      qualityLabel,
      qualityRank: parseQualityRank(qualityLabel) || youtubeItagRank(format.itag),
      itag: String(format.itag || ""),
      mime,
      audioOnly,
      videoOnly,
      reason: ""
    };
  }

  function resolveYouTubeCipherUrl(cipher) {
    const value = decodeEscapedVideoText(cipher || "");
    if (!value) return "";

    const params = new URLSearchParams(value);
    const rawUrl = params.get("url") || "";
    if (!rawUrl) return "";

    const plainSignature = params.get("sig") || params.get("signature") || "";
    if (!plainSignature && params.get("s")) {
      return "";
    }

    if (!plainSignature) return rawUrl;

    try {
      const parsedUrl = new URL(rawUrl);
      const signatureParam = params.get("sp") || "signature";
      if (!parsedUrl.searchParams.has(signatureParam)) {
        parsedUrl.searchParams.set(signatureParam, plainSignature);
      }
      return parsedUrl.toString();
    } catch (error) {
      return rawUrl;
    }
  }

  function parseJsonSafely(value) {
    try {
      return JSON.parse(value);
    } catch (error) {
      return null;
    }
  }

  function getUrlSearchParams(url) {
    try {
      return new URL(url).searchParams;
    } catch (error) {
      return new URLSearchParams();
    }
  }

  function decodeJsonStringLiteral(value) {
    try {
      return JSON.parse(`"${String(value || "").replace(/"/g, "\\\"")}"`);
    } catch (error) {
      return "";
    }
  }

  function extractPerformanceVideoCandidates() {
    if (!performance?.getEntriesByType) return [];

    return performance
      .getEntriesByType("resource")
      .map((entry) => entry.name)
      .filter((url) => isLikelyVideoUrl(url) && !isDisallowedDownloadUrl(url))
      .map((url) => {
        const mediaInfo = parseMediaUrlInfo(url);
        return {
          url,
          source: "performance",
          kind: mediaInfo.audioOnly ? "audio" : isSegmentedVideoUrl(url) ? "stream" : "mp4",
          ...mediaInfo,
          reason: ""
        };
      });
  }

  async function getNetworkMediaCandidates() {
    try {
      const candidates = await sendMessage("get-media-candidates");
      return Array.isArray(candidates)
        ? candidates.map((candidate) => {
            const mediaInfo = parseMediaUrlInfo(candidate.url);
            const qualityLabel = candidate.qualityLabel || mediaInfo.qualityLabel;
            return {
              url: candidate.url,
              source: candidate.source || "network",
              kind: candidate.kind || (mediaInfo.audioOnly ? "audio" : isSegmentedVideoUrl(candidate.url) ? "stream" : "mp4"),
              contentType: candidate.contentType || "",
              contentLength: candidate.contentLength || null,
              ...mediaInfo,
              mime: candidate.mime || mediaInfo.mime,
              qualityLabel,
              qualityRank: parseQualityRank(qualityLabel) || mediaInfo.qualityRank,
              reason: ""
            };
          })
        : [];
    } catch (error) {
      return [];
    }
  }

  function decodeEscapedVideoText(value) {
    return String(value || "")
      .replace(/\\u002[fF]/g, "/")
      .replace(/\\u0026/g, "&")
      .replace(/\\\//g, "/")
      .replace(/&amp;/g, "&");
  }

  function uniqueUrls(values) {
    const seen = new Set();
    const urls = [];

    for (const value of values) {
      const url = normalizePageUrl(value);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      urls.push(url);
    }

    return urls;
  }

  function normalizeMediaCandidates(candidates) {
    const seen = new Set();
    const normalized = [];

    for (const candidate of candidates || []) {
      const url = normalizePageUrl(candidate?.url || candidate);
      if (!url || seen.has(url)) continue;
      if (isDisallowedDownloadUrl(url)) continue;
      seen.add(url);
      const mediaInfo = parseMediaUrlInfo(url);
      const qualityLabel = candidate?.qualityLabel || mediaInfo.qualityLabel;
      normalized.push({
        url,
        source: candidate?.source || "page",
        kind: candidate?.kind || (mediaInfo.audioOnly ? "audio" : isSegmentedVideoUrl(url) ? "stream" : isLikelyVideoUrl(url) ? "mp4" : ""),
        contentType: candidate?.contentType || "",
        contentLength: candidate?.contentLength || null,
        ...mediaInfo,
        mime: candidate?.mime || mediaInfo.mime,
        qualityLabel,
        qualityRank: parseQualityRank(qualityLabel) || mediaInfo.qualityRank,
        reason: candidate?.reason || ""
      });
    }

    return normalized
      .filter((candidate) => candidate.kind || /^blob:/i.test(candidate.url))
      .sort(compareMediaCandidates);
  }

  function parseMediaUrlInfo(url) {
    const info = {
      qualityLabel: "",
      qualityRank: 0,
      itag: "",
      mime: "",
      videoOnly: false,
      audioOnly: false
    };

    let parsedUrl = null;
    try {
      parsedUrl = new URL(url);
    } catch (error) {
      return info;
    }

    const params = parsedUrl.searchParams;
    const qualityLabel = params.get("quality_label") || params.get("qualityLabel") || "";
    const quality = params.get("quality") || "";
    const itag = params.get("itag") || "";
    const mime = getMediaMimeFromUrl(url);

    info.itag = itag;
    info.mime = mime;
    info.qualityLabel = qualityLabel || youtubeItagLabel(itag) || youtubeQualityLabel(quality);
    info.qualityRank = parseQualityRank(info.qualityLabel) || youtubeItagRank(itag);
    info.audioOnly = /audio/i.test(mime) && !/video/i.test(mime);
    info.videoOnly = isYouTubeVideoOnlyItag(itag) || (/video/i.test(mime) && /ytimg|googlevideo/i.test(parsedUrl.hostname) && !hasLikelyAudioTrack(params, itag));

    return info;
  }

  function compareMediaCandidates(left, right) {
    const leftScore = scoreMediaCandidate(left);
    const rightScore = scoreMediaCandidate(right);
    return rightScore - leftScore;
  }

  function scoreMediaCandidate(candidate) {
    let score = 0;
    if (candidate.kind === "mp4") score += 100000;
    if (candidate.kind === "stream") score += 10000;
    if (candidate.source === "network") score += 3000;
    if (candidate.source === "performance") score += 1500;
    if (candidate.videoOnly) score -= 6000;
    if (candidate.audioOnly) score -= 9000;
    score += (candidate.qualityRank || 0) * 100;
    score += Math.min(5000, Math.round((Number(candidate.contentLength) || 0) / 1000000));
    return score;
  }

  function parseQualityRank(label) {
    const match = String(label || "").match(/(\d{3,4})p/i);
    return match ? Number(match[1]) || 0 : 0;
  }

  function youtubeQualityLabel(quality) {
    const map = {
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
    return map[String(quality || "").toLowerCase()] || "";
  }

  function youtubeItagLabel(itag) {
    const rank = youtubeItagRank(itag);
    return rank ? `${rank}p` : "";
  }

  function youtubeItagRank(itag) {
    const map = {
      18: 360,
      22: 720,
      37: 1080,
      38: 3072,
      133: 240,
      134: 360,
      135: 480,
      136: 720,
      137: 1080,
      138: 2160,
      160: 144,
      242: 240,
      243: 360,
      244: 480,
      247: 720,
      248: 1080,
      271: 1440,
      272: 2160,
      298: 720,
      299: 1080,
      302: 720,
      303: 1080,
      308: 1440,
      313: 2160,
      315: 2160,
      330: 144,
      331: 240,
      332: 360,
      333: 480,
      334: 720,
      335: 1080,
      336: 1440,
      337: 2160
    };
    return map[String(itag || "")] || 0;
  }

  function isYouTubeVideoOnlyItag(itag) {
    return new Set([
      "133",
      "134",
      "135",
      "136",
      "137",
      "138",
      "160",
      "242",
      "243",
      "244",
      "247",
      "248",
      "271",
      "272",
      "298",
      "299",
      "302",
      "303",
      "308",
      "313",
      "315",
      "330",
      "331",
      "332",
      "333",
      "334",
      "335",
      "336",
      "337"
    ]).has(String(itag || ""));
  }

  function hasLikelyAudioTrack(params, itag) {
    return ["18", "22", "37", "38"].includes(String(itag || "")) || /audio/i.test(params.get("mime") || params.get("mime_type") || "");
  }

  function normalizePageUrl(value) {
    const text = decodeEscapedVideoText(value).trim();
    if (!text) return "";

    try {
      return new URL(text, location.href).toString();
    } catch (error) {
      return text;
    }
  }

  function isSegmentedVideoUrl(url) {
    return /\.m3u8(?:$|[?#])/i.test(url) || /application\/vnd\.apple\.mpegurl/i.test(url);
  }

  function isVideoishText(text) {
    return /video|audio|mp4|m4a|webm|m3u8|play_addr|playwm|aweme\/v1\/play|googlevideo|videoplayback|mime(?:_type)?/i.test(text);
  }

  function isLikelyVideoUrl(url) {
    const value = String(url || "");
    const mime = getMediaMimeFromUrl(value);
    return (
      /\.(?:mp4|m4v|webm|m4a|aac|opus)(?:$|[?#])/i.test(value) ||
      /^(?:audio|video)\//i.test(mime) ||
      isYouTubePlaybackUrl(value) ||
      /\/aweme\/v1\/play\//i.test(value) ||
      /\/video\/tos\//i.test(value) ||
      /playwm/i.test(value)
    );
  }

  function isDirectMp4Candidate(url) {
    const value = String(url || "");
    const mediaInfo = parseMediaUrlInfo(value);
    return (
      /^https?:/i.test(value) &&
      !mediaInfo.audioOnly &&
      !isSegmentedVideoUrl(value) &&
      isLikelyVideoUrl(value) &&
      !isDisallowedDownloadUrl(value)
    );
  }

  function getMediaMimeFromUrl(url) {
    try {
      const parsedUrl = new URL(String(url || ""), location.href);
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

    return decodedValue
      .trim()
      .toLowerCase()
      .replace(/^video_mp4$/, "video/mp4")
      .replace(/^audio_mp4$/, "audio/mp4");
  }

  function isYouTubePlaybackUrl(url) {
    const value = String(url || "");
    return /(?:^|\/\/)[^/]*googlevideo\.com\/videoplayback/i.test(value) || /\/videoplayback(?:[?#]|$)/i.test(value);
  }

  function isDisallowedDownloadUrl(url) {
    const value = String(url || "");
    return (
      /\.(?:js|mjs|css|html?|json|map|png|jpe?g|webp|gif|svg)(?:$|[?#])/i.test(value) ||
      /youtube\.com\/s\/search\/audio\/[^/?#]+\.mp3(?:$|[?#])/i.test(value)
    );
  }

  function buildLocalVideoName() {
    const title = (document.title || "downloaded-video")
      .replace(/[\\/:*?"<>|]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
    return title || "downloaded-video";
  }

  function triggerPageDownload(url, filename) {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${filename}.mp4`;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  function triggerBlobDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const cleanFilename = filename.replace(/[\\/:*?"<>|]+/g, " ").replace(/\.(?:js|html?|webm|mov|m4v|mkv|avi)$/i, ".mp4");
    anchor.href = url;
    anchor.download = /\.mp4$/i.test(cleanFilename) ? cleanFilename : `${cleanFilename}.mp4`;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  function positionToolbar(element) {
    if (state.manualToolbarPosition) {
      applyManualToolbarPosition(state.manualToolbarPosition.left, state.manualToolbarPosition.top);
      return;
    }

    const rect = element.getBoundingClientRect();
    const left = Math.min(window.innerWidth - 16, Math.max(8, rect.left + 8));
    const top = Math.min(window.innerHeight - 48, Math.max(8, rect.top + 8));
    toolbar.style.left = `${left}px`;
    toolbar.style.top = `${top}px`;
    toolbar.classList.remove("is-manual-position");
  }

  function keepToolbarAligned() {
    if (!state.activeElement || toolbar.hidden) return;
    positionToolbar(state.activeElement);
  }

  function applyManualToolbarPosition(left, top) {
    const width = toolbar.offsetWidth || 180;
    const height = toolbar.offsetHeight || 44;
    const maxLeft = Math.max(8, window.innerWidth - width - 8);
    const maxTop = Math.max(8, window.innerHeight - height - 8);
    const nextLeft = clampNumber(left, 8, maxLeft, 12);
    const nextTop = clampNumber(top, 8, maxTop, 12);

    state.manualToolbarPosition = { left: nextLeft, top: nextTop };
    toolbar.style.left = `${nextLeft}px`;
    toolbar.style.top = `${nextTop}px`;
    toolbar.classList.add("is-manual-position");
  }

  function scheduleHideToolbar() {
    clearTimeout(state.hideTimer);
    state.hideTimer = window.setTimeout(() => {
      toolbar.hidden = true;
    }, 700);
  }

  function nextFrame() {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  function sleep(milliseconds) {
    return new Promise((resolve) => window.setTimeout(resolve, Math.max(0, milliseconds)));
  }

  function formatTime(seconds) {
    const value = Math.max(0, Number(seconds) || 0);
    const minutes = Math.floor(value / 60);
    const remaining = Math.floor(value % 60);
    return `${minutes}:${String(remaining).padStart(2, "0")}`;
  }

  function clampNumber(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(min, Math.min(max, Math.round(number)));
  }

  function sendMessage(type, payload) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage({ type, payload }, (response) => {
          const error = chrome.runtime.lastError;
          if (error) {
            reject(new Error(normalizeClientErrorMessage(error.message)));
            return;
          }

          if (!response?.ok) {
            reject(new Error(normalizeClientErrorMessage(response?.error || "扩展后台没有返回结果。")));
            return;
          }

          resolve(response.data);
        });
      } catch (error) {
        reject(new Error(normalizeClientErrorMessage(error.message)));
      }
    });
  }

  function normalizeClientErrorMessage(message) {
    const text = String(message || "");

    if (isExtensionContextInvalidatedMessage(text)) {
      return "扩展刚刚被刷新或升级，当前网页里旧的识别脚本已经失效。请点击“刷新页面”，刷新后再识别视频。";
    }

    return text || "扩展通信失败。";
  }

  function isExtensionContextInvalidatedMessage(message) {
    return /extension context invalidated|context invalidated|receiving end does not exist/i.test(String(message || ""));
  }
})();




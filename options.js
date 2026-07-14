const PROVIDER_DEFAULTS = {
  gemini: {
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    model: "gemini-2.5-flash"
  },
  gpt: {
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4.1-mini"
  },
  doubao: {
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    model: "doubao-1-5-vision-pro-32k-250115"
  },
  qwen: {
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen-vl-plus"
  },
  jimeng: {
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    model: "doubao-1-5-vision-pro-32k-250115"
  },
  "openai-compatible": {
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4.1-mini"
  }
};

const IMAGE_PREVIEW_DEFAULTS = {
  gpt: {
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-image-1.5",
    size: "ratio-1-1",
    quality: "low"
  },
  doubao: {
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    model: "doubao-seedream-4-0-250828",
    size: "ratio-1-1",
    quality: "auto"
  },
  jimeng: {
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    model: "doubao-seedream-4-0-250828",
    size: "ratio-1-1",
    quality: "auto"
  },
  gemini: {
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    model: "gemini-2.5-flash-image",
    size: "auto",
    quality: "auto"
  },
  "openai-compatible": {
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-image-1.5",
    size: "ratio-1-1",
    quality: "low"
  }
};

const form = document.querySelector("#settings-form");
const statusElement = document.querySelector("#status");
const providerElement = document.querySelector("#provider");
const imagePreviewProviderElement = document.querySelector("#imagePreviewProvider");
const restoreButton = document.querySelector("#restore-provider");
const restoreImagePreviewButton = document.querySelector("#restore-image-preview-provider");

init();

async function init() {
  const settings = await sendMessage("get-settings");
  fillForm(settings);

  providerElement.addEventListener("change", () => {
    applyProviderDefaults(providerElement.value, true);
  });

  imagePreviewProviderElement.addEventListener("change", () => {
    applyImagePreviewDefaults(imagePreviewProviderElement.value, true);
  });

  restoreButton.addEventListener("click", () => {
    applyProviderDefaults(providerElement.value, true);
  });

  restoreImagePreviewButton.addEventListener("click", () => {
    applyImagePreviewDefaults(imagePreviewProviderElement.value, true);
  });

  form.addEventListener("submit", saveSettings);
}

function fillForm(settings) {
  const provider = normalizeProvider(settings.provider || "gemini");
  const imagePreviewProvider = normalizeImagePreviewProvider(settings.imagePreviewProvider || provider);
  const providerDefaults = PROVIDER_DEFAULTS[provider] || PROVIDER_DEFAULTS.gemini;
  const imageDefaults = IMAGE_PREVIEW_DEFAULTS[imagePreviewProvider] || IMAGE_PREVIEW_DEFAULTS.gpt;

  form.provider.value = provider;
  form.baseUrl.value = settings.baseUrl || providerDefaults.baseUrl;
  form.model.value = settings.model || providerDefaults.model;
  form.apiKey.value = settings.apiKey || "";

  form.imagePreviewProvider.value = imagePreviewProvider;
  form.imagePreviewBaseUrl.value = settings.imagePreviewBaseUrl || imageDefaults.baseUrl;
  form.imagePreviewModel.value = settings.imagePreviewModel || imageDefaults.model;
  form.imagePreviewSize.value = settings.imagePreviewSize || imageDefaults.size;
  form.imagePreviewQuality.value = settings.imagePreviewQuality || imageDefaults.quality;
  form.imagePreviewApiKey.value = settings.imagePreviewApiKey || "";

  form.maxVideoFrames.value = settings.maxVideoFrames || 18;
  form.maxFrameSize.value = settings.maxFrameSize || 768;
}

function normalizeProvider(provider) {
  if (provider === "openai-compatible") return "gpt";
  return PROVIDER_DEFAULTS[provider] ? provider : "gemini";
}

function normalizeImagePreviewProvider(provider) {
  if (provider === "openai-compatible") return "gpt";
  return IMAGE_PREVIEW_DEFAULTS[provider] ? provider : "gpt";
}

function applyProviderDefaults(provider, force) {
  const defaults = PROVIDER_DEFAULTS[provider] || PROVIDER_DEFAULTS.gemini;

  if (force || !form.baseUrl.value.trim()) {
    form.baseUrl.value = defaults.baseUrl;
  }

  if (force || !form.model.value.trim()) {
    form.model.value = defaults.model;
  }
}

function applyImagePreviewDefaults(provider, force) {
  const defaults = IMAGE_PREVIEW_DEFAULTS[provider] || IMAGE_PREVIEW_DEFAULTS.gpt;

  if (force || !form.imagePreviewBaseUrl.value.trim()) {
    form.imagePreviewBaseUrl.value = defaults.baseUrl;
  }

  if (force || !form.imagePreviewModel.value.trim()) {
    form.imagePreviewModel.value = defaults.model;
  }

  if (force) {
    form.imagePreviewSize.value = defaults.size;
    form.imagePreviewQuality.value = defaults.quality;
  }
}

async function saveSettings(event) {
  event.preventDefault();
  statusElement.textContent = "正在保存...";

  try {
    const settings = await sendMessage("save-settings", {
      provider: form.provider.value,
      baseUrl: form.baseUrl.value,
      model: form.model.value,
      apiKey: form.apiKey.value,
      imagePreviewProvider: form.imagePreviewProvider.value,
      imagePreviewBaseUrl: form.imagePreviewBaseUrl.value,
      imagePreviewModel: form.imagePreviewModel.value,
      imagePreviewSize: form.imagePreviewSize.value,
      imagePreviewQuality: form.imagePreviewQuality.value,
      imagePreviewApiKey: form.imagePreviewApiKey.value,
      maxVideoFrames: form.maxVideoFrames.value,
      maxFrameSize: form.maxFrameSize.value
    });

    fillForm(settings);
    statusElement.textContent = "已保存。刷新目标网页后即可使用最新配置。";
  } catch (error) {
    statusElement.textContent = `保存失败：${error.message}`;
  }
}

function sendMessage(type, payload) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, payload }, (response) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }

      if (!response?.ok) {
        reject(new Error(response?.error || "扩展后台没有返回结果。"));
        return;
      }

      resolve(response.data);
    });
  });
}

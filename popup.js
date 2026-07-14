document.querySelector("#open-video-tool").addEventListener("click", () => {
  openExtensionPage("merge.html");
});

document.querySelector("#open-options").addEventListener("click", async () => {
  await chrome.runtime.openOptionsPage();
  window.close();
});

async function openExtensionPage(path) {
  await chrome.tabs.create({ url: chrome.runtime.getURL(path) });
  window.close();
}

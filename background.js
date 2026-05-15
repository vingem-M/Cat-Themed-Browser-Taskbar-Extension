function enableDrawerOpen() {
  if (!chrome.sidePanel?.setPanelBehavior) return;

  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
}

chrome.runtime.onInstalled.addListener(enableDrawerOpen);
chrome.runtime.onStartup.addListener(enableDrawerOpen);

enableDrawerOpen();

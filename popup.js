const state = {
  tabs: [],
  currentTab: null,
  selectedIds: new Set(),
  collapsedGroups: new Set(),
  closingGroups: new Set(),
};

const els = {
  summary: document.querySelector("#summary"),
  refreshBtn: document.querySelector("#refreshBtn"),
  decorLayer: document.querySelector("#decorLayer"),
  controlDecor: document.querySelector("#controlDecor"),
  searchInput: document.querySelector("#searchInput"),
  expandAllBtn: document.querySelector("#expandAllBtn"),
  collapseAllBtn: document.querySelector("#collapseAllBtn"),
  tabsList: document.querySelector("#tabsList"),
  selectedCount: document.querySelector("#selectedCount"),
  protectedCount: document.querySelector("#protectedCount"),
  closeBtn: document.querySelector("#closeBtn"),
  groupTemplate: document.querySelector("#groupTemplate"),
  tabTemplate: document.querySelector("#tabTemplate"),
};

async function loadTabs() {
  renderDecor();

  if (!globalThis.chrome?.tabs) {
    loadPreviewTabs();
    return;
  }

  const [tabs, activeTabs] = await Promise.all([
    chrome.tabs.query({}),
    chrome.tabs.query({ active: true, currentWindow: true }),
  ]);

  state.tabs = tabs.sort((a, b) => a.windowId - b.windowId || a.index - b.index);
  state.currentTab = activeTabs[0] || null;
  removeMissingSelections();
  render();
}

function loadPreviewTabs() {
  state.tabs = [
    {
      id: 1,
      windowId: 1,
      index: 0,
      title: "claude code_百度搜索",
      url: "https://www.baidu.com/s?wd=claude%20code",
      favIconUrl: "",
    },
    {
      id: 2,
      windowId: 1,
      index: 1,
      title: "百度一下，你就知道",
      url: "https://www.baidu.com/",
      favIconUrl: "",
    },
    {
      id: 3,
      windowId: 1,
      index: 2,
      title: "Claude Code by Anthropic | AI Coding Agent",
      url: "https://claude.com/product/claude-code",
      favIconUrl: "",
    },
    {
      id: 4,
      windowId: 1,
      index: 3,
      title: "Thanks for downloading Visual Studio Code",
      url: "https://code.visualstudio.com/download",
      favIconUrl: "",
    },
    {
      id: 5,
      windowId: 2,
      index: 0,
      title: "GitHub",
      url: "https://github.com/",
      favIconUrl: "",
      pinned: true,
    },
  ];
  state.currentTab = state.tabs[0];
  removeMissingSelections();
  render();
}

function removeMissingSelections() {
  const tabIds = new Set(state.tabs.map((tab) => tab.id));
  state.selectedIds.forEach((id) => {
    if (!tabIds.has(id)) state.selectedIds.delete(id);
  });
}

function getDomain(tab) {
  try {
    const url = new URL(tab.url);
    if (url.protocol === "chrome:") return "Chrome 页面";
    if (url.protocol === "file:") return "本地文件";
    return url.hostname.replace(/^www\./, "");
  } catch {
    return "其他页面";
  }
}

function getDisplayUrl(tab) {
  try {
    const url = new URL(tab.url);
    return `${url.hostname}${url.pathname === "/" ? "" : url.pathname}`;
  } catch {
    return tab.url || "";
  }
}

function isProtected(tab) {
  if (tab.active) return true;
  if (tab.pinned) return true;
  if (tab.audible) return true;
  return false;
}

function getVisibleTabs() {
  const query = els.searchInput.value.trim().toLowerCase();

  return state.tabs.filter((tab) => {
    if (!query) return true;

    const haystack = `${tab.title || ""} ${tab.url || ""} ${getDomain(tab)}`.toLowerCase();
    return haystack.includes(query);
  });
}

function groupTabs(tabs) {
  const groups = new Map();

  tabs.forEach((tab) => {
    const key = getDomain(tab);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(tab);
  });

  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, "zh-CN"));
}

function render() {
  const visibleTabs = getVisibleTabs();
  pruneProtectedSelections();

  els.summary.textContent = `全部 ${state.tabs.length} · 显示 ${visibleTabs.length}`;
  updateSelectionSummary(visibleTabs);
  els.tabsList.textContent = "";

  if (!visibleTabs.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "没有匹配的标签页";
    els.tabsList.append(empty);
    return;
  }

  groupTabs(visibleTabs).forEach(([groupName, tabs]) => {
    const group = els.groupTemplate.content.firstElementChild.cloneNode(true);
    const collapseButton = group.querySelector(".collapse-button");
    const closeGroupButton = group.querySelector(".close-group-button");
    const cat = group.querySelector(".cat-card");
    const catArt = group.querySelector(".cat-art");
    const logo = group.querySelector(".site-logo");
    const title = group.querySelector(".group-title");
    const meta = group.querySelector(".group-meta");
    const container = group.querySelector(".group-tabs");
    const selectableTabs = tabs.filter((tab) => !isProtected(tab));

    title.textContent = groupName;
    meta.textContent = `${tabs.length} 个`;
    logo.src = getGroupLogo(tabs, groupName);
    logo.addEventListener("error", () => {
      logo.src = "icons/icon32.svg";
    }, { once: true });
    cat.dataset.variant = getCatVariant(groupName);
    catArt.src = getCatArt(groupName);
    group.dataset.variant = cat.dataset.variant;
    group.classList.toggle("closing", state.closingGroups.has(groupName));
    closeGroupButton.disabled = selectableTabs.length === 0;
    closeGroupButton.textContent = selectableTabs.length ? "关闭" : "已保护";
    group.classList.toggle("collapsed", state.collapsedGroups.has(groupName));
    collapseButton.addEventListener("click", () => {
      if (state.collapsedGroups.has(groupName)) {
        state.collapsedGroups.delete(groupName);
        group.classList.remove("collapsed");
        playOpenSound();
      } else {
        state.collapsedGroups.add(groupName);
        group.classList.add("collapsed");
      }
    });
    closeGroupButton.addEventListener("click", () => closeGroup(groupName, selectableTabs));

    tabs.forEach((tab) => container.append(renderTab(tab)));
    els.tabsList.append(group);
  });
}

function updateSelectionSummary(visibleTabs = getVisibleTabs()) {
  const selectedCount = state.selectedIds.size;
  const protectedVisible = visibleTabs.filter(isProtected).length;

  els.selectedCount.textContent = `已选 ${selectedCount} 个`;
  els.protectedCount.textContent = protectedVisible ? `${protectedVisible} 个受保护` : "";
  els.closeBtn.disabled = selectedCount === 0;
}

function renderDecor() {
  if (els.decorLayer && !els.decorLayer.children.length) {
    const ambientStickers = [
      "assets/decor/cat-head-1.png",
      "assets/decor/cat-head-5.png",
      "assets/decor/cat-back-3.png",
      "assets/decor/cat-back-6.png",
      "assets/decor/cat-head-10.png",
      "assets/decor/cat-back-8.png",
    ];
    const ambientSlots = [
      [10, 246, 24, 10], [382, 284, 28, -6], [18, 472, 24, 6],
      [366, 498, 30, 7], [104, 542, 20, 12], [284, 560, 22, -6],
    ];
    placeDecor(els.decorLayer, ambientStickers, ambientSlots);
  }

  if (els.controlDecor && !els.controlDecor.children.length) {
    const controlStickers = [
      "assets/decor/cat-head-2.png",
      "assets/decor/cat-head-4.png",
      "assets/decor/cat-head-7.png",
      "assets/decor/cat-back-1.png",
      "assets/decor/cat-back-5.png",
    ];
    const controlSlots = [
      [18, 3, 26, -8], [112, 18, 22, 10], [284, 2, 24, -5],
      [346, 30, 26, 8], [390, 8, 24, -10],
    ];
    placeDecor(els.controlDecor, controlStickers, controlSlots);
  }
}

function placeDecor(target, stickers, slots) {
  if (!target) return;

  const shuffled = stickers
    .map((src) => ({ src, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort);

  slots.forEach(([left, top, size, rotate], index) => {
    const img = document.createElement("img");
    img.className = "decor-cat";
    img.src = shuffled[index % shuffled.length].src;
    img.style.setProperty("--left", `${left}px`);
    img.style.setProperty("--top", `${top}px`);
    img.style.setProperty("--size", `${size}px`);
    img.style.setProperty("--rotate", `${rotate}deg`);
    img.style.setProperty("--delay", `${(index % 5) * 0.18}s`);
    target.append(img);
  });
}

function getGroupLogo(tabs, groupName) {
  const tabWithIcon = tabs.find((tab) => tab.favIconUrl);
  if (tabWithIcon) return tabWithIcon.favIconUrl;

  if (groupName.includes(".")) {
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(groupName)}&sz=64`;
  }

  return "icons/icon32.svg";
}

function getCatArt(value) {
  const cats = [
    "assets/cats/pixel-cat-green.png",
    "assets/cats/pixel-cat-yellow.png",
    "assets/cats/pixel-cat-blue.png",
  ];
  const score = [...value].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return cats[score % cats.length];
}

function getCatVariant(value) {
  const variants = ["mint", "peach", "sky", "berry", "sun", "lilac"];
  const score = [...value].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return variants[score % variants.length];
}

function pruneProtectedSelections() {
  state.tabs.forEach((tab) => {
    if (state.selectedIds.has(tab.id) && isProtected(tab)) {
      state.selectedIds.delete(tab.id);
    }
  });
}

function renderTab(tab) {
  const row = els.tabTemplate.content.firstElementChild.cloneNode(true);
  const check = row.querySelector(".tab-check");
  const favicon = row.querySelector(".favicon");
  const title = row.querySelector(".tab-title");
  const url = row.querySelector(".tab-url");
  const badges = row.querySelector(".badges");
  const openButton = row.querySelector(".open-tab-button");
  const protectedTab = isProtected(tab);

  row.classList.toggle("protected", protectedTab);
  row.classList.toggle("selected", state.selectedIds.has(tab.id));
  check.checked = state.selectedIds.has(tab.id);
  check.disabled = protectedTab;
  favicon.src = tab.favIconUrl || getGroupLogo([tab], getDomain(tab));
  favicon.addEventListener("error", () => {
    favicon.src = "icons/icon16.svg";
  }, { once: true });
  title.textContent = tab.title || "无标题";
  url.textContent = getDisplayUrl(tab);

  [
    tab.active ? ["当前", "warn"] : null,
    tab.pinned ? ["固定", ""] : null,
    tab.audible ? ["播放", "warn"] : null,
  ]
    .filter(Boolean)
    .forEach(([label, tone]) => {
      const badge = document.createElement("span");
      badge.className = `badge ${tone}`.trim();
      badge.textContent = label;
      badges.append(badge);
    });

  check.addEventListener("change", () => {
    if (check.checked) {
      state.selectedIds.add(tab.id);
    } else {
      state.selectedIds.delete(tab.id);
    }
    row.classList.toggle("selected", check.checked);
    updateSelectionSummary();
    bumpSelectedGroup(row);
  });
  openButton.addEventListener("click", (event) => {
    event.preventDefault();
    openTab(tab);
  });

  return row;
}

function bumpSelectedGroup(row) {
  const group = row.closest(".group");
  if (!group) return;

  group.classList.remove("selection-bump");
  void group.offsetWidth;
  group.classList.add("selection-bump");
  window.setTimeout(() => group.classList.remove("selection-bump"), 280);
}

async function openTab(tab) {
  if (globalThis.chrome?.tabs) {
    await chrome.tabs.update(tab.id, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
    return;
  }

  globalThis.open?.(tab.url, "_blank", "noopener");
}

function selectTabs(tabs) {
  tabs.forEach((tab) => {
    if (!isProtected(tab)) state.selectedIds.add(tab.id);
  });
  render();
}

function selectVisible() {
  selectTabs(getVisibleTabs());
}

function selectDuplicates() {
  const seen = new Set();
  const duplicates = [];

  state.tabs.forEach((tab) => {
    const key = tab.url || `${tab.title}-${tab.windowId}`;
    if (seen.has(key)) duplicates.push(tab);
    seen.add(key);
  });

  selectTabs(duplicates);
}

function selectSameDomain() {
  if (!state.currentTab) return;
  const currentDomain = getDomain(state.currentTab);
  selectTabs(state.tabs.filter((tab) => getDomain(tab) === currentDomain && tab.id !== state.currentTab.id));
}

async function closeSelected() {
  pruneProtectedSelections();
  const ids = [...state.selectedIds];
  if (!ids.length) return;

  els.closeBtn.disabled = true;
  els.closeBtn.textContent = "关闭中...";
  playMeow();

  try {
    await closeTabsByIds(ids);
  } finally {
    els.closeBtn.textContent = "关闭选中";
  }
}

function expandAllGroups() {
  getVisibleGroupNames().forEach((groupName) => state.collapsedGroups.delete(groupName));
  playOpenSound();
  render();
}

function collapseAllGroups() {
  getVisibleGroupNames().forEach((groupName) => state.collapsedGroups.add(groupName));
  render();
}

function getVisibleGroupNames() {
  return groupTabs(getVisibleTabs()).map(([groupName]) => groupName);
}

async function closeTabs(tabs) {
  const ids = tabs.filter((tab) => !isProtected(tab)).map((tab) => tab.id);
  if (!ids.length) return;
  await closeTabsByIds(ids);
}

async function closeGroup(groupName, tabs) {
  const ids = tabs.filter((tab) => !isProtected(tab)).map((tab) => tab.id);
  if (!ids.length) return;

  state.closingGroups.add(groupName);
  playMeow();
  render();
  await wait(420);
  state.closingGroups.delete(groupName);
  await closeTabsByIds(ids);
}

async function closeTabsByIds(ids) {
  if (globalThis.chrome?.tabs) {
    await chrome.tabs.remove(ids);
  } else {
    const idSet = new Set(ids);
    state.tabs = state.tabs.filter((tab) => !idSet.has(tab.id));
  }
  ids.forEach((id) => state.selectedIds.delete(id));
  if (globalThis.chrome?.tabs) {
    await loadTabs();
  } else {
    removeMissingSelections();
    render();
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function playMeow() {
  const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AudioContext) return;

  const context = new AudioContext();
  const now = context.currentTime;
  const gain = context.createGain();
  const voice = context.createOscillator();
  const chirp = context.createOscillator();

  voice.type = "triangle";
  chirp.type = "sine";
  voice.frequency.setValueAtTime(720, now);
  voice.frequency.exponentialRampToValueAtTime(410, now + 0.18);
  voice.frequency.exponentialRampToValueAtTime(560, now + 0.32);
  chirp.frequency.setValueAtTime(1180, now + 0.04);
  chirp.frequency.exponentialRampToValueAtTime(740, now + 0.22);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.14, now + 0.035);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.36);

  voice.connect(gain);
  chirp.connect(gain);
  gain.connect(context.destination);
  voice.start(now);
  chirp.start(now + 0.04);
  voice.stop(now + 0.38);
  chirp.stop(now + 0.32);
  setTimeout(() => context.close(), 520);
}

function playOpenSound() {
  const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AudioContext) return;

  const context = new AudioContext();
  const now = context.currentTime;
  const gain = context.createGain();
  const blip = context.createOscillator();
  const sparkle = context.createOscillator();

  blip.type = "square";
  sparkle.type = "triangle";
  blip.frequency.setValueAtTime(520, now);
  blip.frequency.setValueAtTime(780, now + 0.07);
  sparkle.frequency.setValueAtTime(1040, now + 0.05);
  sparkle.frequency.setValueAtTime(1320, now + 0.13);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.09, now + 0.025);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);

  blip.connect(gain);
  sparkle.connect(gain);
  gain.connect(context.destination);
  blip.start(now);
  sparkle.start(now + 0.05);
  blip.stop(now + 0.2);
  sparkle.stop(now + 0.24);
  setTimeout(() => context.close(), 360);
}

let refreshTimer = 0;

function scheduleLoadTabs() {
  window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(loadTabs, 80);
}

function bindChromeTabEvents() {
  if (!globalThis.chrome?.tabs) return;

  chrome.tabs.onCreated.addListener(scheduleLoadTabs);
  chrome.tabs.onRemoved.addListener(scheduleLoadTabs);
  chrome.tabs.onActivated.addListener(scheduleLoadTabs);
  chrome.tabs.onMoved.addListener(scheduleLoadTabs);
  chrome.tabs.onAttached.addListener(scheduleLoadTabs);
  chrome.tabs.onDetached.addListener(scheduleLoadTabs);
  chrome.tabs.onReplaced?.addListener(scheduleLoadTabs);
  chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
    const shouldRefresh = ["audible", "favIconUrl", "pinned", "status", "title", "url"].some((key) => key in changeInfo);
    if (shouldRefresh) scheduleLoadTabs();
  });
}

els.searchInput.addEventListener("input", render);

els.refreshBtn.addEventListener("click", loadTabs);
els.expandAllBtn.addEventListener("click", expandAllGroups);
els.collapseAllBtn.addEventListener("click", collapseAllGroups);
els.closeBtn.addEventListener("click", closeSelected);

bindChromeTabEvents();
loadTabs();

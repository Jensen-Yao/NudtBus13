const EMAILJS\_CONFIG = {
  publicKey: "LO15atCFtgwf\_cNMb",
  serviceId: "service\_pfl0z5l",
  templateId: "template\_hfn70fr",
};

const STOP\_STORAGE\_KEY = "campus-link-stop-preference";
const ANALYTICS\_USER\_STORAGE\_KEY = "campus-link-user-id-v1";
const INSTALL\_PROMPT\_STORAGE\_KEY = "campus-link-install-prompt-dismissed-at-v5";
const INSTALL\_PROMPT\_VISIT\_COUNT\_STORAGE\_KEY = "campus-link-install-prompt-visit-count-v1";
const INSTALL\_PROMPT\_MIN\_VISITS = 2;
const INSTALL\_PROMPT\_SNOOZE\_MS = 7 \* 24 \* 60 \* 60 \* 1000;
const INSTALL\_PROMPT\_READY\_WAIT\_MS = 6500;
const HOLIDAY\_NOTICE\_START\_DATE = "2026-08-03";
const HOLIDAY\_NOTICE\_END\_EXCLUSIVE\_DATE = "2026-08-29";
const ANALYTICS\_ENDPOINT = window.CAMPUS\_LINK\_ANALYTICS\_ENDPOINT || "./api/analytics";
const ANALYTICS\_USER\_COOKIE\_NAME = "campus\_link\_user\_id\_v1";
const APP\_VERSION = "v29-holiday-notice";
const volatileStorage = new Map();
let refreshedByServiceWorker = false;
let analyticsMemoryUserId = "";
const rideChoiceEnabled = true;

const STOPS = {
  one: {
    id: "one",
    label: "ä¸€å·é™¢",
  },
  three: {
    id: "three",
    label: "ä¸‰å·é™¢",
  },
};

const COLLEGE\_SHUTTLE\_LABELS = \["æ°”æµ·ç­è½¦", "ç³»ç»Ÿç­è½¦", "ç†å­¦é™¢ç­è½¦", "ç©ºå¤©ç­è½¦"\];
const EXPRESS\_BADGE\_HTML = '<span class="express-label">ï¼ˆå¿«è½¦ï¼‰</span>';

const DAY\_PROFILES = {
  monThu: { key: "monThu", label: "å‘¨ä¸€è‡³å‘¨å››è¿è¡Œè¡¨" },
  friday: { key: "friday", label: "å‘¨äº”è¿è¡Œè¡¨" },
  saturday: { key: "saturday", label: "å‘¨å…­è¿è¡Œè¡¨" },
  sunday: { key: "sunday", label: "å‘¨æ—¥è¿è¡Œè¡¨" },
};

function createService(lineLabel, dayProfile, originStop, destinationStop, departures, note = "") {
  return {
    lineLabel,
    dayProfile,
    originStop,
    destinationStop,
    routeLabel: \`${STOPS\[originStop\].label} -> ${STOPS\[destinationStop\].label}\`,
    departures,
    note: note || getDefaultServiceNote(lineLabel, originStop),
  };
}

function getDefaultServiceNote(lineLabel, originStop) {
  if (lineLabel !== "8å·çº¿") {
    return "";
  }

  return originStop === "one" ? "ä¸»æ¥¼æ—å‘è½¦" : "ç³»ç»Ÿæ¥¼ä¸œä¾§å‘è½¦";
}

const SERVICES = \[\
  createService("8å·çº¿", "monThu", "one", "three", \[\
    "07:10", "07:20", "07:30", "09:20", "09:30", "11:25",\
    "13:50", "14:00", "15:30", "16:25", "18:55", "21:00",\
  \]),\
  createService("8å·çº¿", "monThu", "three", "one", \[\
    "07:50", "09:45", "10:00", "12:00", "12:35", "13:45",\
    "16:25", "17:05", "17:30", "17:40", "17:55", "18:25",\
    "21:00", "21:30", "21:35", "21:55", "22:15",\
  \]),\
  createService("8å·çº¿", "friday", "one", "three", \[\
    "07:10", "07:20", "07:30", "09:20", "09:30", "11:25",\
    "13:50", "14:00", "15:30", "16:25", "18:55", "21:00",\
  \]),\
  createService("8å·çº¿", "friday", "three", "one", \[\
    "07:50", "09:45", "10:00", "12:00", "12:35", "13:45",\
    "16:25", "17:05", "17:30", "17:40", "17:55", "18:25",\
    "21:00", "21:35", "21:55", "22:15",\
  \]),\
  createService("8å·çº¿", "saturday", "one", "three", \[\
    "07:20", "09:30", "11:25", "13:50", "15:30", "18:55",\
  \]),\
  createService("8å·çº¿", "saturday", "three", "one", \[\
    "07:50", "10:00", "12:00", "12:35", "16:25", "17:30",\
    "18:25", "21:35", "22:15",\
  \]),\
  createService("8å·çº¿", "sunday", "one", "three", \[\
    "07:20", "09:30", "13:50",\
  \]),\
  createService("8å·çº¿", "sunday", "three", "one", \[\
    "12:35", "17:30", "22:15",\
  \]),\
  createService("æ°”æµ·ç­è½¦", "weekday", "three", "one", \[\
    "07:30", "18:00", "20:30",\
  \], "æ°”æµ·å­¦é™¢æ¥¼åŒ—ä¾§å‘è½¦"),\
  createService("æ°”æµ·ç­è½¦", "weekday", "one", "three", \[\
    "08:30", "18:50", "21:10",\
  \], "æ°”æµ·å­¦é™¢æ¥¼å‰å‘è½¦"),\
  createService("ç³»ç»Ÿç­è½¦", "weekday", "one", "three", \[\
    "07:25", "14:00",\
  \], "è€ç³»ç»Ÿæ¥¼å‰å‘è½¦"),\
  createService("ç³»ç»Ÿç­è½¦", "weekday", "three", "one", \[\
    "12:05", "17:50", "21:00",\
  \], "ç³»ç»Ÿæ¥¼ä¸œä¾§å‘è½¦"),\
  createService("ç†å­¦é™¢ç­è½¦", "weekday", "one", "three", \[\
    "07:15", "20:55",\
  \], "ä¸»æ¥¼æ—å‘è½¦"),\
  createService("ç†å­¦é™¢ç­è½¦", "weekday", "three", "one", \[\
    "20:20",\
  \], "ç†å­¦é™¢å—ä¾§å‘è½¦"),\
  createService("ç©ºå¤©ç­è½¦", "weekday", "one", "three", \[\
    "07:25",\
  \], "ç©ºå¤©æ¥¼å‰å‘è½¦"),\
  createService("ç©ºå¤©ç­è½¦", "weekday", "three", "one", \[\
    "09:50",\
  \], "é«˜è¶…æ¥¼å‰å‘è½¦"),\
\];

const elements = {
  currentTime: document.getElementById("currentTime"),
  currentDate: document.getElementById("currentDate"),
  queryResultPanel: document.getElementById("queryResultPanel"),
  activeScheduleLabel: document.getElementById("activeScheduleLabel"),
  queryReferenceText: document.getElementById("queryReferenceText"),
  queryDateTime: document.getElementById("queryDateTime"),
  manualField: document.getElementById("manualField"),
  selectedStopLabel: document.getElementById("selectedStopLabel"),
  nextDayLabel: document.getElementById("nextDayLabel"),
  nextTime: document.getElementById("nextTime"),
  nextLineLabel: document.getElementById("nextLineLabel"),
  waitText: document.getElementById("waitText"),
  tripMeta: document.getElementById("tripMeta"),
  secondaryTrip: document.getElementById("secondaryTrip"),
  timeline: document.getElementById("timeline"),
  timelineNote: document.getElementById("timelineNote"),
  rideChoicePrompt: document.getElementById("rideChoicePrompt"),
  rideChoiceStatus: document.getElementById("rideChoiceStatus"),
  nextCard: document.getElementById("nextCard"),
  nextRideChoiceButton: document.getElementById("nextRideChoiceButton"),
  querySubmit: document.getElementById("querySubmit"),
  visitCounter: document.getElementById("visitCounter"),
  feedbackForm: document.getElementById("feedbackForm"),
  feedbackText: document.getElementById("feedbackText"),
  feedbackContact: document.getElementById("feedbackContact"),
  feedbackStatus: document.getElementById("feedbackStatus"),
  installDialog: document.getElementById("installDialog"),
  installDialogTitle: document.getElementById("installDialogTitle"),
  installDialogBody: document.getElementById("installDialogBody"),
  installSteps: document.getElementById("installSteps"),
  installPrimaryButton: document.getElementById("installPrimaryButton"),
  installSecondaryButton: document.getElementById("installSecondaryButton"),
  installCloseButton: document.getElementById("installCloseButton"),
  holidayNoticeDialog: document.getElementById("holidayNoticeDialog"),
  holidayNoticeConfirmButton: document.getElementById("holidayNoticeConfirmButton"),
  holidayNoticeCloseButton: document.getElementById("holidayNoticeCloseButton"),
  stopButtons: \[...document.querySelectorAll("\[data-stop\]")\],
  modeButtons: \[...document.querySelectorAll("\[data-query-mode\]")\],
};

const state = {
  selectedStop: readInitialStop(),
  queryMode: "now",
  lastQuery: null,
  installPromptEvent: null,
  installPromptMode: "confirm",
  installPromptWaitTimer: null,
};

elements.queryDateTime.value = formatDateTimeLocal(new Date());

initializeEmailJs();
render();
renderClock();
initializeEvents();
initializeHolidayNotice();
initializeServiceWorker();
initializeInstallPrompt();
initializeAnalytics();

setInterval(() => {
  renderClock();
  render();
}, 30 \* 1000);

function readInitialStop() {
  const params = new URLSearchParams(window.location.search);
  const paramStop = params.get("stop");

  if (paramStop && STOPS\[paramStop\]) {
    return paramStop;
  }

  const storedStop = readLocalStorageValue(STOP\_STORAGE\_KEY);
  return STOPS\[storedStop\] ? storedStop : "one";
}

function initializeEvents() {
  elements.modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const nextMode = button.dataset.queryMode;
      if (state.queryMode === nextMode) {
        return;
      }

      state.queryMode = nextMode;
      setPendingQueryStatus();
      render();
    });
  });

  elements.stopButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const nextStop = button.dataset.stop;
      if (state.selectedStop === nextStop) {
        return;
      }

      state.selectedStop = nextStop;
      writeLocalStorageValue(STOP\_STORAGE\_KEY, state.selectedStop);
      setPendingQueryStatus();
      render();
    });
  });

  const handleDraftQueryTimeChange = () => {
    setPendingQueryStatus();
    render();
  };
  elements.queryDateTime.addEventListener("input", handleDraftQueryTimeChange);
  elements.queryDateTime.addEventListener("change", handleDraftQueryTimeChange);
  elements.querySubmit.addEventListener("click", handleQuerySubmit);
  elements.nextRideChoiceButton.addEventListener("click", handleRideChoiceClick);
  elements.timeline.addEventListener("click", handleRideChoiceClick);
  elements.feedbackForm.addEventListener("submit", handleFeedbackSubmit);
}

function initializeEmailJs() {
  if (!window.emailjs) {
    return;
  }

  if (!EMAILJS\_CONFIG.publicKey || EMAILJS\_CONFIG.publicKey === "YOUR\_EMAILJS\_PUBLIC\_KEY") {
    return;
  }

  window.emailjs.init({
    publicKey: EMAILJS\_CONFIG.publicKey,
  });
}

function isEmailJsConfigured() {
  return window.emailjs
    && EMAILJS\_CONFIG.publicKey !== "YOUR\_EMAILJS\_PUBLIC\_KEY"
    && EMAILJS\_CONFIG.serviceId !== "YOUR\_EMAILJS\_SERVICE\_ID"
    && EMAILJS\_CONFIG.templateId !== "YOUR\_EMAILJS\_TEMPLATE\_ID";
}

function initializeServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  if (!\["http:", "https:"\].includes(window.location.protocol)) {
    return;
  }

  const hadController = Boolean(navigator.serviceWorker.controller);

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || refreshedByServiceWorker) {
      return;
    }

    refreshedByServiceWorker = true;
    window.location.reload();
  });

  navigator.serviceWorker.register("./sw.js")
    .then((registration) => registration.update().catch(() => {}))
    .catch(() => {});
}

function initializeHolidayNotice() {
  if (!elements.holidayNoticeDialog || !isWithinHolidayNoticeWindow()) {
    return;
  }

  const closeNotice = () => {
    elements.holidayNoticeDialog.hidden = true;
  };

  elements.holidayNoticeConfirmButton.addEventListener("click", closeNotice);
  elements.holidayNoticeCloseButton.addEventListener("click", closeNotice);
  elements.holidayNoticeDialog.addEventListener("click", (event) => {
    if (event.target === elements.holidayNoticeDialog) {
      closeNotice();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !elements.holidayNoticeDialog.hidden) {
      closeNotice();
    }
  });

  window.setTimeout(() => {
    elements.holidayNoticeDialog.hidden = false;
    elements.holidayNoticeConfirmButton.focus();
  }, 0);
}

function isWithinHolidayNoticeWindow(date = new Date()) {
  const start = parseLocalDate(HOLIDAY\_NOTICE\_START\_DATE);
  const endExclusive = parseLocalDate(HOLIDAY\_NOTICE\_END\_EXCLUSIVE\_DATE);
  return date >= start && date < endExclusive;
}

function parseLocalDate(dateString) {
  const \[year, month, day\] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function initializeInstallPrompt() {
  if (!elements.installDialog) {
    return;
  }

  if (isStandaloneMode()) {
    return;
  }

  recordInstallPromptVisit();

  elements.installPrimaryButton.addEventListener("click", handleInstallPrimaryClick);
  elements.installSecondaryButton.addEventListener("click", () => hideInstallPrompt(true));
  elements.installCloseButton.addEventListener("click", () => hideInstallPrompt(true));
  elements.installDialog.addEventListener("click", (event) => {
    if (event.target === elements.installDialog) {
      hideInstallPrompt(true);
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !elements.installDialog.hidden) {
      hideInstallPrompt(true);
    }
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.installPromptEvent = event;

    if (state.installPromptMode === "waiting" && !elements.installDialog.hidden) {
      presentNativeInstallPrompt();
      return;
    }

    if (shouldShowInstallPrompt() && !elements.installDialog.hidden && !hasOpenHolidayNotice()) {
      showInstallPrompt("native");
    }
  });

  window.addEventListener("appinstalled", () => {
    state.installPromptEvent = null;
    clearInstallPromptWaitTimer();
    hideInstallPrompt(false);
  });

  window.setTimeout(() => {
    if (!shouldShowInstallPrompt() || !hasInstallPromptVisitThreshold() || isStandaloneMode() || !elements.installDialog.hidden || hasOpenHolidayNotice()) {
      return;
    }

    showInstallPrompt(getInitialInstallPromptMode());
  }, 0);
}

function hasOpenHolidayNotice() {
  return Boolean(elements.holidayNoticeDialog && !elements.holidayNoticeDialog.hidden);
}

function isStandaloneMode() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function isIosLikeBrowser() {
  const userAgent = window.navigator.userAgent || "";
  const isTouchMac = window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1;
  return /iphone|ipad|ipod/i.test(userAgent) || isTouchMac;
}

function isAndroidEdge() {
  return /android/i.test(window.navigator.userAgent || "") && /edga\\//i.test(window.navigator.userAgent || "");
}

function isDesktopEdge() {
  const userAgent = window.navigator.userAgent || "";
  return /edg\\//i.test(userAgent) && !isIosLikeBrowser() && !/android/i.test(userAgent);
}

function getInitialInstallPromptMode() {
  if (state.installPromptEvent) {
    return "native";
  }

  return "confirm";
}

function recordInstallPromptVisit() {
  const visitCount = Number(readLocalStorageValue(INSTALL\_PROMPT\_VISIT\_COUNT\_STORAGE\_KEY));
  const nextVisitCount = Number.isFinite(visitCount) ? visitCount + 1 : 1;
  writeLocalStorageValue(INSTALL\_PROMPT\_VISIT\_COUNT\_STORAGE\_KEY, String(nextVisitCount));
}

function hasInstallPromptVisitThreshold() {
  const visitCount = Number(readLocalStorageValue(INSTALL\_PROMPT\_VISIT\_COUNT\_STORAGE\_KEY));
  return Number.isFinite(visitCount) && visitCount >= INSTALL\_PROMPT\_MIN\_VISITS;
}

function shouldShowInstallPrompt() {
  const dismissedAt = Number(readLocalStorageValue(INSTALL\_PROMPT\_STORAGE\_KEY));
  return !Number.isFinite(dismissedAt) || Date.now() - dismissedAt > INSTALL\_PROMPT\_SNOOZE\_MS;
}

function rememberInstallPromptDismissal() {
  writeLocalStorageValue(INSTALL\_PROMPT\_STORAGE\_KEY, String(Date.now()));
}

function showInstallPrompt(mode) {
  state.installPromptMode = mode;

  const isManual = mode === "manual";
  const isWaiting = mode === "waiting";
  const canUseNativePrompt = mode === "native" && state.installPromptEvent;

  elements.installDialogTitle.textContent = getInstallPromptTitle(mode);
  elements.installDialogBody.textContent = getInstallPromptMessage(mode);
  elements.installSteps.hidden = !isManual;
  renderInstallSteps(isManual ? getManualInstallSteps() : \[\]);
  elements.installPrimaryButton.textContent = getInstallPromptPrimaryText(mode);
  elements.installSecondaryButton.textContent = isWaiting ? "å–æ¶ˆ" : "æš‚ä¸æ·»åŠ ";
  elements.installPrimaryButton.classList.toggle("is-wide", isManual);
  elements.installSecondaryButton.hidden = isManual;
  elements.installPrimaryButton.disabled = isWaiting;
  elements.installPrimaryButton.setAttribute("aria-busy", isWaiting ? "true" : "false");

  if (canUseNativePrompt) {
    elements.installDialogBody.textContent = "æ˜¯å¦æŠŠã€ŒåŽ»ä¸‰å·é™¢ä¸Šç­ã€æ·»åŠ åˆ°æ¡Œé¢ï¼Ÿç‚¹å‡»æ·»åŠ åŽï¼Œæ‰‹æœºä¼šå¼¹å‡ºç³»ç»Ÿå®‰è£…ç¡®è®¤ã€‚";
  }

  elements.installDialog.hidden = false;
  (isWaiting ? elements.installSecondaryButton : elements.installPrimaryButton).focus();
}

function getInstallPromptTitle(mode) {
  if (mode === "waiting") {
    return "æ­£åœ¨å‡†å¤‡å®‰è£…æç¤º...";
  }

  if (mode === "manual") {
    return "æ— æ³•è‡ªåŠ¨æ·»åŠ ";
  }

  return "æ·»åŠ åˆ°æ¡Œé¢ï¼Ÿ";
}

function getInstallPromptMessage(mode) {
  if (mode === "waiting") {
    return "è¯·ç¨ç­‰ï¼Œæµè§ˆå™¨æ­£åœ¨å‡†å¤‡ç³»ç»Ÿå®‰è£…ç¡®è®¤æ¡†ã€‚å‡†å¤‡å¥½åŽä¼šè‡ªåŠ¨æ‰“å¼€ã€‚";
  }

  if (mode === "manual") {
    return getManualInstallMessage();
  }

  return "æ˜¯å¦æŠŠã€ŒåŽ»ä¸‰å·é™¢ä¸Šç­ã€æ·»åŠ åˆ°æ¡Œé¢ï¼Ÿç‚¹å‡»æ·»åŠ åŽï¼Œå¦‚æžœæ‰‹æœºå®‰è£…æç¤ºè¿˜æ²¡å‡†å¤‡å¥½ï¼Œä¼šå…ˆç­‰å¾…å‡ ç§’ã€‚";
}

function getInstallPromptPrimaryText(mode) {
  if (mode === "manual") {
    return "çŸ¥é“äº†";
  }

  if (mode === "waiting") {
    return "å‡†å¤‡ä¸­...";
  }

  return "æ·»åŠ ";
}

function getManualInstallMessage() {
  if (isIosLikeBrowser()) {
    return "åœ¨æµè§ˆå™¨åˆ†äº«èœå•é‡Œé€‰æ‹©â€œæ·»åŠ åˆ°æ¡Œé¢â€ï¼Œå³å¯æŠŠè¿™ä¸ªå°å·¥å…·æ”¾åˆ°æ¡Œé¢ã€‚";
  }

  if (isAndroidEdge()) {
    return "Edge å®‰å“ç‰ˆå¯èƒ½ä¸ä¼šç¨³å®šå¼¹å‡ºç³»ç»Ÿå®‰è£…æ¡†ã€‚è¯·é€šè¿‡æµè§ˆå™¨èœå•æ·»åŠ ï¼›å¦‚æžœåªå‡ºçŽ°â€œåˆ›å»ºå¿«æ·æ–¹å¼â€ï¼Œç¡®è®¤åŽä¹Ÿä¼šåœ¨æ¡Œé¢ç”Ÿæˆå…¥å£ã€‚";
  }

  if (isDesktopEdge()) {
    return "Edge æ¡Œé¢ç‰ˆå¯é€šè¿‡åœ°å€æ å³ä¾§çš„åº”ç”¨å›¾æ ‡å®‰è£…ï¼›å¦‚æžœæ²¡æœ‰çœ‹åˆ°å›¾æ ‡ï¼Œè¯·åœ¨æµè§ˆå™¨èœå•é‡Œé€‰æ‹©â€œåº”ç”¨â€å¹¶å®‰è£…æ­¤ç«™ç‚¹ã€‚";
  }

  return "å¦‚æžœæµè§ˆå™¨æ²¡æœ‰å¼¹å‡ºå®‰è£…ç¡®è®¤ï¼Œè¯·åœ¨åœ°å€æ æˆ–æµè§ˆå™¨èœå•é‡Œé€‰æ‹©â€œå®‰è£…åº”ç”¨â€æˆ–â€œæ·»åŠ åˆ°æ¡Œé¢â€ã€‚";
}

function getManualInstallSteps() {
  if (isIosLikeBrowser()) {
    return \[\
      "æ‰“å¼€æµè§ˆå™¨åˆ†äº«èœå•ã€‚",\
      "é€‰æ‹©â€œæ·»åŠ åˆ°æ¡Œé¢â€ã€‚",\
      "ç¡®è®¤åç§°åŽç‚¹å‡»â€œæ·»åŠ â€ã€‚",\
    \];
  }

  if (isAndroidEdge()) {
    return \[\
      "ç‚¹å‡» Edge æµè§ˆå™¨èœå•æŒ‰é’®ã€‚",\
      "é€‰æ‹©â€œæ·»åŠ åˆ°æ‰‹æœºâ€æˆ–â€œæ·»åŠ åˆ°æ¡Œé¢â€ã€‚",\
      "å¦‚æžœå‡ºçŽ°â€œåˆ›å»ºå¿«æ·æ–¹å¼â€ï¼Œç¡®è®¤åŽä¼šåœ¨æ¡Œé¢ç”Ÿæˆå…¥å£ã€‚",\
    \];
  }

  if (isDesktopEdge()) {
    return \[\
      "ç‚¹å‡»åœ°å€æ å³ä¾§çš„åº”ç”¨å›¾æ ‡ï¼Œæˆ–æ‰“å¼€ Edge èœå•ã€‚",\
      "é€‰æ‹©â€œåº”ç”¨â€æˆ–â€œæ›´å¤šå·¥å…·â€é‡Œçš„â€œå®‰è£…æ­¤ç«™ç‚¹ä¸ºåº”ç”¨â€ã€‚",\
      "å®‰è£…åŽå¯åœ¨ edge://apps é‡Œåˆ›å»ºæ¡Œé¢å¿«æ·æ–¹å¼ã€‚",\
    \];
  }

  return \[\
    "æ‰“å¼€æµè§ˆå™¨åˆ†äº«æˆ–èœå•æŒ‰é’®ã€‚",\
    "é€‰æ‹©â€œå®‰è£…åº”ç”¨â€æˆ–â€œæ·»åŠ åˆ°æ¡Œé¢â€ã€‚",\
    "ç¡®è®¤åç§°åŽç‚¹å‡»â€œæ·»åŠ â€ã€‚",\
  \];
}

function renderInstallSteps(steps) {
  elements.installSteps.replaceChildren(...steps.map((step) => {
    const item = document.createElement("li");
    item.textContent = step;
    return item;
  }));
}

function hideInstallPrompt(rememberDismissal) {
  clearInstallPromptWaitTimer();
  elements.installDialog.hidden = true;
  elements.installPrimaryButton.disabled = false;
  elements.installPrimaryButton.setAttribute("aria-busy", "false");

  if (rememberDismissal) {
    rememberInstallPromptDismissal();
  }
}

async function handleInstallPrimaryClick() {
  if (state.installPromptMode === "manual") {
    hideInstallPrompt(true);
    return;
  }

  if (!state.installPromptEvent) {
    waitForNativeInstallPrompt();
    return;
  }

  await presentNativeInstallPrompt();
}

function waitForNativeInstallPrompt() {
  clearInstallPromptWaitTimer();
  showInstallPrompt("waiting");

  state.installPromptWaitTimer = window.setTimeout(() => {
    state.installPromptWaitTimer = null;

    if (state.installPromptMode === "waiting" && !elements.installDialog.hidden) {
      showInstallPrompt("manual");
    }
  }, INSTALL\_PROMPT\_READY\_WAIT\_MS);
}

function clearInstallPromptWaitTimer() {
  if (!state.installPromptWaitTimer) {
    return;
  }

  window.clearTimeout(state.installPromptWaitTimer);
  state.installPromptWaitTimer = null;
}

async function presentNativeInstallPrompt() {
  const installPromptEvent = state.installPromptEvent;
  if (!installPromptEvent) {
    waitForNativeInstallPrompt();
    return;
  }

  clearInstallPromptWaitTimer();
  state.installPromptMode = "native";
  elements.installPrimaryButton.disabled = true;
  elements.installPrimaryButton.setAttribute("aria-busy", "true");
  elements.installPrimaryButton.textContent = "æ‰“å¼€ä¸­...";

  try {
    await installPromptEvent.prompt();
    state.installPromptEvent = null;
    const choice = await installPromptEvent.userChoice;
    hideInstallPrompt(choice?.outcome !== "accepted");
  } catch (error) {
    state.installPromptEvent = null;
    showInstallPrompt("manual");
  }
}

function initializeAnalytics() {
  elements.visitCounter.hidden = false;
  elements.visitCounter.textContent = APP\_VERSION;

  trackAnalytics("visit", {
    path: window.location.pathname,
    localDateTime: formatDateTimeLocal(new Date()),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
  })
    .then((payload) => {
      if (Number.isFinite(payload.visitCount)) {
        elements.visitCounter.textContent = \`ç´¯è®¡è®¿é—®é‡ï¼š${payload.visitCount} Â· ${APP\_VERSION}\`;
        elements.visitCounter.hidden = false;
        return;
      }

      elements.visitCounter.textContent = APP\_VERSION;
      elements.visitCounter.hidden = false;
    })
    .catch(() => {
      elements.visitCounter.textContent = APP\_VERSION;
      elements.visitCounter.hidden = false;
    });
}

function readLocalStorageValue(key) {
  if (volatileStorage.has(key)) {
    return volatileStorage.get(key);
  }

  const storage = getStorage("localStorage");
  if (!storage) {
    return "";
  }

  try {
    const value = storage.getItem(key) || "";
    if (value) {
      volatileStorage.set(key, value);
    }
    return value;
  } catch (error) {
    return "";
  }
}

function writeLocalStorageValue(key, value) {
  volatileStorage.set(key, value);

  const storage = getStorage("localStorage");
  if (!storage) {
    return false;
  }

  try {
    storage.setItem(key, value);
    return true;
  } catch (error) {
    return false;
  }
}

function getStorage(name) {
  try {
    return window\[name\] || null;
  } catch (error) {
    return null;
  }
}

function readCookieValue(name) {
  try {
    const encodedName = \`${encodeURIComponent(name)}=\`;
    const item = document.cookie
      .split("; ")
      .find((cookie) => cookie.startsWith(encodedName));
    return item ? decodeURIComponent(item.slice(encodedName.length)) : "";
  } catch (error) {
    return "";
  }
}

function writeCookieValue(name, value, maxAgeSeconds) {
  try {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = \[\
      \`${encodeURIComponent(name)}=${encodeURIComponent(value)}\`,\
      \`Max-Age=${maxAgeSeconds}\`,\
      "Path=/",\
      "SameSite=Lax",\
    \].join("; ") + secure;
    return true;
  } catch (error) {
    return false;
  }
}

function getAnalyticsUserId() {
  const storedUserId = readLocalStorageValue(ANALYTICS\_USER\_STORAGE\_KEY)
    || readCookieValue(ANALYTICS\_USER\_COOKIE\_NAME)
    || analyticsMemoryUserId;
  if (isAnalyticsUserId(storedUserId)) {
    rememberAnalyticsUserId(storedUserId);
    return storedUserId;
  }

  const randomPart = window.crypto?.randomUUID
    ? window.crypto.randomUUID()
    : \`${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}\`;
  const nextUserId = \`u-${randomPart}\`.slice(0, 80);
  rememberAnalyticsUserId(nextUserId);
  return nextUserId;
}

function isAnalyticsUserId(value) {
  return /^\[A-Za-z0-9\_-\]{6,80}$/.test(value || "");
}

function rememberAnalyticsUserId(userId) {
  analyticsMemoryUserId = userId;
  writeLocalStorageValue(ANALYTICS\_USER\_STORAGE\_KEY, userId);
  writeCookieValue(ANALYTICS\_USER\_COOKIE\_NAME, userId, 365 \* 24 \* 60 \* 60);
}

function getClientContext() {
  return {
    deviceType: getDeviceType(),
    browserType: getBrowserType(),
    osType: getOsType(),
    accessMode: getAccessMode(),
  };
}

function getDeviceType() {
  const userAgent = window.navigator.userAgent || "";
  const userAgentData = window.navigator.userAgentData;

  if (/ipad|tablet/i.test(userAgent) || (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1)) {
    return "tablet";
  }
  if (userAgentData?.mobile || /mobile|iphone|ipod|android.\*mobile/i.test(userAgent)) {
    return "mobile";
  }
  if (/android/i.test(userAgent)) {
    return "tablet";
  }
  return "desktop";
}

function getBrowserType() {
  const userAgent = window.navigator.userAgent || "";
  const brands = window.navigator.userAgentData?.brands || \[\];
  const brandNames = brands.map((brand) => brand.brand).join(" ");

  if (/micromessenger/i.test(userAgent)) {
    return "WeChat";
  }
  if (/edg(?:a|ios)?\\//i.test(userAgent) || /Microsoft Edge/i.test(brandNames)) {
    return "Edge";
  }
  if (/firefox|fxios/i.test(userAgent)) {
    return "Firefox";
  }
  if (/crios|chrome|chromium/i.test(userAgent) || /Google Chrome|Chromium/i.test(brandNames)) {
    return "Chrome";
  }
  if (/safari/i.test(userAgent)) {
    return "Safari";
  }
  return "unknown";
}

function getOsType() {
  const userAgent = window.navigator.userAgent || "";
  const platform = window.navigator.userAgentData?.platform || window.navigator.platform || "";

  if (/iphone|ipad|ipod/i.test(userAgent) || (platform === "MacIntel" && window.navigator.maxTouchPoints > 1)) {
    return "iOS";
  }
  if (/android/i.test(userAgent) || /Android/i.test(platform)) {
    return "Android";
  }
  if (/win/i.test(platform) || /windows/i.test(userAgent)) {
    return "Windows";
  }
  if (/mac/i.test(platform) || /mac os/i.test(userAgent)) {
    return "macOS";
  }
  if (/linux/i.test(platform) || /linux/i.test(userAgent)) {
    return "Linux";
  }
  return "unknown";
}

function getAccessMode() {
  if (window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true) {
    return "pwa";
  }
  if (window.matchMedia("(display-mode: fullscreen)").matches) {
    return "fullscreen";
  }
  if (window.matchMedia("(display-mode: minimal-ui)").matches) {
    return "minimal-ui";
  }
  return "browser";
}

async function handleQuerySubmit(event) {
  event.preventDefault();

  const queryDate = getDraftQueryDate();
  const trips = getUpcomingTrips(queryDate, state.selectedStop, 6);
  const queryId = createAnalyticsEventId("q");
  elements.queryDateTime.value = formatDateTimeLocal(queryDate);
  state.lastQuery = {
    date: queryDate,
    mode: state.queryMode,
    stopId: state.selectedStop,
    queryId,
    trips,
    selectedRideChoiceIndex: null,
    pendingRideChoiceIndex: null,
    rideChoiceStatus: "",
  };
  writeLocalStorageValue(STOP\_STORAGE\_KEY, state.selectedStop);
  render();

  const nextTrip = trips\[0\] || null;
  trackAnalytics("demand", buildDemandPayload(queryId, queryDate, state.selectedStop, nextTrip)).catch(() => {});

  window.requestAnimationFrame(() => {
    elements.queryResultPanel.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    });
  });
}

async function handleRideChoiceClick(event) {
  const button = event.target.closest("\[data-ride-choice-index\]");
  if (!button || !state.lastQuery || state.lastQuery.pendingRideChoiceIndex !== null) {
    return;
  }

  const choiceIndex = Number.parseInt(button.dataset.rideChoiceIndex, 10);
  const query = state.lastQuery;
  const selectedTrip = query.trips\[choiceIndex\];
  if (!selectedTrip) {
    return;
  }

  if (query.selectedRideChoiceIndex === choiceIndex) {
    query.rideChoiceStatus = "saved";
    render();
    return;
  }

  query.pendingRideChoiceIndex = choiceIndex;
  query.rideChoiceStatus = "saving";
  render();

  try {
    await trackAnalytics("ride\_choice", buildRideChoicePayload(query, selectedTrip));
    query.selectedRideChoiceIndex = choiceIndex;
    query.rideChoiceStatus = "saved";
  } catch (error) {
    query.rideChoiceStatus = "error";
  } finally {
    query.pendingRideChoiceIndex = null;
    if (state.lastQuery === query) {
      render();
    }
  }
}

async function handleFeedbackSubmit(event) {
  event.preventDefault();

  const text = elements.feedbackText.value.trim();
  const contact = elements.feedbackContact.value.trim();
  const contactText = contact || "æœªå¡«å†™";
  const messageWithContact = contact
    ? \`${text}\\n\\nè”ç³»æ–¹å¼ï¼š${contact}\`
    : \`${text}\\n\\nè”ç³»æ–¹å¼ï¼šæœªå¡«å†™\`;

  if (!text) {
    elements.feedbackStatus.textContent = "å…ˆå¡«å†™ä¸€ç‚¹æ„è§å†æäº¤ã€‚";
    return;
  }

  if (!isEmailJsConfigured()) {
    elements.feedbackStatus.textContent = "æ„è§æäº¤æš‚ä¸å¯ç”¨ï¼Œè¯·ç¨åŽå†è¯•ã€‚";
    return;
  }

  elements.feedbackStatus.textContent = "å‘é€ä¸­...";

  try {
    await window.emailjs.send(EMAILJS\_CONFIG.serviceId, EMAILJS\_CONFIG.templateId, {
      message: messageWithContact,
      contact: contactText,
      user\_contact: contactText,
      reply\_to: contact,
      submitted\_at: formatDateTimeLabel(new Date()),
      page\_url: window.location.href,
      selected\_stop: STOPS\[state.selectedStop\].label,
      query\_mode: state.queryMode === "manual" ? "æ‰‹åŠ¨æ—¶é—´" : "çŽ°åœ¨å‡ºå‘",
      query\_time: elements.queryReferenceText.textContent,
    });

    elements.feedbackText.value = "";
    elements.feedbackContact.value = "";
    elements.feedbackStatus.textContent = "å·²ç»æäº¤æ„è§ã€‚";
  } catch (error) {
    elements.feedbackStatus.textContent = "æ„è§æäº¤å¤±è´¥ï¼ŒEmailJS æœåŠ¡æš‚æ—¶ä¸å¯ç”¨ã€‚";
  }
}

function buildDemandPayload(queryId, queryDate, stopId, nextTrip) {
  const destinationStop = nextTrip?.destinationStop || (stopId === "one" ? "three" : "one");

  return {
    queryId,
    originStop: stopId,
    originLabel: STOPS\[stopId\].label,
    destinationStop,
    destinationLabel: STOPS\[destinationStop\].label,
    queryDateTime: queryDate.toISOString(),
    queryDateTimeLocal: formatDateTimeLocal(queryDate),
    dayProfile: resolveDayProfile(queryDate).key,
    matchedTrip: nextTrip ? {
      lineLabel: nextTrip.lineLabel,
      departureTime: nextTrip.departureTime,
      boardingDateTime: nextTrip.boardingDate.toISOString(),
      boardingDateTimeLocal: formatDateTimeLocal(nextTrip.boardingDate),
      note: nextTrip.note,
    } : null,
  };
}

function buildRideChoicePayload(query, selectedTrip) {
  return {
    queryId: query.queryId,
    originStop: query.stopId,
    originLabel: STOPS\[query.stopId\].label,
    destinationStop: selectedTrip.destinationStop,
    destinationLabel: STOPS\[selectedTrip.destinationStop\].label,
    queryDateTime: query.date.toISOString(),
    queryDateTimeLocal: formatDateTimeLocal(query.date),
    selectedTrip: {
      lineLabel: selectedTrip.lineLabel,
      departureTime: selectedTrip.departureTime,
      boardingDateTime: selectedTrip.boardingDate.toISOString(),
      boardingDateTimeLocal: formatDateTimeLocal(selectedTrip.boardingDate),
      waitMinutes: Math.max(0, Math.round((selectedTrip.boardingDate - query.date) / 60000)),
      note: selectedTrip.note,
    },
  };
}

function createAnalyticsEventId(prefix) {
  const randomPart = window.crypto?.randomUUID
    ? window.crypto.randomUUID()
    : \`${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}\`;
  return \`${prefix}-${randomPart}\`.slice(0, 100);
}

async function trackAnalytics(type, payload) {
  if (!ANALYTICS\_ENDPOINT) {
    throw new Error("Analytics endpoint is not configured");
  }

  const eventDate = new Date();
  const enrichedPayload = {
    ...payload,
    userId: getAnalyticsUserId(),
    eventLocalDateTime: formatDateTimeLocal(eventDate),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    ...getClientContext(),
  };

  const response = await fetch(ANALYTICS\_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ type, payload: enrichedPayload }),
    cache: "no-store",
    keepalive: type === "visit",
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.ok === false) {
    throw new Error(data.error || \`Analytics HTTP ${response.status}\`);
  }

  return data;
}

function resolveDayProfile(date) {
  const day = date.getDay();

  if (day === 0) {
    return DAY\_PROFILES.sunday;
  }
  if (day === 6) {
    return DAY\_PROFILES.saturday;
  }
  if (day === 5) {
    return DAY\_PROFILES.friday;
  }
  return DAY\_PROFILES.monThu;
}

function isWeekday(date) {
  const day = date.getDay();
  return day >= 1 && day <= 5;
}

function getServicesForDate(date, stopId) {
  const profile = resolveDayProfile(date);

  return SERVICES
    .filter((service) => service.originStop === stopId)
    .filter((service) => service.dayProfile === profile.key || (service.dayProfile === "weekday" && isWeekday(date)));
}

function buildDateAtTime(date, hhmm) {
  const \[hours, minutes\] = hhmm.split(":").map(Number);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes, 0, 0);
}

function addDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, date.getHours(), date.getMinutes(), 0, 0);
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function differenceInCalendarDays(later, earlier) {
  return Math.round((startOfDay(later) - startOfDay(earlier)) / (24 \* 60 \* 60 \* 1000));
}

function buildTrip(service, departure, date) {
  return {
    lineLabel: service.lineLabel,
    originStop: service.originStop,
    destinationStop: service.destinationStop,
    routeLabel: service.routeLabel,
    departureTime: departure,
    boardingDate: buildDateAtTime(date, departure),
    note: service.note,
  };
}

function buildTripsForDate(date, stopId) {
  return getServicesForDate(date, stopId)
    .flatMap((service) => service.departures.map((departure) => buildTrip(service, departure, date)))
    .sort((left, right) => left.boardingDate - right.boardingDate || left.lineLabel.localeCompare(right.lineLabel, "zh-CN"));
}

function getUpcomingTrips(queryDate, stopId, count = 6, horizonDays = 14) {
  const trips = \[\];
  const firstDay = startOfDay(queryDate);

  for (let offset = 0; offset < horizonDays; offset += 1) {
    trips.push(...buildTripsForDate(addDays(firstDay, offset), stopId));
  }

  return trips
    .filter((trip) => trip.boardingDate >= queryDate)
    .sort((left, right) => left.boardingDate - right.boardingDate || left.lineLabel.localeCompare(right.lineLabel, "zh-CN"))
    .slice(0, count);
}

function getDraftQueryDate() {
  if (state.queryMode === "manual") {
    return parseDateTimeLocal(elements.queryDateTime.value) || new Date();
  }
  return new Date();
}

function parseDateTimeLocal(value) {
  if (!value) {
    return null;
  }

  const \[datePart, timePart\] = value.split("T");
  if (!datePart || !timePart) {
    return null;
  }

  const \[year, month, day\] = datePart.split("-").map(Number);
  const \[hours, minutes\] = timePart.split(":").map(Number);

  if (\[year, month, day, hours, minutes\].some((part) => Number.isNaN(part))) {
    return null;
  }

  return new Date(year, month - 1, day, hours, minutes, 0, 0);
}

function formatTime(date) {
  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateLabel(date) {
  return date.toLocaleDateString("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  });
}

function formatDateTimeLabel(date) {
  return \`${formatDateLabel(date)} ${formatTime(date)}\`;
}

function formatShortDateTime(date) {
  return \`${date.toLocaleDateString("zh-CN", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
  })} ${formatTime(date)}\`;
}

function isCollegeShuttle(trip) {
  return COLLEGE\_SHUTTLE\_LABELS.includes(trip.lineLabel);
}

function formatTripTime(date, trip) {
  return \`${formatTime(date)}${isCollegeShuttle(trip) ? EXPRESS\_BADGE\_HTML : ""}\`;
}

function formatTripShortDateTime(date, trip) {
  return \`${formatShortDateTime(date)}${isCollegeShuttle(trip) ? EXPRESS\_BADGE\_HTML : ""}\`;
}

function formatDateTimeLocal(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return \`${year}-${month}-${day}T${hours}:${minutes}\`;
}

function getReferenceDayLabel(date, referenceDate) {
  const dayDiff = differenceInCalendarDays(date, referenceDate);
  if (dayDiff === 0) {
    return "ä»Šå¤©";
  }
  if (dayDiff === 1) {
    return "æ˜Žå¤©";
  }
  if (dayDiff === 2) {
    return "åŽå¤©";
  }

  return date.toLocaleDateString("zh-CN", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
  });
}

function describeWait(fromDate, toDate) {
  const waitMinutes = Math.max(0, Math.round((toDate - fromDate) / (60 \* 1000)));
  if (waitMinutes === 0) {
    return "å°±æ˜¯çŽ°åœ¨";
  }

  const days = Math.floor(waitMinutes / 1440);
  const hours = Math.floor((waitMinutes % 1440) / 60);
  const minutes = waitMinutes % 60;
  const parts = \[\];

  if (days > 0) {
    parts.push(\`${days} å¤©\`);
  }
  if (hours > 0) {
    parts.push(\`${hours} å°æ—¶\`);
  }
  if (minutes > 0) {
    parts.push(\`${minutes} åˆ†é’Ÿ\`);
  }

  return \`${parts.join(" ")}åŽ\`;
}

function renderClock() {
  const now = new Date();
  elements.currentTime.textContent = formatTime(now);
  elements.currentDate.textContent = formatDateLabel(now);
}

function render() {
  const draftQueryDate = getDraftQueryDate();
  const queryControlsMatchResult = controlsMatchLastQuery();
  const referenceDate = queryControlsMatchResult ? state.lastQuery.date : draftQueryDate;
  const profile = resolveDayProfile(referenceDate);

  renderQueryControls(draftQueryDate, profile, queryControlsMatchResult);
  renderToggle();

  if (!queryControlsMatchResult) {
    renderEmptyResult();
    return;
  }

  renderMainTrip(state.lastQuery.date, state.lastQuery.stopId);
  renderRideChoiceGuidance();
  renderTimeline(state.lastQuery.date, state.lastQuery.stopId);
}

function renderQueryControls(queryDate, profile, queryControlsMatchResult) {
  const isManual = state.queryMode === "manual";

  elements.modeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.queryMode === state.queryMode);
  });

  elements.manualField.classList.toggle("is-hidden", !isManual);
  elements.queryDateTime.disabled = !isManual;
  elements.activeScheduleLabel.textContent = profile.label;
  elements.queryReferenceText.textContent = queryControlsMatchResult
    ? \`æŸ¥è¯¢çš„å‡ºå‘æ—¶é—´ï¼š${formatDateTimeLabel(state.lastQuery.date)}\`
    : \`å¾…æŸ¥è¯¢ Â· ${isManual ? formatDateTimeLabel(queryDate) : \`çŽ°åœ¨ Â· ${formatDateTimeLabel(queryDate)}\`}\`;
}

function controlsMatchLastQuery() {
  if (!state.lastQuery) {
    return false;
  }

  if (state.selectedStop !== state.lastQuery.stopId || state.queryMode !== state.lastQuery.mode) {
    return false;
  }

  if (state.queryMode === "manual") {
    return elements.queryDateTime.value === formatDateTimeLocal(state.lastQuery.date);
  }

  return true;
}

function renderToggle() {
  elements.stopButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.stop === state.selectedStop);
  });
}

function renderEmptyResult() {
  elements.selectedStopLabel.textContent = \`${STOPS\[state.selectedStop\].label}å¾…æŸ¥è¯¢\`;
  elements.nextDayLabel.textContent = "--";
  elements.nextTime.textContent = "--:--";
  elements.nextLineLabel.textContent = "é€‰æ‹©ä»Žå“ªä¸Šè½¦å’Œæ—¶é—´åŽç‚¹å‡»æŸ¥è¯¢";
  elements.waitText.textContent = "æŸ¥è¯¢åŽä¼šæ˜¾ç¤ºæœ€è¿‘ä¸€ç­ã€‚";
  elements.tripMeta.hidden = true;
  elements.tripMeta.textContent = "";
  elements.secondaryTrip.textContent = "";
  elements.rideChoicePrompt.hidden = true;
  elements.rideChoiceStatus.hidden = true;
  elements.rideChoiceStatus.textContent = "ç‚¹å‡»ç­æ¬¡å³å¯æäº¤ï¼Œä¹‹åŽä»å¯æ”¹é€‰ã€‚";
  elements.nextRideChoiceButton.hidden = true;
  elements.timeline.innerHTML = "";
  elements.timelineNote.textContent = "ç‚¹å‡»æŸ¥è¯¢åŽæ˜¾ç¤ºåŽç»­ç­æ¬¡ã€‚";
}

function setPendingQueryStatus() {
  state.lastQuery = null;
}

function renderMainTrip(queryDate, stopId) {
  const trips = state.lastQuery?.trips || getUpcomingTrips(queryDate, stopId, 6);
  const nextTrip = trips\[0\];
  const secondTrip = trips\[1\];

  elements.selectedStopLabel.textContent = \`${STOPS\[stopId\].label}æœ€è¿‘ä¸€ç­\`;

  if (!nextTrip) {
    elements.nextDayLabel.textContent = "--";
    elements.nextTime.textContent = "--:--";
    elements.nextLineLabel.textContent = "æœªæ¥ 14 å¤©æ²¡æœ‰åŒ¹é…ç­æ¬¡";
    elements.waitText.textContent = "è¯·åˆ‡æ¢ä»Žå“ªä¸Šè½¦æˆ–è°ƒæ•´æŸ¥è¯¢æ—¶é—´ã€‚";
    elements.tripMeta.hidden = true;
    elements.tripMeta.textContent = "";
    elements.secondaryTrip.textContent = "";
    elements.nextRideChoiceButton.hidden = true;
    return;
  }

  elements.nextDayLabel.textContent = getReferenceDayLabel(nextTrip.boardingDate, queryDate);
  elements.nextTime.innerHTML = formatTripTime(nextTrip.boardingDate, nextTrip);
  elements.nextLineLabel.textContent = \`${nextTrip.lineLabel} Â· ${nextTrip.routeLabel}\`;
  elements.waitText.innerHTML = \`${describeWait(queryDate, nextTrip.boardingDate)} Â· ${STOPS\[stopId\].label} ${formatTripTime(nextTrip.boardingDate, nextTrip)} å‘è½¦\`;
  elements.tripMeta.hidden = false;
  elements.tripMeta.textContent = nextTrip.note || "æŒ‰æ¥æºæ—¶åˆ»è¡¨æ˜¾ç¤ºã€‚";
  elements.secondaryTrip.innerHTML = secondTrip
    ? \`å†ä¸‹ä¸€ç­ï¼š${secondTrip.lineLabel} Â· ${formatTripShortDateTime(secondTrip.boardingDate, secondTrip)}\`
    : "å½“å‰ç­›é€‰ä¸‹æš‚æ— å†ä¸‹ä¸€ç­ã€‚";
  configureRideChoiceButton(elements.nextRideChoiceButton, 0, state.lastQuery, "æˆ‘å‡†å¤‡åè¿™ç­");
}

function renderRideChoiceGuidance() {
  const query = state.lastQuery;
  const trips = query?.trips || \[\];
  const isVisible = rideChoiceEnabled && trips.length > 0;
  elements.rideChoicePrompt.hidden = !isVisible;
  elements.rideChoiceStatus.hidden = !isVisible;

  if (!isVisible) {
    return;
  }

  const selectedTrip = query.trips\[query.selectedRideChoiceIndex\];
  if (query.rideChoiceStatus === "saving") {
    elements.rideChoiceStatus.textContent = "æ­£åœ¨è®°å½•æ‚¨çš„é€‰æ‹©â€¦";
  } else if (query.rideChoiceStatus === "saved" && selectedTrip) {
    elements.rideChoiceStatus.textContent = \`å·²è®°å½•ï¼š${formatShortDateTime(selectedTrip.boardingDate)} Â· ${selectedTrip.lineLabel}ã€‚è®¡åˆ’æœ‰å˜å¯ç›´æŽ¥æ”¹é€‰ã€‚\`;
  } else if (query.rideChoiceStatus === "error") {
    elements.rideChoiceStatus.textContent = "æäº¤å¤±è´¥ï¼Œè¯·æ£€æŸ¥ç½‘ç»œåŽé‡æ–°ç‚¹å‡»ç­æ¬¡ã€‚";
  } else {
    elements.rideChoiceStatus.textContent = "ç‚¹å‡»ç­æ¬¡å³å¯æäº¤ï¼Œä¹‹åŽä»å¯æ”¹é€‰ã€‚";
  }
}

function configureRideChoiceButton(button, choiceIndex, query, defaultLabel = "æˆ‘å‡†å¤‡åè¿™ç­") {
  const isVisible = rideChoiceEnabled && Boolean(query?.trips?.\[choiceIndex\]);
  button.hidden = !isVisible;

  if (!isVisible) {
    return;
  }

  const isSelected = query.selectedRideChoiceIndex === choiceIndex;
  const isPending = query.pendingRideChoiceIndex === choiceIndex;
  button.dataset.rideChoiceIndex = String(choiceIndex);
  button.disabled = query.pendingRideChoiceIndex !== null;
  button.classList.toggle("is-selected", isSelected);
  button.classList.toggle("is-pending", isPending);
  button.setAttribute("aria-pressed", isSelected ? "true" : "false");
  button.textContent = isPending ? "æ­£åœ¨æäº¤â€¦" : isSelected ? "å·²é€‰æ‹©è¿™ç­" : defaultLabel;
}

function renderTimeline(queryDate, stopId) {
  const trips = state.lastQuery?.trips || getUpcomingTrips(queryDate, stopId, 6);

  elements.timeline.innerHTML = "";

  if (!trips.length) {
    const empty = document.createElement("p");
    empty.className = "timeline-note";
    empty.textContent = "æœªæ¥ 14 å¤©æ²¡æœ‰åŒ¹é…ç­æ¬¡ã€‚";
    elements.timeline.appendChild(empty);
    elements.timelineNote.textContent = "";
    return;
  }

  trips.slice(1).forEach((trip, index) => {
    const choiceIndex = index + 1;
    const item = document.createElement("article");
    item.className = "timeline-item";
    item.innerHTML = \`
      <div class="timeline-head">
        <span class="timeline-time">${formatTripTime(trip.boardingDate, trip)}</span>
        <span class="timeline-day">${getReferenceDayLabel(trip.boardingDate, queryDate)}</span>
      </div>
      <p class="timeline-line">${trip.lineLabel} Â· ${trip.routeLabel}</p>
      <p class="timeline-wait">${describeWait(queryDate, trip.boardingDate)} Â· ${formatShortDateTime(trip.boardingDate)}</p>
      <p class="timeline-meta">${trip.note || "æŒ‰æ¥æºæ—¶åˆ»è¡¨æ˜¾ç¤ºã€‚"}</p>
    \`;
    const choiceButton = document.createElement("button");
    choiceButton.className = "trip-choice-action";
    choiceButton.type = "button";
    configureRideChoiceButton(choiceButton, choiceIndex, state.lastQuery);
    item.appendChild(choiceButton);
    elements.timeline.appendChild(item);
  });

  elements.timelineNote.textContent = trips.length > 1
    ? \`å·²æŒ‰å‘è½¦æ—¶é—´æŽ’åºï¼Œå±•ç¤ºæœ€è¿‘ ${trips.length - 1} ä¸ªåŽç»­ç­æ¬¡ã€‚\`
    : "å½“å‰æŸ¥è¯¢ä¸‹åªæ‰¾åˆ°è¿™ä¸€ç­ã€‚";
}
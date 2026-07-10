"use strict";

const STORAGE_KEY = "airport-dreamzania-state-v1"; // V3에서도 기존 대기 데이터를 그대로 사용합니다.
const ADMIN_PASSWORD_KEY = "airport-dreamzania-admin-password";
const DEFAULT_ADMIN_PASSWORD = "1234";
const QUICK_NAMES = ["김서영", "나시우", "박루아", "박수빈", "박유라", "유수민", "이겸", "이로건", "이중빈", "임세아", "차소호", "최서연", "최서우", "최승현", "황시윤"];

const JOBS = {
  firefighter: {
    id: "firefighter",
    code: "FIRE",
    gate: "A1",
    name: "소방관",
    icon: "🚒",
    color: "#ef5b5b",
    light: "#fff0ed",
    description: "빠르게 출동하고 안전하게 불을 끄는 용감한 소방관 체험이에요."
  },
  nailArtist: {
    id: "nailArtist",
    code: "NAIL",
    gate: "B2",
    name: "네일아티스트",
    icon: "💅",
    color: "#e568a5",
    light: "#fff0f7",
    description: "예쁜 색과 무늬를 골라 손톱을 멋지게 꾸미는 네일아티스트 체험이에요."
  },
  archaeologist: {
    id: "archaeologist",
    code: "FOSSIL",
    gate: "C3",
    name: "고고학자",
    icon: "🦴",
    color: "#ae7a40",
    light: "#fff7e7",
    description: "모래 속 흔적을 조심스럽게 찾아 과거의 이야기를 발견하는 체험이에요."
  },
  fisher: {
    id: "fisher",
    code: "FISH",
    gate: "D4",
    name: "어부",
    icon: "🎣",
    color: "#2f9dc3",
    light: "#e9faff",
    description: "바다와 물고기를 살피며 안전하게 고기를 잡아보는 어부 체험이에요."
  }
};

const createInitialJobState = () => ({
  currentNumber: 0,
  currentName: "",
  nextNumber: 1,
  queue: [],
  completed: []
});

const createInitialState = () => ({
  jobs: Object.fromEntries(Object.keys(JOBS).map((id) => [id, createInitialJobState()])),
  selectedJobId: null,
  lastTicket: null
});

let appState = loadState();
let currentScreen = "welcome";
let adminSelectedJobId = Object.keys(JOBS)[0];
let deferredInstallPrompt = null;
let qrStream = null;
let qrAnimationFrame = null;
let confirmAction = null;
let toastTimer = null;

const elements = {};

document.addEventListener("DOMContentLoaded", init);

function init() {
  cacheElements();
  bindEvents();
  renderQuickNames();
  renderJobGrid();
  registerServiceWorker();
  handleInstallPrompt();
  prepareSpeechVoices();
  showScreen("welcome");
}


function prepareSpeechVoices() {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.getVoices();
  window.speechSynthesis.onvoiceschanged = () => {
    window.speechSynthesis.getVoices();
  };
}

function cacheElements() {
  const ids = [
    "homeButton", "adminButton", "startButton", "installButton", "jobGrid", "jobDetailContent",
    "checkinTitle", "checkinSubtitle", "nameTabButton", "qrTabButton", "namePanel", "qrPanel",
    "nameForm", "childName", "quickNames", "qrVideo", "qrStatus", "startQrButton", "stopQrButton", "guestNumberForm", "guestNumber",
    "backToJobButton", "ticketCard", "ticketJobCode", "ticketJobName", "ticketName", "ticketNumber",
    "ticketGate", "ticketWaitMessage", "ticketJobButton", "ticketOtherJobButton", "completeMessage",
    "nextJobButton", "toast", "adminLoginDialog", "adminLoginForm", "adminPassword", "adminPanelDialog",
    "closeAdminPanel", "changePasswordButton", "adminJobTabs", "adminJobPanel", "confirmDialog",
    "confirmTitle", "confirmMessage", "confirmCancelButton", "confirmOkButton"
  ];
  ids.forEach((id) => { elements[id] = document.getElementById(id); });
  elements.screens = [...document.querySelectorAll(".screen")];
}

function bindEvents() {
  elements.startButton.addEventListener("click", () => showScreen("jobs"));
  elements.homeButton.addEventListener("click", () => showScreen("welcome"));
  elements.adminButton.addEventListener("click", openAdminLogin);
  elements.jobGrid.addEventListener("click", handleJobGridClick);
  elements.jobDetailContent.addEventListener("click", handleJobDetailClick);
  elements.nameTabButton.addEventListener("click", () => setCheckinTab("name"));
  elements.qrTabButton.addEventListener("click", () => setCheckinTab("qr"));
  elements.nameForm.addEventListener("submit", handleNameSubmit);
  elements.quickNames.addEventListener("click", handleQuickNameClick);
  elements.startQrButton.addEventListener("click", startQrScanner);
  elements.stopQrButton.addEventListener("click", stopQrScanner);
  elements.guestNumberForm.addEventListener("submit", handleGuestNumberSubmit);
  elements.backToJobButton.addEventListener("click", () => {
    stopQrScanner();
    showScreen("job-detail");
  });
  elements.ticketJobButton.addEventListener("click", () => showScreen("job-detail"));
  elements.ticketOtherJobButton.addEventListener("click", () => showScreen("jobs"));
  elements.nextJobButton.addEventListener("click", () => showScreen("jobs"));
  elements.adminLoginForm.addEventListener("submit", handleAdminLogin);
  elements.closeAdminPanel.addEventListener("click", () => elements.adminPanelDialog.close());
  elements.changePasswordButton.addEventListener("click", changeAdminPassword);
  elements.adminJobTabs.addEventListener("click", handleAdminTabClick);
  elements.adminJobPanel.addEventListener("click", handleAdminPanelClick);
  elements.confirmCancelButton.addEventListener("click", () => { confirmAction = null; });
  elements.confirmOkButton.addEventListener("click", executeConfirmAction);
  elements.installButton.addEventListener("click", installPwa);
  window.addEventListener("beforeunload", stopQrScanner);
  window.addEventListener("appinstalled", () => {
    elements.installButton.classList.add("hidden");
    showToast("공항 꿈자니아가 설치되었어요!");
  });
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialState();
    const parsed = JSON.parse(raw);
    const base = createInitialState();
    Object.keys(JOBS).forEach((jobId) => {
      if (parsed.jobs?.[jobId]) {
        base.jobs[jobId] = {
          ...createInitialJobState(),
          ...parsed.jobs[jobId],
          queue: Array.isArray(parsed.jobs[jobId].queue) ? parsed.jobs[jobId].queue : [],
          completed: Array.isArray(parsed.jobs[jobId].completed) ? parsed.jobs[jobId].completed : []
        };
      }
    });
    base.selectedJobId = parsed.selectedJobId || null;
    base.lastTicket = parsed.lastTicket || null;
    return base;
  } catch (error) {
    console.error("저장 데이터를 읽지 못했습니다.", error);
    return createInitialState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
}

function showScreen(screenName) {
  currentScreen = screenName;
  elements.screens.forEach((screen) => screen.classList.toggle("active", screen.dataset.screen === screenName));
  elements.homeButton.classList.toggle("hidden", screenName === "welcome");

  if (screenName === "jobs") renderJobGrid();
  if (screenName === "job-detail") renderJobDetail();
  if (screenName === "checkin") renderCheckin();
  if (screenName === "ticket") renderTicket();

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderJobGrid() {
  elements.jobGrid.innerHTML = Object.values(JOBS).map((job) => {
    const state = appState.jobs[job.id];
    return `
      <button class="job-card job-${job.id}" type="button" data-job-id="${job.id}" style="--job-color:${job.color};--job-light:${job.light};">
        <div class="job-visual" aria-hidden="true">${job.icon}</div>
        <div class="job-info">
          <span class="job-code">GATE ${job.gate}</span>
          <h3>${job.name}</h3>
          <p>${job.description}</p>
          <div class="job-stats">
            <span class="stat-pill">현재 ${state.currentNumber || "-"}번</span>
            <span class="stat-pill">대기 ${state.queue.length}명</span>
          </div>
        </div>
      </button>`;
  }).join("");
}

function handleJobGridClick(event) {
  const card = event.target.closest("[data-job-id]");
  if (!card) return;
  selectJob(card.dataset.jobId);
  showScreen("job-detail");
}

function selectJob(jobId) {
  if (!JOBS[jobId]) return;
  appState.selectedJobId = jobId;
  saveState();
}

function renderJobDetail() {
  const jobId = appState.selectedJobId;
  if (!jobId || !JOBS[jobId]) {
    showScreen("jobs");
    return;
  }

  const job = JOBS[jobId];
  const state = appState.jobs[jobId];
  const queueHtml = state.queue.length
    ? state.queue.map((person, index) => `
        <div class="queue-item">
          <span class="queue-item-number">${person.number}</span>
          <span class="queue-item-name">${escapeHtml(person.name)}</span>
          <span class="queue-item-status">${index === 0 ? "다음 차례" : `${index + 1}번째 대기`}</span>
        </div>`).join("")
    : `<div class="empty-queue">지금은 기다리는 친구가 없어요 😊</div>`;

  elements.jobDetailContent.innerHTML = `
    <article class="job-detail-card job-${job.id}" style="--job-color:${job.color};--job-light:${job.light};">
      <div class="job-detail-hero">
        <div class="job-detail-visual" aria-hidden="true">${job.icon}</div>
        <div class="job-detail-copy">
          <span class="eyebrow">GATE ${job.gate} · ${job.code}</span>
          <h2>${job.name}</h2>
          <p>${job.description}</p>
        </div>
      </div>
      <div class="job-detail-body">
        <section class="current-board" aria-label="현재 체험 번호">
          <span class="board-label">NOW EXPERIENCE</span>
          <strong class="current-number">${state.currentNumber || "-"}</strong>
          <span class="current-name">${state.currentName ? `${escapeHtml(state.currentName)} 체험 중` : "현재 체험 준비 중"}</span>
        </section>
        <section class="queue-board">
          <h3>✈️ 대기 안내판 <span>(${state.queue.length}명)</span></h3>
          <div class="queue-list">${queueHtml}</div>
        </section>
        ${state.queue.length ? `
          <section class="next-entry-card" aria-live="polite">
            <div class="next-entry-icon" aria-hidden="true">🔔</div>
            <div class="next-entry-copy">
              <span>다음 차례 친구</span>
              <strong>${escapeHtml(state.queue[0].name)}</strong>
              <small>${state.queue[0].number}번 · 준비되면 버튼을 눌러요</small>
            </div>
            <button class="entry-now-button" type="button" data-action="enter-next">
              입장하기
              <span>🔊</span>
            </button>
          </section>` : ""}
      </div>
      <div class="job-action-bar">
        <button class="secondary-button" type="button" data-action="back-jobs">다른 직업 보기</button>
        <button class="primary-button extra-large" type="button" data-action="checkin">입장 대기하기 🎫</button>
      </div>
    </article>`;
}

function handleJobDetailClick(event) {
  const actionButton = event.target.closest("[data-action]");
  if (!actionButton) return;
  if (actionButton.dataset.action === "back-jobs") showScreen("jobs");
  if (actionButton.dataset.action === "checkin") showScreen("checkin");
  if (actionButton.dataset.action === "enter-next") childEnterNext(appState.selectedJobId);
}

function renderCheckin() {
  const job = JOBS[appState.selectedJobId];
  if (!job) {
    showScreen("jobs");
    return;
  }
  elements.checkinTitle.textContent = `${job.icon} ${job.name} 체크인`;
  elements.checkinSubtitle.textContent = "내 이름을 한 번 누르면 바로 대기표가 나와요.";
  elements.childName.value = "";
  setCheckinTab("name");
  setTimeout(() => elements.childName.focus(), 200);
}

function renderQuickNames() {
  elements.quickNames.innerHTML = QUICK_NAMES.map((name) => `<button type="button" class="quick-name-button" data-name="${name}">${name}</button>`).join("");
}

function handleQuickNameClick(event) {
  const button = event.target.closest("[data-name]");
  if (!button) return;

  const name = normalizeName(button.dataset.name);
  if (!name) return;

  button.classList.add("selected");
  vibrate(45);

  window.setTimeout(() => {
    button.classList.remove("selected");
    issueTicket(name, "quick-name");
  }, 180);
}

function setCheckinTab(tab) {
  const isName = tab === "name";
  elements.nameTabButton.classList.toggle("active", isName);
  elements.qrTabButton.classList.toggle("active", !isName);
  elements.nameTabButton.setAttribute("aria-selected", String(isName));
  elements.qrTabButton.setAttribute("aria-selected", String(!isName));
  elements.namePanel.classList.toggle("active", isName);
  elements.qrPanel.classList.toggle("active", !isName);
  if (isName) {
    stopQrScanner();
    setTimeout(() => elements.childName.focus(), 100);
  }
}

function handleNameSubmit(event) {
  event.preventDefault();
  const name = normalizeName(elements.childName.value);
  if (!name) {
    showToast("이름을 입력해 주세요.");
    return;
  }
  issueTicket(name, "name");
}

function normalizeName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 10);
}

function issueTicket(name, method) {
  const jobId = appState.selectedJobId;
  const state = appState.jobs[jobId];
  const duplicate = state.queue.find((person) => person.name === name);
  if (duplicate) {
    showToast(`${name} 친구는 이미 ${duplicate.number}번으로 기다리고 있어요.`);
    appState.lastTicket = { jobId, name, number: duplicate.number, method, issuedAt: duplicate.issuedAt };
    saveState();
    showScreen("ticket");
    return;
  }

  if (state.currentName === name) {
    showToast(`${name} 친구는 지금 체험 중이에요.`);
    return;
  }

  const ticket = {
    id: createId(),
    name,
    number: state.nextNumber,
    issuedAt: new Date().toISOString(),
    method
  };
  state.queue.push(ticket);
  state.nextNumber += 1;
  appState.lastTicket = { jobId, ...ticket };
  saveState();
  stopQrScanner();
  vibrate([70, 40, 90]);
  showScreen("ticket");
}

function renderTicket() {
  const ticket = appState.lastTicket;
  if (!ticket || !JOBS[ticket.jobId]) {
    showScreen("jobs");
    return;
  }
  const job = JOBS[ticket.jobId];
  const state = appState.jobs[ticket.jobId];
  const queueIndex = state.queue.findIndex((person) => person.id === ticket.id || (person.name === ticket.name && person.number === ticket.number));
  const ahead = queueIndex >= 0 ? queueIndex : state.queue.filter((person) => person.number < ticket.number).length;

  elements.ticketJobCode.textContent = job.code;
  elements.ticketJobName.textContent = `${job.icon} ${job.name}`;
  elements.ticketName.textContent = ticket.name;
  elements.ticketNumber.textContent = ticket.number;
  elements.ticketGate.textContent = job.gate;
  elements.ticketWaitMessage.textContent = ahead > 0 ? `앞에 ${ahead}명이 기다리고 있어요.` : "다음 차례예요! 준비해 주세요.";
  elements.ticketCard.style.borderTop = `10px solid ${job.color}`;
  elements.ticketCard.style.animation = "none";
  void elements.ticketCard.offsetWidth;
  elements.ticketCard.style.animation = "";
}

async function startQrScanner() {
  if (!("BarcodeDetector" in window)) {
    elements.qrStatus.textContent = "이 태블릿은 QR 자동 인식을 지원하지 않아요. 이름 입력을 이용해 주세요.";
    elements.startQrButton.disabled = true;
    showToast("QR 인식 미지원 기기예요. 이름 입력을 이용해 주세요.");
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    elements.qrStatus.textContent = "카메라를 사용할 수 없어요. 이름 입력을 이용해 주세요.";
    return;
  }

  try {
    qrStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
    elements.qrVideo.srcObject = qrStream;
    await elements.qrVideo.play();
    elements.startQrButton.classList.add("hidden");
    elements.stopQrButton.classList.remove("hidden");
    elements.qrStatus.textContent = "QR 카드를 네모 안에 천천히 보여주세요.";
    scanQrFrame();
  } catch (error) {
    console.error(error);
    elements.qrStatus.textContent = "카메라 권한이 필요해요. 권한을 허용하거나 이름 입력을 이용해 주세요.";
    showToast("카메라를 열지 못했어요.");
  }
}

async function scanQrFrame() {
  if (!qrStream) return;
  try {
    const detector = new BarcodeDetector({ formats: ["qr_code"] });
    const barcodes = await detector.detect(elements.qrVideo);
    if (barcodes.length) {
      const parsedName = parseQrName(barcodes[0].rawValue);
      if (parsedName) {
        elements.qrStatus.textContent = `${parsedName} 친구를 확인했어요!`;
        issueTicket(parsedName, "qr");
        return;
      }
      elements.qrStatus.textContent = "방문객 번호를 읽을 수 없는 QR이에요.";
    }
  } catch (error) {
    console.error("QR 스캔 오류", error);
  }
  qrAnimationFrame = requestAnimationFrame(scanQrFrame);
}

function parseQrName(rawValue) {
  const raw = String(rawValue || "").trim();
  if (!raw) return "";

  const guestMatch = raw.match(/^(?:DZ-)?GUEST[-_ ]?(\d{1,3})$/i);
  if (guestMatch) return formatGuestName(guestMatch[1]);

  const numberOnlyMatch = raw.match(/^\d{1,3}$/);
  if (numberOnlyMatch) return formatGuestName(numberOnlyMatch[0]);

  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed.guest === "number" || typeof parsed.guest === "string") {
      return formatGuestName(parsed.guest);
    }
    if (typeof parsed.name === "string") return normalizeName(parsed.name);
  } catch (_) {
    const guestParam = raw.match(/(?:guest|visitor|손님)\s*[:=]\s*(\d{1,3})/i);
    if (guestParam) return formatGuestName(guestParam[1]);

    const nameMatch = raw.match(/(?:name|이름)\s*[:=]\s*([^&\n]+)/i);
    if (nameMatch) return normalizeName(decodeURIComponent(nameMatch[1]));
  }

  if (raw.length <= 10 && !/^https?:/i.test(raw)) return normalizeName(raw);
  return "";
}

function formatGuestName(value) {
  const number = Number.parseInt(String(value), 10);
  if (!Number.isInteger(number) || number < 1 || number > 999) return "";
  return `손님 ${String(number).padStart(3, "0")}`;
}

function handleGuestNumberSubmit(event) {
  event.preventDefault();
  const guestName = formatGuestName(elements.guestNumber.value);
  if (!guestName) {
    showToast("1부터 999 사이의 방문객 번호를 입력해 주세요.");
    return;
  }
  elements.guestNumber.value = "";
  issueTicket(guestName, "guest-number");
}

function stopQrScanner() {
  if (qrAnimationFrame) cancelAnimationFrame(qrAnimationFrame);
  qrAnimationFrame = null;
  if (qrStream) qrStream.getTracks().forEach((track) => track.stop());
  qrStream = null;
  if (elements.qrVideo) elements.qrVideo.srcObject = null;
  if (elements.startQrButton) elements.startQrButton.classList.remove("hidden");
  if (elements.stopQrButton) elements.stopQrButton.classList.add("hidden");
  if (elements.qrStatus) elements.qrStatus.textContent = "방문객 QR 카드를 네모 안에 보여주세요.";
}

function openAdminLogin() {
  elements.adminPassword.value = "";
  elements.adminLoginDialog.showModal();
  setTimeout(() => elements.adminPassword.focus(), 100);
}

function handleAdminLogin(event) {
  event.preventDefault();
  const savedPassword = localStorage.getItem(ADMIN_PASSWORD_KEY) || DEFAULT_ADMIN_PASSWORD;
  if (elements.adminPassword.value !== savedPassword) {
    showToast("비밀번호가 맞지 않아요.");
    vibrate(100);
    return;
  }
  elements.adminLoginDialog.close();
  renderAdminPanel();
  elements.adminPanelDialog.showModal();
}

function renderAdminPanel() {
  elements.adminJobTabs.innerHTML = Object.values(JOBS).map((job) => `
    <button type="button" class="admin-tab ${job.id === adminSelectedJobId ? "active" : ""}" data-admin-job="${job.id}">${job.icon} ${job.name}</button>`).join("");
  renderAdminJobPanel();
}

function handleAdminTabClick(event) {
  const button = event.target.closest("[data-admin-job]");
  if (!button) return;
  adminSelectedJobId = button.dataset.adminJob;
  renderAdminPanel();
}

function renderAdminJobPanel() {
  const job = JOBS[adminSelectedJobId];
  const state = appState.jobs[adminSelectedJobId];
  const queueHtml = state.queue.length
    ? state.queue.map((person) => `
        <div class="admin-queue-item">
          <strong>${person.number}번</strong>
          <span>${escapeHtml(person.name)}</span>
          <button type="button" data-admin-action="remove" data-ticket-id="${person.id}">삭제</button>
        </div>`).join("")
    : `<div class="admin-empty">대기 중인 친구가 없어요.</div>`;

  elements.adminJobPanel.innerHTML = `
    <div class="admin-summary">
      <div class="admin-stat"><span>현재 번호</span><strong>${state.currentNumber || "-"}</strong></div>
      <div class="admin-stat"><span>대기 인원</span><strong>${state.queue.length}</strong></div>
      <div class="admin-stat"><span>다음 발급</span><strong>${state.nextNumber}</strong></div>
    </div>
    <div class="admin-controls">
      <button class="primary-button" type="button" data-admin-action="call-next">📣 다음 번호 호출</button>
      <button class="secondary-button" type="button" data-admin-action="repeat-call">🔊 다시 안내하기</button>
      <button class="secondary-button" type="button" data-admin-action="complete-current">✅ 현재 체험 완료</button>
      <button class="danger-button" type="button" data-admin-action="reset-all">🧹 번호·대기 초기화</button>
    </div>
    <section>
      <h3>${job.icon} ${job.name} 대기 명단</h3>
      <div class="admin-queue">${queueHtml}</div>
    </section>`;
}

function handleAdminPanelClick(event) {
  const button = event.target.closest("[data-admin-action]");
  if (!button) return;
  const action = button.dataset.adminAction;
  if (action === "call-next") callNext(adminSelectedJobId);
  if (action === "repeat-call") repeatCurrentCall(adminSelectedJobId);
  if (action === "complete-current") completeCurrent(adminSelectedJobId);
  if (action === "remove") removeTicket(adminSelectedJobId, button.dataset.ticketId);
  if (action === "reset-all") askForConfirmation(
    "번호와 대기를 초기화할까요?",
    `${JOBS[adminSelectedJobId].name}의 현재번호와 대기명단이 모두 지워져요.`,
    () => resetJob(adminSelectedJobId)
  );
}


function childEnterNext(jobId) {
  const state = appState.jobs[jobId];
  if (!state || !state.queue.length) {
    showToast("입장할 친구가 없어요.");
    return;
  }

  if (state.currentNumber && state.currentName) {
    state.completed.push({
      number: state.currentNumber,
      name: state.currentName,
      completedAt: new Date().toISOString()
    });
  }

  const next = state.queue.shift();
  state.currentNumber = next.number;
  state.currentName = next.name;
  saveState();
  renderVisibleData();
  vibrate([80, 40, 110]);

  announceEntry(next.name, JOBS[jobId].name, next.number);
  showToast(`${next.name} 친구가 ${JOBS[jobId].name} 체험장에 입장했어요!`);
}

function callNext(jobId) {
  const state = appState.jobs[jobId];
  if (!state.queue.length) {
    showToast("호출할 대기번호가 없어요.");
    return;
  }

  if (state.currentNumber && state.currentName) {
    state.completed.push({ number: state.currentNumber, name: state.currentName, completedAt: new Date().toISOString() });
  }
  const next = state.queue.shift();
  state.currentNumber = next.number;
  state.currentName = next.name;
  saveState();
  renderAdminPanel();
  renderVisibleData();
  vibrate([100, 60, 100]);
  showToast(`${JOBS[jobId].name} ${next.number}번 ${next.name} 친구를 호출했어요!`);
  announceEntry(next.name, JOBS[jobId].name, next.number);
}


function repeatCurrentCall(jobId) {
  const state = appState.jobs[jobId];
  if (!state.currentNumber || !state.currentName) {
    showToast("다시 안내할 현재 체험 친구가 없어요.");
    return;
  }
  announceEntry(state.currentName, JOBS[jobId].name, state.currentNumber);
  showToast(`${state.currentName} 친구에게 다시 안내했어요.`);
}

async function announceEntry(childName, jobName, number) {
  const isGuest = /^손님\s+\d{3}$/.test(childName);
  const spokenName = isGuest ? `${childName.replace("손님 ", "손님 ")}번` : `${childName} 친구`;
  const message = `${spokenName}, 준비되었나요? ${jobName} 체험장으로 입장하세요.`;
  try {
    await playAirportChime();
  } catch (error) {
    console.warn("안내음 재생을 건너뜁니다.", error);
  }

  if (!("speechSynthesis" in window)) {
    showToast("이 브라우저에서는 음성 안내를 지원하지 않아요.");
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(message);
  utterance.lang = "ko-KR";
  utterance.rate = 0.82;
  utterance.pitch = 1.22;
  utterance.volume = 0.95;

  const voices = window.speechSynthesis.getVoices();
  const koreanVoices = voices.filter((voice) => voice.lang?.toLowerCase().startsWith("ko"));
  const preferredNames = ["yuna", "sunhi", "heami", "female", "여성", "유나", "선희"];
  const preferredVoice = koreanVoices.find((voice) =>
    preferredNames.some((name) => voice.name.toLowerCase().includes(name))
  );
  if (preferredVoice || koreanVoices[0]) utterance.voice = preferredVoice || koreanVoices[0];

  setTimeout(() => window.speechSynthesis.speak(utterance), 220);
}

function playAirportChime() {
  return new Promise((resolve) => {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      resolve();
      return;
    }

    const context = new AudioContextClass();
    const masterGain = context.createGain();
    masterGain.gain.setValueAtTime(0.0001, context.currentTime);
    masterGain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.04);
    masterGain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 1.15);
    masterGain.connect(context.destination);

    const notes = [
      { frequency: 523.25, start: 0.00, duration: 0.32 },
      { frequency: 659.25, start: 0.30, duration: 0.38 },
      { frequency: 783.99, start: 0.62, duration: 0.42 }
    ];

    notes.forEach(({ frequency, start, duration }) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, context.currentTime + start);
      gain.gain.setValueAtTime(0.0001, context.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.7, context.currentTime + start + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + start + duration);
      oscillator.connect(gain);
      gain.connect(masterGain);
      oscillator.start(context.currentTime + start);
      oscillator.stop(context.currentTime + start + duration + 0.05);
    });

    setTimeout(() => {
      context.close().catch(() => {});
      resolve();
    }, 1250);
  });
}

function completeCurrent(jobId) {
  const state = appState.jobs[jobId];
  if (!state.currentNumber || !state.currentName) {
    showToast("현재 체험 중인 친구가 없어요.");
    return;
  }
  const completedName = state.currentName;
  state.completed.push({ number: state.currentNumber, name: state.currentName, completedAt: new Date().toISOString() });
  state.currentNumber = 0;
  state.currentName = "";
  saveState();
  renderAdminPanel();
  renderVisibleData();
  elements.completeMessage.textContent = `${completedName} 친구, ${JOBS[jobId].name} 체험을 멋지게 마쳤어요!`;
  showToast(`${completedName} 친구의 체험을 완료했어요.`);
}

function removeTicket(jobId, ticketId) {
  const state = appState.jobs[jobId];
  const person = state.queue.find((item) => item.id === ticketId);
  state.queue = state.queue.filter((item) => item.id !== ticketId);
  saveState();
  renderAdminPanel();
  renderVisibleData();
  if (person) showToast(`${person.name} 친구의 대기를 삭제했어요.`);
}

function resetJob(jobId) {
  appState.jobs[jobId] = createInitialJobState();
  if (appState.lastTicket?.jobId === jobId) appState.lastTicket = null;
  saveState();
  renderAdminPanel();
  renderVisibleData();
  showToast(`${JOBS[jobId].name} 번호와 대기를 초기화했어요.`);
}

function renderVisibleData() {
  if (currentScreen === "jobs") renderJobGrid();
  if (currentScreen === "job-detail") renderJobDetail();
  if (currentScreen === "ticket") renderTicket();
}

function changeAdminPassword() {
  const current = prompt("현재 비밀번호를 입력해 주세요.");
  if (current === null) return;
  const savedPassword = localStorage.getItem(ADMIN_PASSWORD_KEY) || DEFAULT_ADMIN_PASSWORD;
  if (current !== savedPassword) {
    showToast("현재 비밀번호가 맞지 않아요.");
    return;
  }
  const next = prompt("새 비밀번호 4~8자리를 입력해 주세요.");
  if (next === null) return;
  if (!/^\d{4,8}$/.test(next)) {
    showToast("새 비밀번호는 숫자 4~8자리로 입력해 주세요.");
    return;
  }
  localStorage.setItem(ADMIN_PASSWORD_KEY, next);
  showToast("관리자 비밀번호를 변경했어요.");
}

function askForConfirmation(title, message, action) {
  elements.confirmTitle.textContent = title;
  elements.confirmMessage.textContent = message;
  confirmAction = action;
  elements.confirmDialog.showModal();
}

function executeConfirmAction() {
  const action = confirmAction;
  confirmAction = null;
  if (typeof action === "function") action();
}

function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  toastTimer = setTimeout(() => elements.toast.classList.remove("show"), 3000);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  }[char]));
}

function createId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `ticket-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function vibrate(pattern) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}

function handleInstallPrompt() {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    elements.installButton.classList.remove("hidden");
  });
}

async function installPwa() {
  if (!deferredInstallPrompt) {
    showToast("브라우저 메뉴에서 ‘홈 화면에 추가’를 선택해 주세요.");
    return;
  }
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  elements.installButton.classList.add("hidden");
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", async () => {
    try {
      await navigator.serviceWorker.register("service-worker.js");
    } catch (error) {
      console.error("서비스 워커 등록 실패", error);
    }
  });
}

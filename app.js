(() => {
'use strict';

const PRESETS = {
focus: {
label: 'Focus Session',
seconds: 25 * 60
},
break: {
label: 'Short Break',
seconds: 5 * 60
}
};

const STORAGE_KEYS = {
sessions: 'focusTimerLive.completedSessions',
chime: 'focusTimerLive.chimeEnabled'
};

const RING_RADIUS = 106;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const elements = {
body: document.body,
presetButtons: document.querySelectorAll('.preset-btn'),
ringFill: document.getElementById('ring-fill'),
modeLabel: document.getElementById('mode-label'),
timeDisplay: document.getElementById('time-display'),
statusText: document.getElementById('status-text'),
startPauseBtn: document.getElementById('start-pause-btn'),
resetBtn: document.getElementById('reset-btn'),
chimeCheckbox: document.getElementById('chime-checkbox'),
testChimeBtn: document.getElementById('test-chime-btn'),
sessionsCount: document.getElementById('sessions-count'),
sessionDots: document.getElementById('session-dots'),
clearSessionsBtn: document.getElementById('clear-sessions-btn')
};

let state = {
mode: 'focus',
remainingSeconds: PRESETS.focus.seconds,
isRunning: false,
endTimestamp: null,
intervalId: null,
completedSessions: 0,
chimeEnabled: true
};

let audioContext = null;

function loadPreferences() {
try {
const savedSessions = parseInt(localStorage.getItem(STORAGE_KEYS.sessions), 10);
if (!Number.isNaN(savedSessions) && savedSessions >= 0) {
state.completedSessions = savedSessions;
}

const savedChime = localStorage.getItem(STORAGE_KEYS.chime);
if (savedChime !== null) {
state.chimeEnabled = savedChime === 'true';
}
} catch (_err) {
// localStorage may be unavailable in restricted contexts
}
}

function saveSessions() {
try {
localStorage.setItem(STORAGE_KEYS.sessions, String(state.completedSessions));
} catch (_err) {
// ignore storage errors
}
}

function saveChimePreference() {
try {
localStorage.setItem(STORAGE_KEYS.chime, String(state.chimeEnabled));
} catch (_err) {
// ignore storage errors
}
}

function formatTime(totalSeconds) {
const safeSeconds = Math.max(0, Math.ceil(totalSeconds));
const minutes = Math.floor(safeSeconds / 60);
const seconds = safeSeconds % 60;
return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function playGentleChime() {
const AudioCtx = window.AudioContext || window.webkitAudioContext;
if (!AudioCtx) return;

if (!audioContext) {
audioContext = new AudioCtx();
}
if (audioContext.state === 'suspended') {
audioContext.resume();
}

const now = audioContext.currentTime;
const notes = [523.25, 659.25, 783.99]; // C5, E5, G5 soft triad

notes.forEach((freq, index) => {
const osc = audioContext.createOscillator();
const gain = audioContext.createGain();

osc.type = 'sine';
osc.frequency.setValueAtTime(freq, now + index * 0.14);

gain.gain.setValueAtTime(0.0001, now + index * 0.14);
gain.gain.exponentialRampToValueAtTime(0.12, now + index * 0.14 + 0.04);
gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.14 + 1.15);

osc.connect(gain);
gain.connect(audioContext.destination);

osc.start(now + index * 0.14);
osc.stop(now + index * 0.14 + 1.2);
});
}

function renderRing() {
const total = PRESETS[state.mode].seconds;
const progress = total > 0 ? (total - state.remainingSeconds) / total : 0;
const offset = RING_CIRCUMFERENCE * (1 - Math.min(1, Math.max(0, progress)));
elements.ringFill.style.strokeDasharray = `${RING_CIRCUMFERENCE}`;
elements.ringFill.style.strokeDashoffset = `${offset}`;
}

function renderSessions() {
elements.sessionsCount.textContent = String(state.completedSessions);
elements.sessionDots.innerHTML = '';

const visibleDots = Math.min(state.completedSessions, 8);
for (let i = 0; i < visibleDots; i += 1) {
const dot = document.createElement('span');
dot.className = 'session-dot';
elements.sessionDots.appendChild(dot);
}

if (state.completedSessions > 8) {
const more = document.createElement('span');
more.className = 'status-text';
more.textContent = `+${state.completedSessions - 8}`;
elements.sessionDots.appendChild(more);
}
}

function renderUI() {
const formatted = formatTime(state.remainingSeconds);
elements.body.dataset.mode = state.mode;
elements.modeLabel.textContent = PRESETS[state.mode].label;
elements.timeDisplay.textContent = formatted;
elements.chimeCheckbox.checked = state.chimeEnabled;

elements.presetButtons.forEach((btn) => {
const isSelected = btn.dataset.preset === state.mode;
btn.classList.toggle('active', isSelected);
btn.setAttribute('aria-selected', String(isSelected));
});

if (state.isRunning) {
elements.startPauseBtn.textContent = 'Pause';
elements.startPauseBtn.setAttribute('aria-label', 'Pause timer');
elements.statusText.textContent = state.mode === 'focus' ? 'Focusing...' : 'Taking a breather...';
document.title = `${formatted} · ${PRESETS[state.mode].label}`;
} else if (state.remainingSeconds === 0) {
elements.startPauseBtn.textContent = 'Start';
elements.startPauseBtn.setAttribute('aria-label', 'Start timer');
elements.statusText.textContent = state.mode === 'focus' ? 'Focus complete! Nice work.' : 'Break complete! Ready to focus.';
document.title = 'Session Complete · Focus Timer Live';
} else if (state.remainingSeconds < PRESETS[state.mode].seconds) {
elements.startPauseBtn.textContent = 'Resume';
elements.startPauseBtn.setAttribute('aria-label', 'Resume timer');
elements.statusText.textContent = 'Paused';
document.title = `${formatted} (Paused) · Focus Timer Live`;
} else {
elements.startPauseBtn.textContent = 'Start';
elements.startPauseBtn.setAttribute('aria-label', 'Start timer');
elements.statusText.textContent = 'Ready to begin';
document.title = 'Focus Timer Live';
}

renderRing();
renderSessions();
}

function stopInterval() {
if (state.intervalId !== null) {
clearInterval(state.intervalId);
state.intervalId = null;
}
}

function handleCompletion() {
stopInterval();
state.isRunning = false;
state.remainingSeconds = 0;
state.endTimestamp = null;

if (state.mode === 'focus') {
state.completedSessions += 1;
saveSessions();
}

if (state.chimeEnabled) {
playGentleChime();
}

renderUI();
}

function tick() {
if (!state.isRunning || state.endTimestamp === null) return;
const msLeft = state.endTimestamp - Date.now();
if (msLeft <= 0) {
handleCompletion();
return;
}
state.remainingSeconds = Math.ceil(msLeft / 1000);
renderUI();
}

function startTimer() {
if (state.remainingSeconds <= 0) {
state.remainingSeconds = PRESETS[state.mode].seconds;
}
state.isRunning = true;
state.endTimestamp = Date.now() + state.remainingSeconds * 1000;
stopInterval();
state.intervalId = setInterval(tick, 250);
renderUI();
}

function pauseTimer() {
if (!state.isRunning) return;
tick();
stopInterval();
state.isRunning = false;
state.endTimestamp = null;
renderUI();
}

function toggleStartPause() {
if (state.isRunning) {
pauseTimer();
} else {
startTimer();
}
}

function resetTimer() {
stopInterval();
state.isRunning = false;
state.endTimestamp = null;
state.remainingSeconds = PRESETS[state.mode].seconds;
renderUI();
}

function switchPreset(newMode) {
if (!PRESETS[newMode] || newMode === state.mode) return;
stopInterval();
state.mode = newMode;
state.isRunning = false;
state.endTimestamp = null;
state.remainingSeconds = PRESETS[newMode].seconds;
renderUI();
}

function clearSessions() {
if (state.completedSessions === 0) return;
state.completedSessions = 0;
saveSessions();
renderSessions();
}

function bindEvents() {
elements.presetButtons.forEach((btn) => {
btn.addEventListener('click', () => {
switchPreset(btn.dataset.preset);
});
});

elements.startPauseBtn.addEventListener('click', toggleStartPause);
elements.resetBtn.addEventListener('click', resetTimer);

elements.chimeCheckbox.addEventListener('change', (event) => {
state.chimeEnabled = event.target.checked;
saveChimePreference();
});

elements.testChimeBtn.addEventListener('click', () => {
playGentleChime();
});

elements.clearSessionsBtn.addEventListener('click', clearSessions);

document.addEventListener('keydown', (event) => {
if (event.target && (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA')) {
return;
}
if (event.code === 'Space') {
event.preventDefault();
toggleStartPause();
} else if (event.key === 'r' || event.key === 'R') {
event.preventDefault();
resetTimer();
}
});
}

function init() {
loadPreferences();
bindEvents();
renderUI();
}

init();
})();
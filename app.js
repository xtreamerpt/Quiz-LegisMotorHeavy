/* ============================================================
   QUIZ MOTORISTA PESADOS — PWA App Logic
   ============================================================ */

const STORAGE_KEY = "quiz_pesados_highscores";
const THEME_KEY = "quiz_pesados_theme";
const THEMES = ["light", "dark", "ocean", "forest"];

let allQuestions = [];
let currentQuiz = [];
let currentIndex = 0;
let userAnswers = [];
let selectedDifficulty = "todas";
let numQuestions = 10;
let timeLimitMin = 0;
let timerInterval = null;
let timeLeftSec = 0;
let quizStartTime = 0;

// DOM
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const screens = {
  home: $("#screen-home"),
  quiz: $("#screen-quiz"),
  results: $("#screen-results"),
  scores: $("#screen-scores"),
};

// ============================================================
// INIT
// ============================================================
async function init() {
  loadTheme();
  await loadQuestions();
  updateHomeStats();
  bindEvents();
  registerSW();
}

async function loadQuestions() {
  try {
    const res = await fetch("banco_perguntas.json");
    if (!res.ok) throw new Error("Ficheiro não encontrado");
    const data = await res.json();
    allQuestions = data.perguntas || [];
    $("#total-perguntas").textContent = allQuestions.length;
  } catch (e) {
    console.error(e);
    showToast("Erro ao carregar perguntas. Verifica o ficheiro JSON.");
    allQuestions = [];
  }
}

function loadTheme() {
  const saved = localStorage.getItem(THEME_KEY) || "light";
  document.documentElement.setAttribute("data-theme", saved);
  updateThemeIcon(saved);
}

function updateThemeIcon(theme) {
  const icons = { light: "🌙", dark: "☀️", ocean: "🌊", forest: "🌲" };
  const btn = $("#btn-theme .theme-icon");
  if (btn) btn.textContent = icons[theme] || "🌙";
}

function cycleTheme() {
  const current = document.documentElement.getAttribute("data-theme") || "light";
  const idx = THEMES.indexOf(current);
  const next = THEMES[(idx + 1) % THEMES.length];
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem(THEME_KEY, next);
  updateThemeIcon(next);
  showToast(`Tema: ${next.charAt(0).toUpperCase() + next.slice(1)}`);
}

// ============================================================
// EVENTS
// ============================================================
function bindEvents() {
  // Theme
  $("#btn-theme").addEventListener("click", cycleTheme);

  // Difficulty
  $$("#difficulty-group .seg-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$("#difficulty-group .seg-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      selectedDifficulty = btn.dataset.value;
    });
  });

  // Time
  $$("#time-group .seg-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$("#time-group .seg-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      timeLimitMin = parseInt(btn.dataset.value, 10);
    });
  });

  // Range
  const range = $("#num-questions");
  range.addEventListener("input", () => {
    numQuestions = parseInt(range.value, 10);
    $("#num-label").textContent = numQuestions;
  });

  // Start
  $("#btn-start").addEventListener("click", startQuiz);

  // Next
  $("#btn-next").addEventListener("click", nextQuestion);

  // Results
  $("#btn-again").addEventListener("click", () => showScreen("home"));
  $("#btn-review").addEventListener("click", toggleReview);

  // Scores
  $("#btn-scores").addEventListener("click", () => {
    renderScores();
    showScreen("scores");
  });
  $("#btn-back-home").addEventListener("click", () => showScreen("home"));
  $("#btn-clear-scores").addEventListener("click", clearScores);
}

// ============================================================
// SCREEN NAV
// ============================================================
function showScreen(name) {
  Object.values(screens).forEach((s) => s.classList.remove("active"));
  screens[name].classList.add("active");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ============================================================
// QUIZ LOGIC
// ============================================================
function startQuiz() {
  if (!allQuestions.length) {
    showToast("Ainda não há perguntas carregadas.");
    return;
  }

  let pool = [...allQuestions];
  if (selectedDifficulty !== "todas") {
    pool = pool.filter((q) => q.dificuldade === selectedDifficulty);
  }

  if (pool.length < numQuestions) {
    showToast(`Só existem ${pool.length} perguntas nesta dificuldade. Ajustei o número.`);
    numQuestions = Math.max(1, pool.length);
  }

  // Shuffle & pick
  currentQuiz = shuffle(pool).slice(0, numQuestions);
  currentIndex = 0;
  userAnswers = new Array(currentQuiz.length).fill(null);
  quizStartTime = Date.now();

  // Timer
  clearInterval(timerInterval);
  if (timeLimitMin > 0) {
    timeLeftSec = timeLimitMin * 60;
    $("#timer").classList.remove("hidden", "warning", "danger");
    updateTimerDisplay();
    timerInterval = setInterval(tickTimer, 1000);
  } else {
    $("#timer").classList.add("hidden");
  }

  showScreen("quiz");
  renderQuestion();
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function renderQuestion() {
  const q = currentQuiz[currentIndex];
  const card = $("#question-card");
  card.style.animation = "none";
  card.offsetHeight; // reflow
  card.style.animation = "slideIn 0.35s ease";

  $("#q-badge").textContent = `${q.modulo} · ${q.dificuldade}`;
  $("#q-text").textContent = q.pergunta;
  $("#q-counter").textContent = `${currentIndex + 1} / ${currentQuiz.length}`;

  const pct = ((currentIndex) / currentQuiz.length) * 100;
  $("#progress-bar").style.width = `${pct}%`;

  const optionsEl = $("#options");
  optionsEl.innerHTML = "";
  const letters = ["A", "B", "C", "D"];

  q.opcoes.forEach((op, i) => {
    const btn = document.createElement("button");
    btn.className = "option-btn";
    btn.innerHTML = `<span class="letter">${letters[i]}</span><span>${op}</span>`;
    btn.addEventListener("click", () => selectOption(i, btn));
    optionsEl.appendChild(btn);
  });

  $("#btn-next").disabled = true;
  $("#btn-next").textContent = currentIndex === currentQuiz.length - 1 ? "Terminar" : "Seguinte";
}

function selectOption(index, btn) {
  // Deselect previous
  $$(".option-btn").forEach((b) => b.classList.remove("selected"));
  btn.classList.add("selected");
  userAnswers[currentIndex] = index;
  $("#btn-next").disabled = false;
}

function nextQuestion() {
  if (userAnswers[currentIndex] === null) return;

  if (currentIndex < currentQuiz.length - 1) {
    currentIndex++;
    renderQuestion();
  } else {
    finishQuiz();
  }
}

function tickTimer() {
  timeLeftSec--;
  updateTimerDisplay();
  if (timeLeftSec <= 0) {
    clearInterval(timerInterval);
    showToast("Tempo esgotado!");
    finishQuiz();
  }
}

function updateTimerDisplay() {
  const m = Math.floor(timeLeftSec / 60);
  const s = timeLeftSec % 60;
  const el = $("#timer");
  el.textContent = `⏱ ${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  el.classList.remove("warning", "danger");
  if (timeLeftSec <= 60) el.classList.add("danger");
  else if (timeLeftSec <= 180) el.classList.add("warning");
}

function finishQuiz() {
  clearInterval(timerInterval);
  const elapsed = Math.round((Date.now() - quizStartTime) / 1000);

  let correct = 0;
  const wrongs = [];

  currentQuiz.forEach((q, i) => {
    if (userAnswers[i] === q.resposta_correta) {
      correct++;
    } else {
      wrongs.push({
        pergunta: q.pergunta,
        opcoes: q.opcoes,
        user: userAnswers[i],
        correct: q.resposta_correta,
        explicacao: q.explicacao,
        referencia: q.referencia_legal || "",
      });
    }
  });

  const total = currentQuiz.length;
  const percent = Math.round((correct / total) * 100);

  // Save highscore
  saveScore({
    date: new Date().toISOString(),
    correct,
    total,
    percent,
    difficulty: selectedDifficulty,
    timeLimit: timeLimitMin,
    elapsed,
  });

  // UI
  $("#score-percent").textContent = `${percent}%`;
  $("#score-detail").textContent = `${correct}/${total}`;
  $("#results-title").textContent =
    percent === 100 ? "Perfeito! 🎉" :
    percent >= 80 ? "Excelente!" :
    percent >= 60 ? "Bom trabalho" :
    percent >= 40 ? "Continua a estudar" : "Precisas de treinar mais";

  $("#results-sub").textContent =
    timeLimitMin > 0
      ? `Tempo usado: ${formatTime(elapsed)} · Limite: ${timeLimitMin} min`
      : `Tempo total: ${formatTime(elapsed)}`;

  // Animate circle
  const circle = $("#score-circle");
  const offset = 283 - (283 * percent) / 100;
  setTimeout(() => {
    circle.style.strokeDashoffset = offset;
    circle.style.stroke = percent >= 70 ? "var(--success)" : percent >= 40 ? "#f59e0b" : "var(--danger)";
  }, 100);

  // Review data
  window._lastWrongs = wrongs;
  $("#review-panel").classList.add("hidden");
  $("#btn-review").textContent = wrongs.length ? `Rever erros (${wrongs.length})` : "Sem erros!";
  $("#btn-review").disabled = wrongs.length === 0;

  updateHomeStats();
  showScreen("results");
}

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

function toggleReview() {
  const panel = $("#review-panel");
  if (!panel.classList.contains("hidden")) {
    panel.classList.add("hidden");
    return;
  }

  const wrongs = window._lastWrongs || [];
  if (!wrongs.length) return;

  const letters = ["A", "B", "C", "D"];
  panel.innerHTML = wrongs
    .map((w, i) => {
      const opts = w.opcoes
        .map((op, idx) => {
          let cls = "review-option";
          if (idx === w.correct) cls += " correct";
          if (idx === w.user && idx !== w.correct) cls += " user-wrong";
          return `<div class="${cls}">${letters[idx]}) ${op}</div>`;
        })
        .join("");
      return `
        <div class="review-item">
          <h4>${i + 1}. ${w.pergunta}</h4>
          ${opts}
          <div class="review-explanation">
            ${w.explicacao}
            ${w.referencia ? `<br><small>📖 ${w.referencia}</small>` : ""}
          </div>
        </div>`;
    })
    .join("");

  panel.classList.remove("hidden");
  panel.scrollIntoView({ behavior: "smooth" });
}

// ============================================================
// HIGHSCORES
// ============================================================
function getScores() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveScore(entry) {
  const scores = getScores();
  scores.push(entry);
  scores.sort((a, b) => b.percent - a.percent || a.elapsed - b.elapsed);
  // Keep top 50
  localStorage.setItem(STORAGE_KEY, JSON.stringify(scores.slice(0, 50)));
}

function renderScores() {
  const list = $("#scores-list");
  const scores = getScores();

  if (!scores.length) {
    list.innerHTML = `<div class="empty-scores">Ainda não há resultados.<br>Faz o teu primeiro teste!</div>`;
    return;
  }

  list.innerHTML = scores
    .map((s, i) => {
      const date = new Date(s.date).toLocaleDateString("pt-PT", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      const diffLabel =
        s.difficulty === "todas" ? "Todas" :
        s.difficulty === "facil" ? "Fácil" :
        s.difficulty === "intermedio" ? "Intermédio" : "Avançado";
      const timeLabel = s.timeLimit ? ` · ${s.timeLimit}min` : "";
      return `
        <div class="score-row">
          <span class="score-rank">#${i + 1}</span>
          <div class="score-info">
            <div class="main">${s.correct}/${s.total} acertos</div>
            <div class="meta">${date} · ${diffLabel}${timeLabel}</div>
          </div>
          <span class="score-pct">${s.percent}%</span>
        </div>`;
    })
    .join("");
}

function clearScores() {
  if (confirm("Tens a certeza que queres apagar todos os highscores?")) {
    localStorage.removeItem(STORAGE_KEY);
    renderScores();
    updateHomeStats();
    showToast("Highscores apagados");
  }
}

function updateHomeStats() {
  const scores = getScores();
  $("#tests-done").textContent = scores.length;
  if (scores.length) {
    const best = Math.max(...scores.map((s) => s.percent));
    $("#best-score").textContent = `${best}%`;
  } else {
    $("#best-score").textContent = "—";
  }
}

// ============================================================
// TOAST
// ============================================================
let toastTimeout;
function showToast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => t.classList.remove("show"), 2800);
}

// ============================================================
// SERVICE WORKER
// ============================================================
function registerSW() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

// Start
init();

const state = {
  tab: "learn",
  notes: [],
  activeNoteId: null,
  quiz: [],
  answers: new Map(),
  index: 0,
  sessions: [],
  selectedSession: null,
  wikiResults: []
};

const $ = (id) => document.getElementById(id);

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...options
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Request failed");
  return payload;
}

function percent(value) {
  return `${Math.round(Number(value || 0) * 100)}%`;
}

function shortDate(timestamp) {
  if (!timestamp) return "";
  return new Date(timestamp * 1000).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function activeNote() {
  return state.notes.find((note) => note.id === state.activeNoteId) || state.notes[0] || null;
}

function setTab(tab) {
  state.tab = tab;
  document.querySelectorAll(".tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tab);
  });
  document.querySelectorAll(".view").forEach((view) => {
    view.classList.toggle("active", view.id === `${tab}View`);
  });
  if (tab === "quizzes") loadSessions();
}

function selectNote(noteId) {
  state.activeNoteId = noteId;
  state.quiz = [];
  state.answers.clear();
  state.index = 0;
  render();
}

function renderNoteButtons(containerId) {
  const container = $(containerId);
  if (!container) return;

  if (state.notes.length === 0) {
    container.innerHTML = `<div class="empty">No notes yet. Add one from the Notes tab.</div>`;
    return;
  }

  container.innerHTML = state.notes.map((note) => {
    const isActive = note.id === state.activeNoteId;
    const status = note.status === "ready"
      ? `${note.questionCount} questions`
      : note.status === "building"
        ? "Building quiz bank"
        : "Needs quiz bank";
    return `
      <button class="note-card ${isActive ? "active" : ""}" data-note-id="${escapeHTML(note.id)}">
        <strong>${escapeHTML(note.title)}</strong>
        <span>${escapeHTML(status)} · ${percent(note.averageScore)} understanding</span>
      </button>
    `;
  }).join("");

  container.querySelectorAll("[data-note-id]").forEach((button) => {
    button.addEventListener("click", () => selectNote(button.dataset.noteId));
  });
}

function renderActiveNote() {
  const note = activeNote();
  if (!note) {
    $("activeTitle").textContent = "Choose a note";
    $("activeSummary").textContent = "Add notes, build questions, then start a quiz.";
    $("questionCount").textContent = "0";
    $("attemptCount").textContent = "0";
    $("understandingScore").textContent = "0%";
    $("buildButton").disabled = true;
    $("startQuizButton").disabled = true;
    $("quizArea").innerHTML = `<div class="empty">Your learning session will appear here.</div>`;
    return;
  }

  $("activeTitle").textContent = note.title;
  $("activeSummary").textContent = note.summary || "Build a quiz bank to let Gemma deconstruct this note into useful checks.";
  $("questionCount").textContent = note.questionCount;
  $("attemptCount").textContent = note.attemptCount;
  $("understandingScore").textContent = percent(note.averageScore);

  $("buildButton").disabled = note.status === "building";
  $("buildButton").textContent = note.status === "building" ? "Building..." : note.questionCount > 0 ? "Rebuild Quiz Bank" : "Build Quiz Bank";
  $("startQuizButton").disabled = note.status !== "ready" || note.questionCount === 0;
}

function renderQuiz() {
  const area = $("quizArea");
  if (state.quiz.length === 0) {
    const note = activeNote();
    if (!note) return;
    area.innerHTML = note.questionCount > 0
      ? `<div class="empty">Start a quiz when you are ready.</div>`
      : `<div class="empty">Build the quiz bank first. Gemma will create questions directly from this note.</div>`;
    return;
  }

  const question = state.quiz[state.index];
  const selected = state.answers.get(question.id) || "";
  area.innerHTML = `
    <article class="question-card">
      <div class="question-topline">
        <span>Question ${state.index + 1} of ${state.quiz.length}</span>
        <span>${escapeHTML(question.topic)}</span>
      </div>
      <p class="hierarchy">${escapeHTML(question.subtopic)}</p>
      <h3 class="prompt">${escapeHTML(question.prompt)}</h3>
      <div class="choices">
        ${question.choices.map((choice) => `
          <button class="choice ${choice === selected ? "selected" : ""}" data-choice="${escapeHTML(choice)}">
            ${escapeHTML(choice)}
          </button>
        `).join("")}
      </div>
      <div class="quiz-nav">
        <span class="muted">${selected ? "Answer saved" : "Choose one answer"}</span>
        <button id="nextQuestionButton" ${selected ? "" : "disabled"}>
          ${state.index === state.quiz.length - 1 ? "Grade Quiz" : "Next"}
        </button>
      </div>
    </article>
  `;

  area.querySelectorAll("[data-choice]").forEach((button) => {
    button.addEventListener("click", () => {
      state.answers.set(question.id, button.dataset.choice);
      renderQuiz();
    });
  });

  $("nextQuestionButton").addEventListener("click", () => {
    if (state.index === state.quiz.length - 1) {
      submitQuiz();
      return;
    }
    state.index += 1;
    renderQuiz();
  });
}

function renderQuizResult(result) {
  const nextQuizText = result.nextQuiz?.status === "preparing"
    ? "Accordian is preparing fresh follow-up questions in the background."
    : result.nextQuiz?.status === "already_preparing"
      ? "Fresh follow-up questions are already being prepared."
      : "Your results were saved for the next quiz.";
  $("quizArea").innerHTML = `
    <article class="result-card">
      <p class="eyebrow">Quiz graded</p>
      <h2>${percent(result.score)}</h2>
      <p class="muted">Saved to quiz history. ${escapeHTML(nextQuizText)}</p>
      <div class="result-actions">
        <button id="reviewLatestButton">Review Answers</button>
        <button id="takeAnotherButton" class="secondary">Take Another</button>
      </div>
    </article>
  `;

  $("reviewLatestButton").addEventListener("click", async () => {
    setTab("quizzes");
    await loadSessions();
    await loadSessionDetail(result.id);
  });
  $("takeAnotherButton").addEventListener("click", startQuiz);
}

function renderNotes() {
  renderNoteButtons("learnNotesList");
  renderNoteButtons("notesList");
  renderWikiResults();
}

function renderSessions() {
  const list = $("historyList");
  if (state.sessions.length === 0) {
    list.innerHTML = `<div class="empty">No quizzes yet. Take a quiz and it will appear here.</div>`;
  } else {
    list.innerHTML = state.sessions.map((session) => `
      <button class="history-row" data-session-id="${escapeHTML(session.id)}">
        <span>
          <strong>${escapeHTML(session.noteTitle)}</strong>
          <small>${escapeHTML(shortDate(session.createdAt))}</small>
        </span>
        <b>${percent(session.score)}</b>
      </button>
    `).join("");
    list.querySelectorAll("[data-session-id]").forEach((button) => {
      button.addEventListener("click", () => loadSessionDetail(button.dataset.sessionId));
    });
  }

  if (!state.selectedSession) {
    $("sessionDetail").innerHTML = `
      <h2>Select a quiz</h2>
      <p class="muted">Tap any quiz to view your answers, correct answers, and feedback.</p>
    `;
  }
}

function renderSessionDetail() {
  const session = state.selectedSession;
  if (!session) {
    renderSessions();
    return;
  }

  $("sessionDetail").innerHTML = `
    <div class="session-heading">
      <div>
        <p class="eyebrow">${escapeHTML(session.noteTitle)}</p>
        <h2>${percent(session.score)}</h2>
        <p class="muted">${escapeHTML(shortDate(session.createdAt))}</p>
      </div>
    </div>
    <div class="attempt-list">
      ${session.attempts.map((attempt, index) => `
        <article class="attempt-card ${attempt.score >= 1 ? "correct" : "missed"}">
          <div class="question-topline">
            <span>${index + 1}. ${escapeHTML(attempt.topic)}</span>
            <span>${attempt.score >= 1 ? "Correct" : "Review"}</span>
          </div>
          <p class="hierarchy">${escapeHTML(attempt.subtopic)}</p>
          <h3>${escapeHTML(attempt.prompt)}</h3>
          <dl>
            <div>
              <dt>You</dt>
              <dd>${escapeHTML(attempt.response || "No answer")}</dd>
            </div>
            <div>
              <dt>Answer</dt>
              <dd>${escapeHTML(attempt.answer)}</dd>
            </div>
            <div>
              <dt>Feedback</dt>
              <dd>${escapeHTML(attempt.feedback || "Saved.")}</dd>
            </div>
          </dl>
        </article>
      `).join("")}
    </div>
  `;
}

function renderWikiResults() {
  const container = $("wikiResults");
  if (!container) return;

  if (state.wikiResults.length === 0) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = state.wikiResults.map((result) => `
    <article class="wiki-result">
      <div>
        <h3>${escapeHTML(result.title)}</h3>
        <p>${escapeHTML(result.snippet || "Wikipedia article")}</p>
      </div>
      <button type="button" data-wiki-title="${escapeHTML(result.title)}">Import</button>
    </article>
  `).join("");

  container.querySelectorAll("[data-wiki-title]").forEach((button) => {
    button.addEventListener("click", () => importWikipedia(button.dataset.wikiTitle));
  });
}

function render() {
  if (!state.activeNoteId && state.notes.length > 0) {
    state.activeNoteId = state.notes[0].id;
  }
  renderNotes();
  renderActiveNote();
  renderQuiz();
  renderSessions();
}

async function loadNotes() {
  const payload = await api("/api/notes");
  state.notes = payload.notes || [];
  if (!state.notes.some((note) => note.id === state.activeNoteId)) {
    state.activeNoteId = state.notes[0]?.id || null;
  }
  render();
}

async function loadSessions() {
  const payload = await api("/api/quizzes");
  state.sessions = payload.sessions || [];
  renderSessions();
}

async function loadSessionDetail(sessionId) {
  const payload = await api(`/api/quiz-sessions/${encodeURIComponent(sessionId)}`);
  state.selectedSession = payload.session;
  renderSessionDetail();
}

async function saveNote(event) {
  event.preventDefault();
  const title = $("noteTitle").value.trim() || "Untitled Note";
  const body = $("noteBody").value.trim();
  if (!body) return;

  const button = event.submitter;
  button.disabled = true;
  button.textContent = "Saving...";
  try {
    const payload = await api("/api/notes", {
      method: "POST",
      body: JSON.stringify({ title, body })
    });
    state.activeNoteId = payload.note.id;
    $("noteTitle").value = "";
    $("noteBody").value = "";
    await loadNotes();
    setTab("learn");
  } finally {
    button.disabled = false;
    button.textContent = "Save Note";
  }
}

async function searchWikipedia() {
  const query = $("wikiQuery").value.trim();
  if (query.length < 2) return;

  $("wikiSearchButton").disabled = true;
  $("wikiSearchButton").textContent = "Searching...";
  $("wikiResults").innerHTML = `<div class="empty">Searching Wikipedia...</div>`;
  try {
    const payload = await api(`/api/wiki/search?q=${encodeURIComponent(query)}`);
    state.wikiResults = payload.results || [];
    if (state.wikiResults.length === 0) {
      $("wikiResults").innerHTML = `<div class="empty">No articles found.</div>`;
    } else {
      renderWikiResults();
    }
  } catch (error) {
    $("wikiResults").innerHTML = `<div class="error">${escapeHTML(error.message)}</div>`;
  } finally {
    $("wikiSearchButton").disabled = false;
    $("wikiSearchButton").textContent = "Search";
  }
}

async function importWikipedia(title) {
  $("wikiResults").innerHTML = `<div class="empty">Importing ${escapeHTML(title)}...</div>`;
  try {
    const payload = await api("/api/wiki/import", {
      method: "POST",
      body: JSON.stringify({ title })
    });
    state.activeNoteId = payload.note.id;
    state.wikiResults = [];
    $("wikiQuery").value = "";
    await loadNotes();
    setTab("learn");
  } catch (error) {
    $("wikiResults").innerHTML = `<div class="error">${escapeHTML(error.message)}</div>`;
  }
}

async function buildQuizBank() {
  const note = activeNote();
  if (!note) return;
  $("buildButton").disabled = true;
  $("buildButton").textContent = "Building...";
  $("quizArea").innerHTML = `<div class="empty">Gemma is reading the note and creating the quiz bank.</div>`;
  try {
    await api(`/api/notes/${encodeURIComponent(note.id)}/build`, { method: "POST" });
    await loadNotes();
  } catch (error) {
    $("quizArea").innerHTML = `<div class="error">${escapeHTML(error.message)}</div>`;
    await loadNotes();
  }
}

async function startQuiz() {
  const note = activeNote();
  if (!note) return;
  $("startQuizButton").disabled = true;
  $("quizArea").innerHTML = `<div class="empty">Preparing quiz...</div>`;
  try {
    const payload = await api(`/api/notes/${encodeURIComponent(note.id)}/quiz`);
    state.quiz = payload.questions || [];
    state.answers.clear();
    state.index = 0;
    renderQuiz();
  } finally {
    $("startQuizButton").disabled = false;
  }
}

async function submitQuiz() {
  const note = activeNote();
  if (!note) return;
  $("quizArea").innerHTML = `<div class="empty">Grading quiz...</div>`;
  const answers = state.quiz.map((question) => ({
    questionId: question.id,
    variantId: question.variantId || "",
    response: state.answers.get(question.id) || ""
  }));
  const result = await api(`/api/notes/${encodeURIComponent(note.id)}/quiz`, {
    method: "POST",
    body: JSON.stringify({ answers })
  });
  state.quiz = [];
  state.answers.clear();
  await loadNotes();
  await loadSessions();
  renderQuizResult(result);
}

async function checkModel() {
  try {
    const model = await api("/api/model");
    $("modelStatus").textContent = `${model.model} via ${model.mode}`;
  } catch {
    $("modelStatus").textContent = "Model status unavailable";
  }
}

document.querySelectorAll(".tab").forEach((button) => {
  button.addEventListener("click", () => setTab(button.dataset.tab));
});
$("noteForm").addEventListener("submit", saveNote);
$("buildButton").addEventListener("click", buildQuizBank);
$("startQuizButton").addEventListener("click", startQuiz);
$("refreshButton").addEventListener("click", loadNotes);
$("wikiSearchButton").addEventListener("click", searchWikipedia);
$("wikiQuery").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    searchWikipedia();
  }
});

checkModel();
loadNotes();
loadSessions();

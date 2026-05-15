const STORAGE_KEY = "accordian.web.state.v1";

function loadStoredState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

const storedState = loadStoredState();

const state = {
  tab: storedState.tab || "learn",
  notes: [],
  activeNoteId: storedState.activeNoteId || null,
  quiz: Array.isArray(storedState.quiz) ? storedState.quiz : [],
  quizNoteId: storedState.quizNoteId || storedState.activeNoteId || null,
  quizStartedAt: Number(storedState.quizStartedAt || 0),
  answers: new Map(Object.entries(storedState.answers || {})),
  index: Number(storedState.index || 0),
  sessions: [],
  selectedSession: null,
  wikiResults: [],
  noteDraft: storedState.noteDraft || { title: "", body: "" },
  noteSourceMode: storedState.noteSourceMode || "text",
  mathTemplateApplied: Boolean(storedState.mathTemplateApplied),
  mathTemplateKey: storedState.mathTemplateKey || "blank",
  editorMode: storedState.editorMode || "edit",
  editingNoteId: storedState.editingNoteId || null,
  libraryMode: storedState.libraryMode || "list",
  historyMode: storedState.historyMode || "list",
  waitingForNextQuizNoteId: storedState.waitingForNextQuizNoteId || null,
  journeyCompleteNoteId: storedState.journeyCompleteNoteId || null,
  prepState: storedState.prepState || null
};

const $ = (id) => document.getElementById(id);

function saveLocalState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    tab: state.tab,
    activeNoteId: state.activeNoteId,
    quiz: state.quiz,
    quizNoteId: state.quizNoteId,
    quizStartedAt: state.quizStartedAt,
    answers: Object.fromEntries(state.answers),
    index: state.index,
    noteDraft: state.noteDraft,
    noteSourceMode: state.noteSourceMode,
    mathTemplateApplied: state.mathTemplateApplied,
    mathTemplateKey: state.mathTemplateKey,
    editorMode: state.editorMode,
    editingNoteId: state.editingNoteId,
    libraryMode: state.libraryMode,
    historyMode: state.historyMode,
    waitingForNextQuizNoteId: state.waitingForNextQuizNoteId,
    journeyCompleteNoteId: state.journeyCompleteNoteId,
    prepState: state.prepState
  }));
}

function clearStoredQuiz() {
  state.quiz = [];
  state.quizNoteId = null;
  state.quizStartedAt = 0;
  state.answers.clear();
  state.index = 0;
  saveLocalState();
}

function setPrepState(noteId, message) {
  state.waitingForNextQuizNoteId = noteId;
  state.prepState = {
    noteId,
    status: "preparing",
    message,
    startedAt: Date.now()
  };
  saveLocalState();
}

function clearPrepState(noteId = null) {
  if (!noteId || state.prepState?.noteId === noteId) {
    state.prepState = null;
  }
  if (!noteId || state.waitingForNextQuizNoteId === noteId) {
    state.waitingForNextQuizNoteId = null;
  }
  saveLocalState();
}

function prepElapsedText() {
  const startedAt = Number(state.prepState?.startedAt || 0);
  if (!startedAt) return "";
  const seconds = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

function quizSkeletonHTML(title, detail = "") {
  return `
    <div class="skeleton-card" aria-busy="true">
      <div class="skeleton-header">
        <span class="skeleton-line tiny"></span>
        <span class="skeleton-pill"></span>
      </div>
      <span class="skeleton-line title"></span>
      <span class="skeleton-line wide"></span>
      <div class="skeleton-options">
        <span class="skeleton-option"></span>
        <span class="skeleton-option"></span>
        <span class="skeleton-option"></span>
        <span class="skeleton-option"></span>
      </div>
      <div class="skeleton-footer">
        <strong>${escapeHTML(title)}</strong>
        ${detail ? `<span>${escapeHTML(detail)}</span>` : ""}
      </div>
    </div>
  `;
}

function compactPrepHTML(title, detail = "") {
  return `
    <div class="prep-line" aria-busy="true">
      <span class="status-dot" aria-hidden="true"></span>
      <div>
        <strong>${escapeHTML(title)}</strong>
        ${detail ? `<p>${escapeHTML(detail)}</p>` : ""}
      </div>
    </div>
  `;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...options
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Request failed");
  return payload;
}

function logAction(actionType, payload = {}) {
  fetch("/api/actions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      noteId: payload.noteId || state.activeNoteId || null,
      actionType,
      objectType: payload.objectType || "",
      objectId: payload.objectId || "",
      payload
    })
  }).catch(() => {});
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

function reconcileJourneyState() {
  if (!state.journeyCompleteNoteId) return;
  const completedNote = state.notes.find((note) => note.id === state.journeyCompleteNoteId);
  if (!completedNote || completedNote.queuedQuizCount > 0 || completedNote.status === "building") {
    state.journeyCompleteNoteId = null;
  }
}

function setTab(tab) {
  state.tab = tab;
  syncBodyModes();
  document.querySelectorAll(".tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tab);
  });
  document.querySelectorAll(".view").forEach((view) => {
    view.classList.toggle("active", view.id === `${tab}View`);
  });
  if (tab === "quizzes") loadSessions();
  saveLocalState();
  logAction("ui.tab.selected", { tab });
}

function syncBodyModes() {
  document.body.classList.toggle("library-editor", state.tab === "notes" && state.libraryMode === "editor");
  document.body.classList.toggle("note-editor-new", state.tab === "notes" && state.editorMode === "new");
  document.body.classList.toggle("history-detail", state.tab === "quizzes" && state.historyMode === "detail");
}

function selectNote(noteId) {
  if (!noteId) return;
  const isSelected = state.tab === "notes"
    && state.libraryMode === "editor"
    && state.editorMode === "edit"
    && state.editingNoteId === noteId;
  if (isSelected) {
    deselectNote(noteId);
    return;
  }
  state.activeNoteId = noteId;
  state.editorMode = "edit";
  state.editingNoteId = noteId;
  state.libraryMode = "editor";
  if (state.quizNoteId !== noteId) {
    clearStoredQuiz();
  }
  populateNoteEditor();
  render();
  logAction("ui.note.selected", { noteId, objectType: "note", objectId: noteId });
}

function deselectNote(noteId) {
  state.editorMode = "new";
  state.editingNoteId = null;
  state.libraryMode = "list";
  state.noteDraft = { title: "", body: "" };
  state.noteSourceMode = "text";
  state.wikiResults = [];
  populateNoteEditor();
  renderWikiResults();
  renderNotes();
  syncBodyModes();
  saveLocalState();
  logAction("ui.note.deselected", { noteId, objectType: "note", objectId: noteId });
}

function renderJourneySelect() {
  const select = $("journeySelect");
  if (!select) return;

  if (state.notes.length === 0) {
    select.innerHTML = `<option value="">No journeys yet</option>`;
    select.disabled = true;
    return;
  }

  select.disabled = false;
  select.innerHTML = state.notes.map((note) => {
    const suffix = note.queuedQuizCount > 0 ? "quiz ready" : note.status === "building" ? "preparing" : "saved";
    return `<option value="${escapeHTML(note.id)}">${escapeHTML(note.title)} · ${escapeHTML(suffix)}</option>`;
  }).join("");
  select.value = activeNote()?.id || state.notes[0]?.id || "";
}

function populateNoteEditor() {
  const note = state.editorMode === "new"
    ? null
    : state.notes.find((candidate) => candidate.id === state.editingNoteId) || activeNote();
  if (!$("noteTitle") || !$("noteBody")) return;
  if (!note) {
    if ($("editorTitle")) $("editorTitle").textContent = "Add Note";
    if ($("noteMenu")) $("noteMenu").hidden = true;
    $("noteSummaryBox").hidden = true;
    if ($("sourceChooser")) $("sourceChooser").hidden = false;
    updateSourceModeUI();
    $("noteTitle").value = state.noteDraft.title || "";
    $("noteBody").value = state.noteDraft.body || "";
    $("saveNoteButton").textContent = "Save Note";
    $("clearNoteButton").hidden = true;
    return;
  }
  if ($("editorTitle")) $("editorTitle").textContent = note.title || "Note";
  if ($("editorSubtitle")) $("editorSubtitle").textContent = "Source text";
  if ($("noteMenu")) $("noteMenu").hidden = false;
  if ($("sourceChooser")) $("sourceChooser").hidden = true;
  if ($("mathBox")) $("mathBox").hidden = true;
  $("noteSummaryBox").hidden = false;
  $("noteSummaryText").textContent = note.summary || (note.status === "building"
    ? "Gemma is reading this note now."
    : "No summary yet. Save or rebuild this note to generate one.");
  document.querySelector(".wiki-box")?.removeAttribute("open");
  document.querySelector(".wiki-box").hidden = true;
  $("noteTitle").value = note.title || "";
  $("noteBody").value = note.body || "";
  $("saveNoteButton").textContent = "Save Changes";
  $("clearNoteButton").hidden = true;
}

function clearNoteEditor() {
  state.editorMode = "new";
  state.editingNoteId = null;
  state.libraryMode = "editor";
  state.noteDraft = { title: "", body: "" };
  state.noteSourceMode = "text";
  state.mathTemplateApplied = false;
  state.mathTemplateKey = "blank";
  state.wikiResults = [];
  populateNoteEditor();
  renderWikiResults();
  renderNotes();
  syncBodyModes();
  saveLocalState();
}

function updateSourceModeUI() {
  const mode = state.noteSourceMode || "text";
  const copy = {
    text: {
      subtitle: "Paste any text stream.",
      title: "Note title",
      body: "Paste a text stream here"
    },
    wikipedia: {
      subtitle: "Search Wikipedia, import, then save.",
      title: "Article title",
      body: "Imported article text will appear here"
    },
    math: {
      subtitle: "Describe the concept, rules, examples, and practice goal.",
      title: "Math topic",
      body: "Add formulas, worked examples, and what feels confusing"
    }
  }[mode];

  if ($("editorSubtitle")) $("editorSubtitle").textContent = copy.subtitle;
  if ($("noteTitle")) $("noteTitle").placeholder = copy.title;
  if ($("noteBody")) $("noteBody").placeholder = copy.body;
  if ($("mathBox")) $("mathBox").hidden = mode !== "math";
  if ($("manualNoteFields")) $("manualNoteFields").hidden = mode === "wikipedia";
  if ($("saveNoteButton")) $("saveNoteButton").hidden = mode === "wikipedia";

  const wikiBox = document.querySelector(".wiki-box");
  if (wikiBox) {
    wikiBox.hidden = mode !== "wikipedia";
    if (mode === "wikipedia") wikiBox.setAttribute("open", "");
    else wikiBox.removeAttribute("open");
  }

  document.querySelectorAll("[data-source-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.sourceMode === mode);
  });
}

function setSourceMode(mode) {
  if (state.noteSourceMode === "math" && mode !== "math") {
    clearMathTemplateIfUnchanged();
  }
  state.noteSourceMode = mode;
  updateSourceModeUI();
  saveLocalState();
}

function mathTemplateTitle() {
  return mathTemplateTitleFor(state.mathTemplateKey || "blank");
}

function mathTemplateBody() {
  return mathTemplateBodyFor(state.mathTemplateKey || "blank");
}

function mathTemplateTitleFor(key) {
  const titles = {
    "clock-hands": "Finding the Angle Between Clock Hands",
    "linear-equations": "Solving Linear Equations",
    quadratics: "Solving Quadratic Equations",
    "percent-change": "Finding Percent Change",
    pythagorean: "Using the Pythagorean Theorem"
  };
  return titles[key] || "Math practice";
}

function mathTemplateBodyFor(key) {
  if (key === "clock-hands") {
    return [
      "## Math Topic: Finding the Angle Between Clock Hands",
      "",
      "### Concept:",
      "",
      "An analog clock is constantly moving.",
      "The minute hand moves faster than the hour hand, so the angle between them changes every minute.",
      "",
      "The goal is to calculate the smallest angle between the two hands at any given time.",
      "",
      "### Rules or formulas:",
      "",
      "The minute hand moves 360 degrees in 60 minutes.",
      "",
      "Minute Angle = 6 x minutes",
      "",
      "The hour hand moves 360 degrees in 12 hours, which is 30 degrees per hour.",
      "It also moves gradually as minutes pass.",
      "",
      "Hour Angle = 30 x hour + 0.5 x minutes",
      "",
      "Angle = absolute value of (Hour Angle - Minute Angle)",
      "",
      "Smallest Angle = min(Angle, 360 - Angle)",
      "",
      "Smallest Angle = min(|(30h + 0.5m) - 6m|, 360 - |(30h + 0.5m) - 6m|)",
      "",
      "### Worked example:",
      "",
      "Find the angle at 3:30.",
      "",
      "Minute hand:",
      "6 x 30 = 180 degrees",
      "",
      "Hour hand:",
      "30 x 3 + 0.5 x 30 = 90 + 15 = 105 degrees",
      "",
      "Difference:",
      "|180 - 105| = 75 degrees",
      "",
      "Final answer:",
      "75 degrees",
      "",
      "### Where I get stuck:",
      "",
      "- Remembering that the hour hand also moves during the hour",
      "- Forgetting to take the smaller angle",
      "- Mixing up which formula belongs to which hand",
      "- Using military time without converting to 12-hour format",
      "",
      "### What I want to practice:",
      "",
      "- Finding angles for random times like 7:45, 9:20, and 11:59",
      "- Writing a function to automate the calculation",
      "- Visualizing why the hour hand moves slowly",
      "- Solving the problem mentally without formulas"
    ].join("\n");
  }

  if (key === "linear-equations") {
    return [
      "## Math Topic: Solving Linear Equations",
      "",
      "### Concept:",
      "",
      "A linear equation has a variable, usually x, raised only to the first power.",
      "The goal is to isolate the variable so the equation tells us the value that makes both sides equal.",
      "",
      "### Rules or formulas:",
      "",
      "Whatever you do to one side of the equation, you must do to the other side.",
      "",
      "Use inverse operations:",
      "- Addition undoes subtraction",
      "- Subtraction undoes addition",
      "- Multiplication undoes division",
      "- Division undoes multiplication",
      "",
      "General goal:",
      "ax + b = c",
      "ax = c - b",
      "x = (c - b) / a",
      "",
      "### Worked example:",
      "",
      "Solve 3x + 5 = 20.",
      "",
      "Subtract 5 from both sides:",
      "3x = 15",
      "",
      "Divide both sides by 3:",
      "x = 5",
      "",
      "Check:",
      "3(5) + 5 = 20",
      "",
      "### Where I get stuck:",
      "",
      "- Forgetting to do the same operation to both sides",
      "- Mixing up inverse operations",
      "- Losing negative signs",
      "- Dividing before moving constants",
      "",
      "### What I want to practice:",
      "",
      "- One-step equations",
      "- Two-step equations like 4x - 7 = 21",
      "- Equations with negatives",
      "- Checking my answer by substituting it back in"
    ].join("\n");
  }

  if (key === "quadratics") {
    return [
      "## Math Topic: Solving Quadratic Equations",
      "",
      "### Concept:",
      "",
      "A quadratic equation has a squared variable, usually x^2.",
      "Quadratics can have two solutions, one solution, or no real solutions.",
      "",
      "### Rules or formulas:",
      "",
      "Standard form:",
      "ax^2 + bx + c = 0",
      "",
      "Factoring method:",
      "Find two numbers that multiply to c and add to b.",
      "",
      "Zero product property:",
      "If (x - r)(x - s) = 0, then x = r or x = s.",
      "",
      "Quadratic formula:",
      "x = (-b +/- sqrt(b^2 - 4ac)) / 2a",
      "",
      "Discriminant:",
      "b^2 - 4ac tells how many real solutions there are.",
      "",
      "### Worked example:",
      "",
      "Solve x^2 - 5x + 6 = 0.",
      "",
      "Factor:",
      "(x - 2)(x - 3) = 0",
      "",
      "Set each factor equal to zero:",
      "x - 2 = 0, so x = 2",
      "x - 3 = 0, so x = 3",
      "",
      "Final answer:",
      "x = 2 or x = 3",
      "",
      "### Where I get stuck:",
      "",
      "- Forgetting to set the equation equal to zero",
      "- Mixing up signs while factoring",
      "- Not knowing when to use the quadratic formula",
      "- Forgetting that there can be two answers",
      "",
      "### What I want to practice:",
      "",
      "- Factoring simple quadratics",
      "- Using the quadratic formula",
      "- Finding the discriminant",
      "- Checking both solutions"
    ].join("\n");
  }

  if (key === "percent-change") {
    return [
      "## Math Topic: Finding Percent Change",
      "",
      "### Concept:",
      "",
      "Percent change measures how much a value increases or decreases compared with the original value.",
      "It is useful for prices, grades, populations, statistics, and sports data.",
      "",
      "### Rules or formulas:",
      "",
      "Change = New Value - Original Value",
      "",
      "Percent Change = (Change / Original Value) x 100",
      "",
      "If the result is positive, it is a percent increase.",
      "If the result is negative, it is a percent decrease.",
      "",
      "### Worked example:",
      "",
      "A price goes from 80 dollars to 100 dollars.",
      "",
      "Change:",
      "100 - 80 = 20",
      "",
      "Percent change:",
      "(20 / 80) x 100 = 25%",
      "",
      "Final answer:",
      "25% increase",
      "",
      "### Where I get stuck:",
      "",
      "- Dividing by the new value instead of the original value",
      "- Forgetting to multiply by 100",
      "- Mixing up increase and decrease",
      "- Ignoring negative signs",
      "",
      "### What I want to practice:",
      "",
      "- Price increases",
      "- Price discounts",
      "- Grade improvements",
      "- Word problems where I must identify the original value"
    ].join("\n");
  }

  if (key === "pythagorean") {
    return [
      "## Math Topic: Using the Pythagorean Theorem",
      "",
      "### Concept:",
      "",
      "The Pythagorean theorem works only for right triangles.",
      "It relates the two legs of the triangle to the hypotenuse.",
      "",
      "### Rules or formulas:",
      "",
      "a^2 + b^2 = c^2",
      "",
      "a and b are the legs.",
      "c is the hypotenuse, which is always across from the right angle.",
      "",
      "To find the hypotenuse:",
      "c = sqrt(a^2 + b^2)",
      "",
      "To find a missing leg:",
      "a = sqrt(c^2 - b^2)",
      "",
      "### Worked example:",
      "",
      "A right triangle has legs 3 and 4. Find the hypotenuse.",
      "",
      "Use the formula:",
      "3^2 + 4^2 = c^2",
      "",
      "Calculate:",
      "9 + 16 = c^2",
      "25 = c^2",
      "c = 5",
      "",
      "Final answer:",
      "5",
      "",
      "### Where I get stuck:",
      "",
      "- Forgetting that c must be the hypotenuse",
      "- Using the formula on triangles that are not right triangles",
      "- Forgetting to take the square root",
      "- Adding when I should subtract to find a missing leg",
      "",
      "### What I want to practice:",
      "",
      "- Finding the hypotenuse",
      "- Finding a missing leg",
      "- Identifying the hypotenuse in diagrams",
      "- Recognizing common triples like 3-4-5 and 5-12-13"
    ].join("\n");
  }

  return [
    "Concept:",
    "",
    "Rules or formulas:",
    "",
    "Worked example:",
    "",
    "Where I get stuck:",
    "",
    "What I want to practice:"
  ].join("\n");
}

function applyMathTemplateByKey(key) {
  const previousTitle = mathTemplateTitle();
  const previousBody = mathTemplateBody();
  const canReplace = state.mathTemplateApplied
    && ($("noteTitle")?.value || "") === previousTitle
    && ($("noteBody")?.value || "") === previousBody;
  state.mathTemplateKey = key;
  applyMathTemplate({ replace: canReplace });
}

function clearMathTemplateIfUnchanged() {
  if (!state.mathTemplateApplied) return;
  if ($("noteTitle")?.value === mathTemplateTitle()) {
    $("noteTitle").value = "";
    state.noteDraft.title = "";
  }
  if ($("noteBody")?.value === mathTemplateBody()) {
    $("noteBody").value = "";
    state.noteDraft.body = "";
  }
  state.mathTemplateApplied = false;
}

function applyMathTemplate({ replace = false } = {}) {
  if ($("noteTitle") && (replace || !$("noteTitle").value.trim())) {
    $("noteTitle").value = mathTemplateTitle();
    state.noteDraft.title = $("noteTitle").value;
  }
  if ($("noteBody") && (replace || !$("noteBody").value.trim())) {
    $("noteBody").value = mathTemplateBody();
    state.noteDraft.body = $("noteBody").value;
  }
  state.mathTemplateApplied = true;
  $("noteBody")?.focus();
  saveLocalState();
}

function showNotesList() {
  state.libraryMode = "list";
  state.editingNoteId = null;
  syncBodyModes();
  renderNotes();
  saveLocalState();
}

function showHistoryList() {
  state.historyMode = "list";
  state.selectedSession = null;
  renderSessions();
  syncBodyModes();
  saveLocalState();
}

function renderNoteButtons(containerId) {
  const container = $(containerId);
  if (!container) return;

  if (state.notes.length === 0) {
    container.innerHTML = `<div class="empty">No journeys yet. Add text in Library.</div>`;
    return;
  }

  container.innerHTML = state.notes.map((note) => {
    const isActive = state.editorMode === "edit" && state.libraryMode === "editor" && note.id === state.editingNoteId;
    const statusType = note.queuedQuizCount > 0
      ? "ready"
      : note.status === "building"
        ? "pending"
        : note.status === "ready"
          ? "saved"
          : "idle";
    const status = note.queuedQuizCount > 0
      ? "Quiz ready"
      : note.status === "ready"
      ? `${note.questionCount} checks ready`
      : note.status === "building"
        ? "Reading note"
        : "Ready to build";
    const meta = note.attemptCount === 1 ? "1 check completed" : `${note.attemptCount} checks completed`;
    return `
      <div class="note-row ${isActive ? "active" : ""}">
        <button class="note-card" data-note-id="${escapeHTML(note.id)}">
          <span class="note-status-dot ${escapeHTML(statusType)}" aria-hidden="true"></span>
          <span class="note-card-copy">
            <strong>${escapeHTML(note.title)}</strong>
            <span>${escapeHTML(status)} · ${escapeHTML(meta)}</span>
          </span>
          <b class="note-understanding">${percent(note.averageScore)}</b>
        </button>
      </div>
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
    $("activeSummary").textContent = "Add a text stream in Library to begin.";
    $("questionCount").textContent = "No journey";
    $("noteStatusBanner").hidden = true;
    $("attemptCount").textContent = "0";
    $("attemptLabel").textContent = "checks completed";
    $("understandingScore").textContent = "0%";
    $("startQuizButton").disabled = false;
    $("startQuizButton").textContent = "Add Notes";
    $("startQuizButton").onclick = () => {
      clearNoteEditor();
      setTab("notes");
    };
    $("startQuizButton").hidden = false;
    $("quizArea").innerHTML = "";
    return;
  }

  $("startQuizButton").onclick = null;

  $("activeTitle").textContent = note.title;
  $("activeSummary").textContent = note.summary || "Accordian prepares quizzes automatically from this note.";
  $("questionCount").textContent = note.queuedQuizCount > 0
    ? "Quiz ready"
    : note.status === "building"
      ? "Preparing quiz"
      : `${note.questionCount} checks`;
  $("attemptCount").textContent = note.attemptCount;
  $("attemptLabel").textContent = note.attemptCount === 1 ? "check completed" : "checks completed";
  $("understandingScore").textContent = percent(note.averageScore);

  const isReading = note.status === "building" || state.waitingForNextQuizNoteId === note.id || state.prepState?.noteId === note.id;
  $("noteStatusBanner").hidden = !isReading;
  if (isReading) {
    $("noteStatusTitle").textContent = note.questionCount > 0 ? "Preparing next quiz" : "Reading note";
    $("noteStatusDetail").textContent = note.questionCount > 0
      ? "Using your history to shape fresh checks."
      : "Turning this text into topics and quiz checks.";
  }

  const journeyComplete = state.journeyCompleteNoteId === note.id;
  const hasReadyQuiz = note.queuedQuizCount > 0;
  const showJourneyComplete = journeyComplete && !hasReadyQuiz && note.status !== "building";
  const showingQuiz = state.quiz.length > 0 && state.quizNoteId === note.id;
  $("startQuizButton").hidden = showingQuiz;
  $("startQuizButton").disabled = !hasReadyQuiz || state.waitingForNextQuizNoteId === note.id || showJourneyComplete;
  $("startQuizButton").textContent = showJourneyComplete
    ? "Journey Complete"
    : !hasReadyQuiz && (note.status === "building" || state.waitingForNextQuizNoteId === note.id)
    ? "Preparing Quiz"
    : "Start Quiz";
}

function renderQuiz() {
  const area = $("quizArea");
  const note = activeNote();
  if (state.quiz.length > 0 && state.quizNoteId && note && state.quizNoteId !== note.id) {
    clearStoredQuiz();
  }
  const quizInProgress = state.quiz.length > 0;
  document.body.classList.toggle("quiz-active", quizInProgress);
  if (state.quiz.length === 0) {
    if (!note) return;
    if (state.journeyCompleteNoteId === note.id && note.queuedQuizCount === 0 && note.status !== "building") {
      area.innerHTML = `<div class="empty"><strong>Journey complete.</strong><br>Accordian has no fresh quiz set to serve from this note right now. Add more notes or rebuild the journey for harder checks.</div>`;
      return;
    }
    if (note.queuedQuizCount > 0) {
      area.innerHTML = "";
      return;
    }
    if (note.status === "building" || state.waitingForNextQuizNoteId === note.id || state.prepState?.noteId === note.id) {
      const message = state.prepState?.noteId === note.id
        ? state.prepState.message
        : "Accordian is using your last answers to unlock fresh or harder checks.";
      const elapsed = state.prepState?.noteId === note.id ? prepElapsedText() : "";
      area.innerHTML = compactPrepHTML(
        "Preparing your next quiz",
        elapsed ? `${message} · ${elapsed} elapsed` : message
      );
      return;
    }
    area.innerHTML = note.questionCount > 0
      ? compactPrepHTML("Preparing next quiz")
      : compactPrepHTML("Preparing first quiz");
    return;
  }

  const question = state.quiz[state.index];
  const selected = state.answers.get(question.id) || "";
  area.innerHTML = `
    <article class="question-card">
      <div class="question-topline">
        <span>Check ${state.index + 1} of ${state.quiz.length}</span>
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
          ${state.index === state.quiz.length - 1 ? "Grade" : "Next"}
        </button>
      </div>
    </article>
  `;

  area.querySelectorAll("[data-choice]").forEach((button) => {
    button.addEventListener("click", () => {
      state.answers.set(question.id, button.dataset.choice);
      saveLocalState();
      logAction("ui.answer.selected", {
        noteId: activeNote()?.id || null,
        objectType: "question",
        objectId: question.id,
        questionId: question.id,
        variantId: question.variantId || "",
        prompt: question.prompt,
        response: button.dataset.choice
      });
      renderQuiz();
      window.setTimeout(() => {
        if (state.index === state.quiz.length - 1) {
          submitQuiz();
          return;
        }
        state.index += 1;
        saveLocalState();
        renderQuiz();
      }, 220);
    });
  });

  $("nextQuestionButton").addEventListener("click", () => {
    if (state.index === state.quiz.length - 1) {
      submitQuiz();
      return;
    }
    state.index += 1;
    saveLocalState();
    renderQuiz();
  });
}

function renderQuizResult(result, options = {}) {
  const note = activeNote();
  const nextQuizStatus = result.nextQuiz?.status || "";
  const hasQueuedQuizNow = note?.id === result.noteId && Number(note.queuedQuizCount || 0) > 0;
  const stillPreparing = !hasQueuedQuizNow && (
    state.prepState?.noteId === result.noteId ||
    state.waitingForNextQuizNoteId === result.noteId ||
    ((nextQuizStatus === "preparing" || nextQuizStatus === "already_preparing") && note?.id === result.noteId && note.status === "building")
  );
  const nextQuizPreparing = !hasQueuedQuizNow && (stillPreparing || nextQuizStatus === "preparing" || nextQuizStatus === "already_preparing");
  const nextQuizText = nextQuizPreparing
    ? result.score >= 0.999
      ? "Perfect score. Accordian is unlocking harder checks in the background."
      : "Accordian is preparing fresh follow-up checks in the background."
    : hasQueuedQuizNow || nextQuizStatus === "ready"
      ? "Your next quiz is ready."
      : "Your results were saved for the next quiz.";
  $("quizArea").innerHTML = `
    <article class="result-card">
      <p class="eyebrow">${options.fromCache ? "Last quiz" : "Quiz graded"}</p>
      <h2>${percent(result.score)}</h2>
      <p class="muted">Saved to quiz history. ${escapeHTML(nextQuizText)}</p>
      ${result.learningEvidence?.summary ? `
        <div class="memory-evidence">
          <strong>Memory updated</strong>
          <span>${escapeHTML(result.learningEvidence.summary)}</span>
        </div>
      ` : ""}
      <div class="result-actions">
        <button id="reviewLatestButton">View Results</button>
        <button id="takeAnotherButton" class="secondary">Next Quiz</button>
      </div>
    </article>
  `;

  $("reviewLatestButton").addEventListener("click", async () => {
    setTab("quizzes");
    await loadSessions();
    await loadSessionDetail(result.id);
  });
  $("takeAnotherButton").disabled = nextQuizPreparing;
  $("takeAnotherButton").textContent = $("takeAnotherButton").disabled ? "Preparing..." : "Next Quiz";
  $("takeAnotherButton").addEventListener("click", startQuiz);
}

function renderNotes() {
  renderJourneySelect();
  renderNoteButtons("notesList");
  renderWikiResults();
}

function renderSessions() {
  const list = $("historyList");
  if (state.sessions.length === 0) {
    list.innerHTML = `<div class="empty">No quiz history yet.</div>`;
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
    state.historyMode = "list";
    $("sessionDetail").innerHTML = `
      <h2>Select a quiz</h2>
      <p class="muted">Tap any quiz to view your answers, correct answers, and feedback.</p>
    `;
  }
  syncBodyModes();
}

function renderSessionDetail() {
  const session = state.selectedSession;
  if (!session) {
    renderSessions();
    return;
  }

  $("sessionDetail").innerHTML = `
    <button type="button" id="backToHistoryButton" class="back-button">← History</button>
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
  $("backToHistoryButton").addEventListener("click", showHistoryList);
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
  if (state.index >= state.quiz.length) {
    state.index = Math.max(0, state.quiz.length - 1);
  }
  renderNotes();
  renderActiveNote();
  renderQuiz();
  renderSessions();
  syncBodyModes();
  saveLocalState();
}

async function loadNotes() {
  const payload = await api("/api/notes");
  state.notes = payload.notes || [];
  reconcileJourneyState();
  if (state.editingNoteId && !state.notes.some((note) => note.id === state.editingNoteId)) {
    state.editingNoteId = null;
    state.editorMode = "new";
  }
  if (!state.notes.some((note) => note.id === state.activeNoteId)) {
    state.activeNoteId = state.notes[0]?.id || null;
    if (!state.activeNoteId) {
      state.editorMode = "new";
      state.editingNoteId = null;
    }
    if (!state.activeNoteId) state.libraryMode = "editor";
  }
  const waitingNote = state.notes.find((note) => note.id === state.waitingForNextQuizNoteId);
  if (waitingNote && waitingNote.status !== "building") {
    state.waitingForNextQuizNoteId = null;
  }
  const prepNote = state.notes.find((note) => note.id === state.prepState?.noteId);
  if (prepNote && prepNote.status !== "building") {
    state.prepState = null;
  }
  const active = activeNote();
  if (active?.status === "building" && !state.prepState && state.waitingForNextQuizNoteId === active.id) {
    state.prepState = {
      noteId: active.id,
      status: "preparing",
      message: "Accordian is preparing your next quiz.",
      startedAt: Date.now()
    };
  }
  populateNoteEditor();
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
  state.historyMode = "detail";
  renderSessionDetail();
  syncBodyModes();
  saveLocalState();
  $("sessionDetail")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function saveNote(event) {
  event.preventDefault();
  if (state.editorMode === "new" && state.noteSourceMode === "wikipedia") return;
  const title = $("noteTitle").value.trim() || "Untitled Note";
  const body = $("noteBody").value.trim();
  if (!body) return;

  const button = event.submitter;
  button.disabled = true;
  button.textContent = "Saving...";
  try {
    const existingNote = state.editorMode === "new"
      ? null
      : state.notes.find((candidate) => candidate.id === state.editingNoteId) || activeNote();
    const path = existingNote ? `/api/notes/${encodeURIComponent(existingNote.id)}` : "/api/notes";
    const payload = await api(path, {
      method: existingNote ? "PUT" : "POST",
      body: JSON.stringify({ title, body })
    });
    state.activeNoteId = payload.note.id;
    state.editorMode = "edit";
    state.editingNoteId = payload.note.id;
    setPrepState(payload.note.id, existingNote
      ? "Accordian is rebuilding this note."
      : "Accordian is preparing your first quiz.");
    state.noteDraft = { title: "", body: "" };
    $("noteTitle").value = "";
    $("noteBody").value = "";
    await loadNotes();
    setTab("learn");
  } finally {
    button.disabled = false;
    button.textContent = state.editorMode === "new" ? "Save Note" : "Save Changes";
  }
}

async function deleteNoteById(noteId) {
  const note = state.notes.find((candidate) => candidate.id === noteId);
  if (!note) return;
  const confirmed = window.confirm(`Delete "${note.title}" and its quiz history?`);
  if (!confirmed) return;
  await api(`/api/notes/${encodeURIComponent(noteId)}`, { method: "DELETE" });
  $("noteMenu")?.removeAttribute("open");
  logAction("ui.note.deleted", { noteId, objectType: "note", objectId: noteId });
  if (state.activeNoteId === noteId) {
    clearStoredQuiz();
    state.activeNoteId = null;
    state.editorMode = "new";
    state.editingNoteId = null;
    state.journeyCompleteNoteId = null;
  }
  await loadNotes();
}

async function deleteActiveNote() {
  const note = activeNote();
  if (!note || state.editorMode === "new") return;
  await deleteNoteById(note.id);
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
    state.editorMode = "edit";
    state.editingNoteId = payload.note.id;
    setPrepState(payload.note.id, "Accordian is preparing your first quiz.");
    state.wikiResults = [];
    $("wikiQuery").value = "";
    await loadNotes();
    setTab("learn");
  } catch (error) {
    $("wikiResults").innerHTML = `<div class="error">${escapeHTML(error.message)}</div>`;
  }
}

async function exportBackup() {
  const button = $("exportBackupButton");
  button.disabled = true;
  button.textContent = "Exporting...";
  try {
    const response = await fetch("/api/backup");
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Export failed." }));
      throw new Error(error.error || "Export failed.");
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `accordian-backup-${stamp}.sqlite`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (error) {
    alert(error.message || "Export failed.");
  } finally {
    button.disabled = false;
    button.textContent = "Export";
  }
}

async function restoreBackup(file) {
  if (!file) return;
  const confirmed = window.confirm("Restore this backup? It will replace the current learning memory on this device.");
  if (!confirmed) {
    $("backupFileInput").value = "";
    return;
  }

  const button = $("importBackupButton");
  button.disabled = true;
  button.textContent = "Importing...";
  try {
    const response = await fetch("/api/backup/restore", {
      method: "POST",
      headers: { "content-type": "application/octet-stream" },
      body: file
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Import failed.");
    clearStoredQuiz();
    state.notes = payload.notes || [];
    state.activeNoteId = state.notes[0]?.id || null;
    state.editorMode = "new";
    state.editingNoteId = null;
    state.libraryMode = "list";
    await loadNotes();
    await loadSessions();
    render();
  } catch (error) {
    alert(error.message || "Import failed.");
  } finally {
    button.disabled = false;
    button.textContent = "Import";
    $("backupFileInput").value = "";
  }
}

async function startQuiz() {
  const note = activeNote();
  if (!note) return;
  logAction("ui.quiz.start_requested", { noteId: note.id, objectType: "note", objectId: note.id });
  $("startQuizButton").disabled = true;
  $("startQuizButton").hidden = false;
  $("quizArea").innerHTML = quizSkeletonHTML("Opening quiz");
  try {
    const payload = await api(`/api/notes/${encodeURIComponent(note.id)}/quiz`);
    state.quiz = payload.questions || [];
    state.quizNoteId = state.quiz.length > 0 ? note.id : null;
    state.quizStartedAt = state.quiz.length > 0 ? Date.now() : 0;
    state.answers.clear();
    state.index = 0;
    if (state.quiz.length === 0 && (payload.nextQuiz?.status === "preparing" || payload.nextQuiz?.status === "already_preparing")) {
      setPrepState(note.id, "Accordian is unlocking fresh checks from your learning history.");
      state.journeyCompleteNoteId = null;
    } else {
      clearPrepState(note.id);
      state.journeyCompleteNoteId = state.quiz.length === 0 ? note.id : null;
    }
    saveLocalState();
    renderQuiz();
  } finally {
    renderActiveNote();
  }
}

async function submitQuiz() {
  const note = activeNote();
  if (!note) return;
  $("quizArea").innerHTML = quizSkeletonHTML("Grading quiz", "Saving your answers and preparing the review");
  const answers = state.quiz.map((question) => ({
    questionId: question.id,
    variantId: question.variantId || "",
    response: state.answers.get(question.id) || ""
  }));
  const result = await api(`/api/notes/${encodeURIComponent(note.id)}/quiz`, {
    method: "POST",
    body: JSON.stringify({ answers })
  });
  clearStoredQuiz();
  if (result.nextQuiz?.status === "preparing" || result.nextQuiz?.status === "already_preparing") {
    setPrepState(note.id, result.score >= 0.999
      ? "Perfect score. Accordian is unlocking harder checks."
      : "Accordian is preparing follow-up checks from your last answers.");
  } else {
    clearPrepState(note.id);
  }
  saveLocalState();
  await loadNotes();
  await loadSessions();
  renderQuizResult(result);
}

async function checkModel() {
  try {
    await api("/api/model");
    $("modelStatus").textContent = "Gemma 4";
  } catch {
    $("modelStatus").textContent = "Gemma 4";
  }
}

document.querySelectorAll(".tab").forEach((button) => {
  button.addEventListener("click", () => {
    if (button.dataset.tab === "notes") state.libraryMode = "list";
    if (button.dataset.tab === "quizzes") state.historyMode = "list";
    setTab(button.dataset.tab);
  });
});
$("journeySelect")?.addEventListener("change", (event) => selectNote(event.target.value));
$("noteForm").addEventListener("submit", saveNote);
$("startQuizButton").addEventListener("click", startQuiz);
$("refreshButton")?.addEventListener("click", loadNotes);
$("clearNoteButton").addEventListener("click", clearNoteEditor);
$("newNoteTopButton").addEventListener("click", clearNoteEditor);
$("backToNotesButton").addEventListener("click", showNotesList);
$("deleteNoteButton").addEventListener("click", deleteActiveNote);
document.querySelectorAll("[data-source-mode]").forEach((button) => {
  button.addEventListener("click", () => setSourceMode(button.dataset.sourceMode));
});
document.querySelectorAll("[data-math-template]").forEach((button) => {
  button.addEventListener("click", () => applyMathTemplateByKey(button.dataset.mathTemplate));
});
$("noteTitle").addEventListener("input", () => {
  if (state.editorMode !== "new") return;
  if ($("noteTitle").value !== mathTemplateTitle()) state.mathTemplateApplied = false;
  state.noteDraft.title = $("noteTitle").value;
  saveLocalState();
});
$("noteBody").addEventListener("input", () => {
  if (state.editorMode !== "new") return;
  if ($("noteBody").value !== mathTemplateBody()) state.mathTemplateApplied = false;
  state.noteDraft.body = $("noteBody").value;
  saveLocalState();
});
$("wikiSearchButton").addEventListener("click", searchWikipedia);
$("wikiQuery").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    searchWikipedia();
  }
});
$("exportBackupButton")?.addEventListener("click", exportBackup);
$("importBackupButton")?.addEventListener("click", () => $("backupFileInput")?.click());
$("backupFileInput")?.addEventListener("change", (event) => restoreBackup(event.target.files?.[0]));

checkModel();
setTab(state.tab);
loadNotes();
loadSessions();
window.setInterval(() => {
  if (state.waitingForNextQuizNoteId || state.prepState) loadNotes();
}, 3000);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch(() => {});
  });
}

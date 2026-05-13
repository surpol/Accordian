import http from "node:http";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "public");
const dataDir = join(__dirname, "data");
const dbPath = join(dataDir, "accordian.sqlite");
const port = Number(process.env.PORT || 4173);
const gemmaBaseURL = process.env.GEMMA_BASE_URL || "http://127.0.0.1:11434";
const gemmaModel = process.env.GEMMA_MODEL || "gemma4:e2b";
const expansionInFlight = new Set();

mkdirSync(dataDir, { recursive: true });

function sqlEscape(value) {
  return String(value ?? "").replaceAll("'", "''");
}

function sqlite(sql, { json = false } = {}) {
  const args = json ? ["-json", dbPath, sql] : [dbPath, sql];
  const result = spawnSync("sqlite3", args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || "SQLite query failed");
  }
  return json ? JSON.parse(result.stdout || "[]") : result.stdout;
}

function initDB() {
  sqlite(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      source_type TEXT NOT NULL DEFAULT 'text',
      status TEXT NOT NULL DEFAULT 'new',
      created_at REAL NOT NULL
    );
    CREATE TABLE IF NOT EXISTS topics (
      id TEXT PRIMARY KEY NOT NULL,
      note_id TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      importance REAL NOT NULL DEFAULT 1,
      created_at REAL NOT NULL
    );
    CREATE TABLE IF NOT EXISTS concepts (
      id TEXT PRIMARY KEY NOT NULL,
      note_id TEXT NOT NULL,
      topic_id TEXT,
      title TEXT NOT NULL,
      source_excerpt TEXT NOT NULL DEFAULT '',
      importance REAL NOT NULL DEFAULT 1,
      difficulty REAL NOT NULL DEFAULT 1,
      understanding_score REAL NOT NULL DEFAULT 0,
      mastery_state TEXT NOT NULL DEFAULT 'new',
      last_tested_at REAL,
      created_at REAL NOT NULL
    );
    CREATE TABLE IF NOT EXISTS questions (
      id TEXT PRIMARY KEY NOT NULL,
      note_id TEXT NOT NULL,
      topic_id TEXT,
      concept_id TEXT,
      topic TEXT NOT NULL,
      subtopic TEXT NOT NULL,
      assessment_angle TEXT NOT NULL DEFAULT 'recall',
      concept_signature TEXT NOT NULL DEFAULT '',
      generation_source TEXT NOT NULL DEFAULT 'initial',
      prompt TEXT NOT NULL,
      answer TEXT NOT NULL,
      choices TEXT NOT NULL,
      importance REAL NOT NULL DEFAULT 1,
      difficulty REAL NOT NULL DEFAULT 1,
      understanding_score REAL NOT NULL DEFAULT 0,
      mastery_state TEXT NOT NULL DEFAULT 'new',
      last_seen_at REAL,
      created_at REAL NOT NULL
    );
    CREATE TABLE IF NOT EXISTS question_variants (
      id TEXT PRIMARY KEY NOT NULL,
      question_id TEXT NOT NULL,
      note_id TEXT NOT NULL,
      delivery_type TEXT NOT NULL,
      prompt TEXT NOT NULL,
      answer TEXT NOT NULL,
      choices TEXT NOT NULL DEFAULT '[]',
      rubric TEXT NOT NULL DEFAULT '',
      created_at REAL NOT NULL
    );
    CREATE TABLE IF NOT EXISTS attempts (
      id TEXT PRIMARY KEY NOT NULL,
      question_id TEXT NOT NULL,
      variant_id TEXT NOT NULL DEFAULT '',
      note_id TEXT NOT NULL,
      topic_snapshot TEXT NOT NULL DEFAULT '',
      subtopic_snapshot TEXT NOT NULL DEFAULT '',
      prompt_snapshot TEXT NOT NULL DEFAULT '',
      answer_snapshot TEXT NOT NULL DEFAULT '',
      response TEXT NOT NULL,
      score REAL NOT NULL,
      feedback TEXT NOT NULL DEFAULT '',
      matched_ideas TEXT NOT NULL DEFAULT '[]',
      missing_ideas TEXT NOT NULL DEFAULT '[]',
      created_at REAL NOT NULL
    );
    CREATE TABLE IF NOT EXISTS quiz_sessions (
      id TEXT PRIMARY KEY NOT NULL,
      note_id TEXT NOT NULL,
      score REAL NOT NULL,
      attempt_ids TEXT NOT NULL,
      created_at REAL NOT NULL
    );
    CREATE TABLE IF NOT EXISTS concept_memory (
      note_id TEXT NOT NULL,
      concept_signature TEXT NOT NULL,
      topic TEXT NOT NULL,
      subtopic TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      average_score REAL NOT NULL DEFAULT 0,
      latest_score REAL NOT NULL DEFAULT 0,
      last_seen REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (note_id, concept_signature)
    );
    CREATE TABLE IF NOT EXISTS learning_memory (
      question_id TEXT PRIMARY KEY NOT NULL,
      concept_id TEXT,
      note_id TEXT NOT NULL,
      latest_score REAL NOT NULL DEFAULT 0,
      average_score REAL NOT NULL DEFAULT 0,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      multiple_choice_score REAL NOT NULL DEFAULT 0,
      short_answer_score REAL NOT NULL DEFAULT 0,
      delivery_variety INTEGER NOT NULL DEFAULT 0,
      weakness_reason TEXT NOT NULL DEFAULT '',
      next_due_at REAL,
      mastery_state TEXT NOT NULL DEFAULT 'new',
      updated_at REAL NOT NULL
    );
    CREATE TABLE IF NOT EXISTS model_runs (
      id TEXT PRIMARY KEY NOT NULL,
      note_id TEXT,
      task TEXT NOT NULL,
      prompt_version TEXT NOT NULL,
      status TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '',
      created_at REAL NOT NULL
    );
  `);
  ensureColumns("notes", [
    ["source_type", "TEXT NOT NULL DEFAULT 'text'"]
  ]);
  ensureColumns("attempts", [
    ["variant_id", "TEXT NOT NULL DEFAULT ''"],
    ["topic_snapshot", "TEXT NOT NULL DEFAULT ''"],
    ["subtopic_snapshot", "TEXT NOT NULL DEFAULT ''"],
    ["prompt_snapshot", "TEXT NOT NULL DEFAULT ''"],
    ["answer_snapshot", "TEXT NOT NULL DEFAULT ''"],
    ["matched_ideas", "TEXT NOT NULL DEFAULT '[]'"],
    ["missing_ideas", "TEXT NOT NULL DEFAULT '[]'"]
  ]);
  ensureColumns("questions", [
    ["topic_id", "TEXT"],
    ["concept_id", "TEXT"],
    ["assessment_angle", "TEXT NOT NULL DEFAULT 'recall'"],
    ["concept_signature", "TEXT NOT NULL DEFAULT ''"],
    ["generation_source", "TEXT NOT NULL DEFAULT 'initial'"],
    ["understanding_score", "REAL NOT NULL DEFAULT 0"],
    ["mastery_state", "TEXT NOT NULL DEFAULT 'new'"],
    ["last_seen_at", "REAL"]
  ]);
}

initDB();

function ensureColumns(tableName, additions) {
  const columns = sqlite(`PRAGMA table_info(${tableName});`, { json: true }).map((column) => column.name);
  for (const [name, definition] of additions) {
    if (!columns.includes(name)) {
      sqlite(`ALTER TABLE ${tableName} ADD COLUMN ${name} ${definition};`);
    }
  }
}

function noteSummary(noteId) {
  const rows = sqlite(`
    SELECT
      n.id,
      n.title,
      n.body,
      n.summary,
      n.status,
      n.created_at,
      COUNT(DISTINCT q.id) AS question_count,
      COUNT(DISTINCT a.id) AS attempt_count,
      COALESCE(NULLIF(AVG(q.understanding_score), 0), AVG(a.score), 0) AS average_score
    FROM notes n
    LEFT JOIN questions q ON q.note_id = n.id
    LEFT JOIN attempts a ON a.note_id = n.id
    WHERE n.id = '${sqlEscape(noteId)}'
    GROUP BY n.id
  `, { json: true })[0];
  return rows ? normalizeNote(rows) : null;
}

function normalizeNote(row) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    summary: row.summary || "",
    status: row.status,
    createdAt: row.created_at,
    questionCount: Number(row.question_count || 0),
    attemptCount: Number(row.attempt_count || 0),
    averageScore: Number(row.average_score || 0)
  };
}

function listNotes() {
  return sqlite(`
    SELECT
      n.id,
      n.title,
      n.body,
      n.summary,
      n.status,
      n.created_at,
      COUNT(DISTINCT q.id) AS question_count,
      COUNT(DISTINCT a.id) AS attempt_count,
      COALESCE(NULLIF(AVG(q.understanding_score), 0), AVG(a.score), 0) AS average_score
    FROM notes n
    LEFT JOIN questions q ON q.note_id = n.id
    LEFT JOIN attempts a ON a.note_id = n.id
    GROUP BY n.id
    ORDER BY n.created_at DESC
  `, { json: true }).map(normalizeNote);
}

async function readJSON(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

function writeJSON(response, status, payload) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(payload));
}

async function wikipediaJSON(params) {
  const url = new URL("https://en.wikipedia.org/w/api.php");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    headers: {
      "user-agent": "AccordianLearningDemo/1.0 (local Kaggle demo)"
    }
  });
  if (!response.ok) {
    throw new Error(`Wikipedia request failed: ${response.status}`);
  }
  return response.json();
}

async function searchWikipedia(query) {
  const payload = await wikipediaJSON({
    action: "query",
    list: "search",
    srsearch: query,
    srlimit: "8",
    srprop: "snippet"
  });

  return (payload.query?.search || []).map((item) => ({
    title: item.title,
    pageId: item.pageid,
    snippet: String(item.snippet || "").replace(/<[^>]*>/g, "")
  }));
}

async function wikipediaArticle(title) {
  const payload = await wikipediaJSON({
    action: "query",
    prop: "extracts",
    exintro: "0",
    explaintext: "1",
    redirects: "1",
    titles: title
  });

  const page = payload.query?.pages?.find((candidate) => candidate.missing !== true);
  if (!page?.extract) {
    throw new Error("Wikipedia article text was not available.");
  }

  return {
    title: page.title || title,
    text: page.extract
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  };
}

function createNote(title, text) {
  const id = crypto.randomUUID();
  sqlite(`
    INSERT INTO notes (id, title, body, status, created_at)
    VALUES ('${id}', '${sqlEscape(title)}', '${sqlEscape(text)}', 'new', ${Date.now() / 1000});
  `);
  return noteSummary(id);
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function conceptSignature(question) {
  const topic = normalizeText(question.topic || question.topic_title || "");
  const subtopic = normalizeText(question.subtopic || question.subtopic_title || "");
  const angle = normalizeText(question.assessment_angle || question.assessmentAngle || "recall");
  const answer = normalizeText(question.answer || "").split(" ").slice(0, 8).join(" ");
  return [topic, subtopic, angle, answer].filter(Boolean).join(":").slice(0, 220) || crypto.randomUUID();
}

function promptFingerprint(prompt) {
  return normalizeText(prompt).slice(0, 260);
}

function shuffled(values) {
  return [...values].sort(() => Math.random() - 0.5);
}

function recordModelRun({ noteId, task, promptVersion, status, detail = "" }) {
  sqlite(`
    INSERT INTO model_runs (id, note_id, task, prompt_version, status, detail, created_at)
    VALUES (
      '${crypto.randomUUID()}',
      ${noteId ? `'${sqlEscape(noteId)}'` : "NULL"},
      '${sqlEscape(task)}',
      '${sqlEscape(promptVersion)}',
      '${sqlEscape(status)}',
      '${sqlEscape(detail)}',
      ${Date.now() / 1000}
    );
  `);
}

async function gemmaJSON(prompt) {
  const response = await fetch(`${gemmaBaseURL}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: gemmaModel,
      stream: false,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    })
  });
  if (!response.ok) {
    throw new Error(`Gemma request failed: ${response.status}`);
  }

  const payload = await response.json();
  const content = payload.message?.content || "";
  const cleaned = content
    .replace(/```json/gi, "```")
    .replace(/```/g, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("Gemma did not return JSON.");
  }
  return JSON.parse(cleaned.slice(start, end + 1));
}

function questionTargetFor(text) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (words < 120) return 12;
  if (words < 400) return 18;
  if (words < 900) return 28;
  if (words < 1800) return 40;
  return 56;
}

function quizPromptFor(note, target) {
  return `
You are building durable learning objects for an education app.
Use ONLY the note text. Do not use outside facts.
Create ${target} useful question objects proportional to the note's important concepts.
Avoid duplicate prompts. Avoid trivia unless it anchors an important idea.
Cover definitions, causes, locations, sequences, comparisons, consequences, and applied understanding where the note supports it.
Each question object must include multiple delivery variants where possible.
Every multiple_choice variant must have exactly 4 choices and one exact answer that appears in choices.

Return only JSON:
{
  "summary": "2 sentence student-friendly summary",
  "topics": [
    {
      "title": "broad topic",
      "summary": "what this topic covers",
      "importance": 0.9
    }
  ],
  "questions": [
    {
      "topic": "broad topic",
      "concept": "specific concept",
      "source_excerpt": "exact note-backed text this question tests",
      "assessment_angle": "definition | cause | sequence | comparison | consequence | application | detail",
      "canonical_prompt": "stable question object",
      "canonical_answer": "source-backed answer",
      "accepted_answers": ["equivalent answer"],
      "importance": 0.8,
      "difficulty": 0.6,
      "variants": [
        {
          "delivery_type": "multiple_choice",
          "prompt": "MC prompt",
          "answer": "correct choice",
          "choices": ["correct choice", "distractor", "distractor", "distractor"],
          "rubric": "what must be known"
        },
        {
          "delivery_type": "short_answer",
          "prompt": "short answer prompt",
          "answer": "expected answer",
          "choices": [],
          "rubric": "main ideas required"
        }
      ]
    }
  ]
}

NOTE TITLE:
${note.title}

NOTE TEXT:
${note.body.slice(0, 12000)}
`;
}

function existingPromptFingerprints(noteId) {
  return new Set(sqlite(`
    SELECT canonical_prompt AS prompt FROM (
      SELECT prompt AS canonical_prompt FROM questions WHERE note_id = '${sqlEscape(noteId)}'
      UNION ALL
      SELECT prompt AS canonical_prompt FROM question_variants WHERE note_id = '${sqlEscape(noteId)}'
    )
  `, { json: true }).map((row) => promptFingerprint(row.prompt)));
}

function topicIdFor(noteId, title, summary = "", importance = 1) {
  const cleanTitle = String(title || "Main Topic").trim();
  const existing = sqlite(`
    SELECT id FROM topics
    WHERE note_id = '${sqlEscape(noteId)}'
      AND lower(title) = lower('${sqlEscape(cleanTitle)}')
    LIMIT 1
  `, { json: true })[0];
  if (existing?.id) return existing.id;
  const id = crypto.randomUUID();
  sqlite(`
    INSERT INTO topics (id, note_id, title, summary, importance, created_at)
    VALUES (
      '${id}',
      '${sqlEscape(noteId)}',
      '${sqlEscape(cleanTitle)}',
      '${sqlEscape(summary)}',
      ${Number(importance || 1)},
      ${Date.now() / 1000}
    );
  `);
  return id;
}

function conceptIdFor(noteId, topicId, question) {
  const title = String(question.concept || question.subtopic || question.subtopic_title || question.canonical_prompt || question.prompt || "Core Concept").trim();
  const existing = sqlite(`
    SELECT id FROM concepts
    WHERE note_id = '${sqlEscape(noteId)}'
      AND lower(title) = lower('${sqlEscape(title)}')
    LIMIT 1
  `, { json: true })[0];
  if (existing?.id) return existing.id;
  const id = crypto.randomUUID();
  sqlite(`
    INSERT INTO concepts (
      id, note_id, topic_id, title, source_excerpt, importance, difficulty,
      understanding_score, mastery_state, created_at
    ) VALUES (
      '${id}',
      '${sqlEscape(noteId)}',
      '${sqlEscape(topicId)}',
      '${sqlEscape(title)}',
      '${sqlEscape(question.source_excerpt || question.sourceExcerpt || "")}',
      ${Number(question.importance || 1)},
      ${Number(question.difficulty || 1)},
      0,
      'new',
      ${Date.now() / 1000}
    );
  `);
  return id;
}

function insertVariant(noteId, questionId, variant) {
  const type = String(variant.delivery_type || variant.deliveryType || "multiple_choice").trim();
  const prompt = String(variant.prompt || "").trim();
  const answer = String(variant.answer || "").trim();
  if (!prompt || !answer) return false;
  const choices = Array.isArray(variant.choices) ? variant.choices.filter(Boolean).map(String) : [];
  if (type === "multiple_choice" && (choices.length !== 4 || choices.includes(answer) === false)) return false;
  sqlite(`
    INSERT INTO question_variants (
      id, question_id, note_id, delivery_type, prompt, answer, choices, rubric, created_at
    ) VALUES (
      '${crypto.randomUUID()}',
      '${sqlEscape(questionId)}',
      '${sqlEscape(noteId)}',
      '${sqlEscape(type)}',
      '${sqlEscape(prompt)}',
      '${sqlEscape(answer)}',
      '${sqlEscape(JSON.stringify(type === "multiple_choice" ? shuffled(choices) : choices))}',
      '${sqlEscape(variant.rubric || "")}',
      ${Date.now() / 1000}
    );
  `);
  return true;
}

function insertQuestions(noteId, questions, generationSource) {
  const existing = existingPromptFingerprints(noteId);
  let saved = 0;
  for (const question of questions) {
    const variants = Array.isArray(question.variants) && question.variants.length > 0
      ? question.variants
      : [{
          delivery_type: "multiple_choice",
          prompt: question.prompt,
          answer: question.answer,
          choices: question.choices,
          rubric: question.grading_rubric || ""
        }];
    const prompt = String(question.canonical_prompt || question.prompt || variants[0]?.prompt || "").trim();
    const answer = String(question.canonical_answer || question.answer || variants[0]?.answer || "").trim();
    const fingerprint = promptFingerprint(prompt);
    if (!prompt || !answer || existing.has(fingerprint)) continue;
    existing.add(fingerprint);
    const topicTitle = question.topic || question.topic_title || "Main Topic";
    const topicId = topicIdFor(noteId, topicTitle, "", question.importance || 1);
    const conceptId = conceptIdFor(noteId, topicId, question);
    const questionId = crypto.randomUUID();
    const acceptedAnswers = Array.isArray(question.accepted_answers || question.acceptedAnswers)
      ? (question.accepted_answers || question.acceptedAnswers)
      : [answer];
    const mcVariant = variants.find((variant) => (variant.delivery_type || variant.deliveryType || "multiple_choice") === "multiple_choice") || variants[0] || {};
    const choices = Array.isArray(mcVariant.choices) ? mcVariant.choices : [];
    if (choices.length !== 4 || choices.includes(String(mcVariant.answer || answer)) === false) continue;
    saved += 1;
    sqlite(`
      INSERT INTO questions (
        id, note_id, topic_id, concept_id, topic, subtopic, assessment_angle, concept_signature,
        generation_source, prompt, answer, choices, importance, difficulty,
        understanding_score, mastery_state, created_at
      ) VALUES (
        '${questionId}',
        '${sqlEscape(noteId)}',
        '${sqlEscape(topicId)}',
        '${sqlEscape(conceptId)}',
        '${sqlEscape(question.topic || "Main Topic")}',
        '${sqlEscape(question.concept || question.subtopic || "Core Idea")}',
        '${sqlEscape(question.assessment_angle || question.assessmentAngle || "recall")}',
        '${sqlEscape(conceptSignature(question))}',
        '${sqlEscape(generationSource)}',
        '${sqlEscape(prompt)}',
        '${sqlEscape(answer)}',
        '${sqlEscape(JSON.stringify(shuffled(choices)))}',
        ${Number(question.importance || 1)},
        ${Number(question.difficulty || 1)},
        0,
        'new',
        ${Date.now() / 1000}
      );
    `);
    let variantSaved = false;
    for (const variant of variants) {
      const normalizedVariant = {
        ...variant,
        prompt: variant.prompt || prompt,
        answer: variant.answer || answer
      };
      variantSaved = insertVariant(noteId, questionId, normalizedVariant) || variantSaved;
    }
    if (!variantSaved) {
      insertVariant(noteId, questionId, {
        delivery_type: "multiple_choice",
        prompt,
        answer,
        choices,
        rubric: `Accepted answers: ${acceptedAnswers.join(", ")}`
      });
    }
  }
  return saved;
}

function saveQuestions(noteId, summary, questions) {
  sqlite(`DELETE FROM question_variants WHERE note_id = '${sqlEscape(noteId)}';`);
  sqlite(`DELETE FROM questions WHERE note_id = '${sqlEscape(noteId)}';`);
  sqlite(`DELETE FROM concepts WHERE note_id = '${sqlEscape(noteId)}';`);
  sqlite(`DELETE FROM topics WHERE note_id = '${sqlEscape(noteId)}';`);
  const saved = insertQuestions(noteId, questions, "initial");
  sqlite(`
    UPDATE notes
    SET summary = '${sqlEscape(summary || "")}',
        status = 'ready'
    WHERE id = '${sqlEscape(noteId)}';
  `);
  return saved;
}

function startQuiz(noteId) {
  const latestSession = sqlite(`
    SELECT attempt_ids
    FROM quiz_sessions
    WHERE note_id = '${sqlEscape(noteId)}'
    ORDER BY created_at DESC
    LIMIT 1
  `, { json: true })[0];
  const latestAttemptIds = String(latestSession?.attempt_ids || "")
    .split(/\n+/)
    .map((id) => id.trim())
    .filter(Boolean);
  const latestQuestionIds = latestAttemptIds.length
    ? new Set(sqlite(`
      SELECT question_id FROM attempts
      WHERE id IN (${latestAttemptIds.map((id) => `'${sqlEscape(id)}'`).join(",")})
    `, { json: true }).map((row) => row.question_id))
    : new Set();

  const rows = sqlite(`
    SELECT
      q.*,
      v.id AS variant_id,
      v.delivery_type,
      v.prompt AS variant_prompt,
      v.answer AS variant_answer,
      v.choices AS variant_choices,
      v.rubric AS variant_rubric,
      COALESCE(MAX(a.created_at), 0) AS last_seen,
      COALESCE(AVG(a.score), -1) AS average_score,
      COUNT(a.id) AS attempt_count
    FROM questions q
    LEFT JOIN question_variants v ON v.question_id = q.id
    LEFT JOIN attempts a ON a.question_id = q.id
    WHERE q.note_id = '${sqlEscape(noteId)}'
      AND COALESCE(v.delivery_type, 'multiple_choice') = 'multiple_choice'
    GROUP BY q.id
  `, { json: true });

  const pool = rows.length - latestQuestionIds.size >= 8
    ? rows.filter((row) => latestQuestionIds.has(row.id) === false)
    : rows;

  const sorted = pool.sort((left, right) => {
    const score = (row) => {
      const average = Number(row.average_score);
      const attempts = Number(row.attempt_count || 0);
      const lastSeen = Number(row.last_seen || 0);
      const age = lastSeen === 0 ? 30 : Math.min(30, ((Date.now() / 1000) - lastSeen) / 86400);
      return (
        (attempts === 0 ? 1000 : 0) +
        (average >= 0 && average < 0.8 ? 500 : 0) +
        (latestQuestionIds.has(row.id) ? -250 : 0) +
        Number(row.importance || 1) * 30 +
        Number(row.difficulty || 1) * 20 +
        age +
        Math.random()
      );
    };
    return score(right) - score(left);
  }).slice(0, 8);

  return sorted.map((row) => ({
    id: row.id,
    variantId: row.variant_id || "",
    deliveryType: row.delivery_type || "multiple_choice",
    topic: row.topic,
    subtopic: row.subtopic,
    assessmentAngle: row.assessment_angle || "recall",
    prompt: row.variant_prompt || row.prompt,
    answer: row.variant_answer || row.answer,
    choices: JSON.parse(row.variant_choices || row.choices || "[]")
  }));
}

function updateConceptMemory(noteId, question, score) {
  const signature = question.concept_signature || conceptSignature(question);
  const existing = sqlite(`
    SELECT * FROM concept_memory
    WHERE note_id = '${sqlEscape(noteId)}'
      AND concept_signature = '${sqlEscape(signature)}'
  `, { json: true })[0];
  const attempts = Number(existing?.attempts || 0) + 1;
  const previousAverage = Number(existing?.average_score || 0);
  const average = ((previousAverage * (attempts - 1)) + Number(score || 0)) / attempts;
  sqlite(`
    INSERT OR REPLACE INTO concept_memory (
      note_id, concept_signature, topic, subtopic, attempts, average_score, latest_score, last_seen
    ) VALUES (
      '${sqlEscape(noteId)}',
      '${sqlEscape(signature)}',
      '${sqlEscape(question.topic || "Topic")}',
      '${sqlEscape(question.subtopic || "Subtopic")}',
      ${attempts},
      ${average},
      ${Number(score || 0)},
      ${Date.now() / 1000}
    );
  `);
}

function updateLearningMemory(noteId, question, variant, score) {
  const questionId = question.id;
  const rows = sqlite(`
    SELECT
      a.score,
      a.created_at,
      COALESCE(v.delivery_type, 'multiple_choice') AS delivery_type
    FROM attempts a
    LEFT JOIN question_variants v ON v.id = a.variant_id
    WHERE a.question_id = '${sqlEscape(questionId)}'
    ORDER BY a.created_at DESC
  `, { json: true });
  const attemptCount = rows.length;
  const average = attemptCount
    ? rows.reduce((sum, row) => sum + Number(row.score || 0), 0) / attemptCount
    : Number(score || 0);
  const latest = Number(score || 0);
  const deliveryTypes = new Set(rows.map((row) => row.delivery_type || "multiple_choice"));
  if (variant?.delivery_type) deliveryTypes.add(variant.delivery_type);
  const mcRows = rows.filter((row) => (row.delivery_type || "multiple_choice") === "multiple_choice");
  const shortRows = rows.filter((row) => row.delivery_type === "short_answer");
  const mcScore = mcRows.length ? mcRows.reduce((sum, row) => sum + Number(row.score || 0), 0) / mcRows.length : 0;
  const shortScore = shortRows.length ? shortRows.reduce((sum, row) => sum + Number(row.score || 0), 0) / shortRows.length : 0;
  const varietyBonus = Math.min(1, deliveryTypes.size / 2);
  const understanding = Math.max(0, Math.min(1, (latest * 0.4) + (average * 0.35) + (varietyBonus * 0.15) + (Number(question.difficulty || 1) * 0.1)));
  const masteryState = understanding >= 0.95 && deliveryTypes.size >= 2
    ? "mastered"
    : understanding >= 0.8
      ? "strong"
      : latest > average
        ? "improving"
        : average < 0.5 && attemptCount > 1
          ? "weak"
          : "learning";
  const weaknessReason = masteryState === "weak"
    ? "Recent attempts show this question is still unstable."
    : deliveryTypes.size < 2
      ? "Needs another delivery type before mastery."
      : "";

  sqlite(`
    INSERT OR REPLACE INTO learning_memory (
      question_id, concept_id, note_id, latest_score, average_score, attempt_count,
      multiple_choice_score, short_answer_score, delivery_variety, weakness_reason,
      next_due_at, mastery_state, updated_at
    ) VALUES (
      '${sqlEscape(questionId)}',
      '${sqlEscape(question.concept_id || "")}',
      '${sqlEscape(noteId)}',
      ${latest},
      ${average},
      ${attemptCount},
      ${mcScore},
      ${shortScore},
      ${deliveryTypes.size},
      '${sqlEscape(weaknessReason)}',
      ${Date.now() / 1000 + (masteryState === "mastered" ? 604800 : masteryState === "strong" ? 259200 : 86400)},
      '${sqlEscape(masteryState)}',
      ${Date.now() / 1000}
    );
  `);
  sqlite(`
    UPDATE questions
    SET understanding_score = ${understanding},
        mastery_state = '${sqlEscape(masteryState)}',
        last_seen_at = ${Date.now() / 1000}
    WHERE id = '${sqlEscape(questionId)}';
  `);
  if (question.concept_id) {
    sqlite(`
      UPDATE concepts
      SET understanding_score = (
            SELECT COALESCE(AVG(understanding_score), 0)
            FROM questions
            WHERE concept_id = '${sqlEscape(question.concept_id)}'
          ),
          mastery_state = CASE
            WHEN (
              SELECT COALESCE(MIN(understanding_score), 0)
              FROM questions
              WHERE concept_id = '${sqlEscape(question.concept_id)}'
            ) >= 0.95 THEN 'mastered'
            ELSE 'learning'
          END,
          last_tested_at = ${Date.now() / 1000}
      WHERE id = '${sqlEscape(question.concept_id)}';
    `);
  }
}

function quizExpansionPromptFor(note, details, target) {
  const existing = sqlite(`
    SELECT
      q.topic,
      q.subtopic,
      q.assessment_angle,
      q.prompt,
      q.answer,
      COALESCE(lm.average_score, 0) AS average_score,
      COALESCE(lm.mastery_state, 'new') AS mastery_state,
      COALESCE(lm.weakness_reason, '') AS weakness_reason
    FROM questions q
    LEFT JOIN learning_memory lm ON lm.question_id = q.id
    WHERE q.note_id = '${sqlEscape(note.id)}'
    ORDER BY q.created_at DESC
    LIMIT 80
  `, { json: true });
  const weak = details
    .filter((item) => item.score < 1)
    .map((item) => ({
      topic: item.topic,
      subtopic: item.subtopic,
      prompt: item.prompt,
      learner_answer: item.response,
      correct_answer: item.answer
    }));

  return `
You are Accordian's learning-object expansion agent.
Use ONLY the note text. Do not use outside facts.
Create ${target} fresh durable question objects for the NEXT quiz.

Goals:
- Address the learner's missed concepts with adjacent questions, not duplicates.
- Add new important concepts from the note that are not covered by existing questions.
- Build from basic recall toward application and comparison when the note supports it.
- Avoid all existing prompts and avoid trivial wording changes.
- Include a multiple_choice variant for every question.
- Include a short_answer variant when useful.
- Every multiple_choice variant must have exactly 4 choices and one exact answer present in choices.

Return only JSON:
{
  "questions": [
    {
      "topic": "broad topic",
      "concept": "specific concept",
      "source_excerpt": "exact note-backed text this question tests",
      "assessment_angle": "definition | cause | sequence | comparison | consequence | application | detail",
      "canonical_prompt": "stable question object",
      "canonical_answer": "source-backed answer",
      "accepted_answers": ["equivalent answer"],
      "importance": 0.8,
      "difficulty": 0.6,
      "variants": [
        {
          "delivery_type": "multiple_choice",
          "prompt": "MC prompt",
          "answer": "correct choice",
          "choices": ["correct choice", "distractor", "distractor", "distractor"],
          "rubric": "what must be known"
        },
        {
          "delivery_type": "short_answer",
          "prompt": "short answer prompt",
          "answer": "expected answer",
          "choices": [],
          "rubric": "main ideas required"
        }
      ]
    }
  ]
}

MISSED CONCEPTS:
${JSON.stringify(weak, null, 2)}

EXISTING QUESTIONS TO AVOID:
${JSON.stringify(existing, null, 2)}

NOTE TITLE:
${note.title}

NOTE TEXT:
${note.body.slice(0, 14000)}
`;
}

async function prepareNextQuiz(noteId, details) {
  const note = noteSummary(noteId);
  if (!note) return { saved: 0, status: "missing_note" };
  const missCount = details.filter((item) => item.score < 1).length;
  const currentCount = Number(note.questionCount || 0);
  const maxCount = Math.max(questionTargetFor(note.body) * 2, 24);
  if (currentCount >= maxCount && missCount === 0) {
    return { saved: 0, status: "enough_questions" };
  }

  const target = Math.min(12, Math.max(6, missCount * 2, Math.ceil(questionTargetFor(note.body) / 3)));
  sqlite(`UPDATE notes SET status = 'building' WHERE id = '${sqlEscape(noteId)}';`);
  try {
    const result = await gemmaJSON(quizExpansionPromptFor(note, details, target));
    const saved = insertQuestions(noteId, result.questions || [], "post_quiz_expansion");
    sqlite(`UPDATE notes SET status = 'ready' WHERE id = '${sqlEscape(noteId)}';`);
    recordModelRun({
      noteId,
      task: "post_quiz_expansion",
      promptVersion: "web.quiz_expansion.v1",
      status: "ok",
      detail: `Saved ${saved} fresh questions.`
    });
    return { saved, status: "ok" };
  } catch (error) {
    sqlite(`UPDATE notes SET status = 'ready' WHERE id = '${sqlEscape(noteId)}';`);
    recordModelRun({
      noteId,
      task: "post_quiz_expansion",
      promptVersion: "web.quiz_expansion.v1",
      status: "error",
      detail: error.message || "Expansion failed."
    });
    return { saved: 0, status: "error", error: error.message || "Expansion failed." };
  }
}

function queueNextQuiz(noteId, details) {
  if (expansionInFlight.has(noteId)) {
    return { status: "already_preparing", saved: 0 };
  }
  expansionInFlight.add(noteId);
  prepareNextQuiz(noteId, details)
    .catch((error) => {
      recordModelRun({
        noteId,
        task: "post_quiz_expansion",
        promptVersion: "web.quiz_expansion.v1",
        status: "error",
        detail: error.message || "Expansion failed."
      });
    })
    .finally(() => expansionInFlight.delete(noteId));
  return { status: "preparing", saved: 0 };
}

async function submitQuiz(noteId, answers) {
  const attemptIds = [];
  let earned = 0;
  let possible = 0;
  const details = [];

  for (const answer of answers) {
    const question = sqlite(`
      SELECT * FROM questions WHERE id = '${sqlEscape(answer.questionId)}' AND note_id = '${sqlEscape(noteId)}'
    `, { json: true })[0];
    if (!question) continue;
    const variant = answer.variantId
      ? sqlite(`
        SELECT * FROM question_variants
        WHERE id = '${sqlEscape(answer.variantId)}'
          AND question_id = '${sqlEscape(answer.questionId)}'
      `, { json: true })[0]
      : null;
    const expectedAnswer = variant?.answer || question.answer;
    const promptSnapshot = variant?.prompt || question.prompt;
    const score = answer.response === expectedAnswer ? 1 : 0;
    const feedback = score === 1
      ? "Correct. Keep moving."
      : `Review this idea. Correct answer: ${expectedAnswer}`;
    const id = crypto.randomUUID();
    attemptIds.push(id);
    earned += score * Number(question.importance || 1) * Number(question.difficulty || 1);
    possible += Number(question.importance || 1) * Number(question.difficulty || 1);
    sqlite(`
      INSERT INTO attempts (
        id, question_id, variant_id, note_id, topic_snapshot, subtopic_snapshot,
        prompt_snapshot, answer_snapshot, response, score, feedback,
        matched_ideas, missing_ideas, created_at
      )
      VALUES (
        '${id}',
        '${sqlEscape(question.id)}',
        '${sqlEscape(variant?.id || "")}',
        '${sqlEscape(noteId)}',
        '${sqlEscape(question.topic)}',
        '${sqlEscape(question.subtopic)}',
        '${sqlEscape(promptSnapshot)}',
        '${sqlEscape(expectedAnswer)}',
        '${sqlEscape(answer.response || "")}',
        ${score},
        '${sqlEscape(feedback)}',
        '${sqlEscape(JSON.stringify(score === 1 ? [expectedAnswer] : []))}',
        '${sqlEscape(JSON.stringify(score === 1 ? [] : [expectedAnswer]))}',
        ${Date.now() / 1000}
      );
    `);
    details.push({
      questionId: question.id,
      topic: question.topic,
      subtopic: question.subtopic,
      prompt: promptSnapshot,
      response: answer.response,
      answer: expectedAnswer,
      score,
      feedback
    });
    updateConceptMemory(noteId, question, score);
    updateLearningMemory(noteId, question, variant, score);
  }

  const score = possible === 0 ? 0 : earned / possible;
  const sessionId = crypto.randomUUID();
  sqlite(`
    INSERT INTO quiz_sessions (id, note_id, score, attempt_ids, created_at)
    VALUES (
      '${sessionId}',
      '${sqlEscape(noteId)}',
      ${score},
      '${sqlEscape(attemptIds.join("\n"))}',
      ${Date.now() / 1000}
    );
  `);

  const nextQuiz = queueNextQuiz(noteId, details);
  return { id: sessionId, score, details, nextQuiz };
}

function history(noteId) {
  return sqlite(`
    SELECT
      s.*,
      n.title AS note_title
    FROM quiz_sessions s
    LEFT JOIN notes n ON n.id = s.note_id
    WHERE s.note_id = '${sqlEscape(noteId)}'
    ORDER BY s.created_at DESC
    LIMIT 20
  `, { json: true }).map((session) => ({
    id: session.id,
    noteId: session.note_id,
    noteTitle: session.note_title || "Untitled Note",
    score: Number(session.score || 0),
    createdAt: Number(session.created_at || 0)
  }));
}

function allHistory() {
  return sqlite(`
    SELECT
      s.*,
      n.title AS note_title
    FROM quiz_sessions s
    LEFT JOIN notes n ON n.id = s.note_id
    ORDER BY s.created_at DESC
    LIMIT 80
  `, { json: true }).map((session) => ({
    id: session.id,
    noteId: session.note_id,
    noteTitle: session.note_title || "Untitled Note",
    score: Number(session.score || 0),
    createdAt: Number(session.created_at || 0)
  }));
}

function sessionDetail(sessionId) {
  const session = sqlite(`
    SELECT
      s.*,
      n.title AS note_title
    FROM quiz_sessions s
    LEFT JOIN notes n ON n.id = s.note_id
    WHERE s.id = '${sqlEscape(sessionId)}'
  `, { json: true })[0];

  if (!session) return null;

  const attemptIds = String(session.attempt_ids || "")
    .split(/\n+/)
    .map((id) => id.trim())
    .filter(Boolean);

  const idList = attemptIds.map((id) => `'${sqlEscape(id)}'`).join(",");
  const attempts = idList
    ? sqlite(`
      SELECT
        a.id,
        a.response,
        a.score,
        a.feedback,
        a.created_at,
        COALESCE(q.topic, NULLIF(a.topic_snapshot, '')) AS topic,
        COALESCE(q.subtopic, NULLIF(a.subtopic_snapshot, '')) AS subtopic,
        COALESCE(q.prompt, NULLIF(a.prompt_snapshot, '')) AS prompt,
        COALESCE(q.answer, NULLIF(a.answer_snapshot, '')) AS answer
      FROM attempts a
      LEFT JOIN questions q ON q.id = a.question_id
      WHERE a.id IN (${idList})
    `, { json: true })
    : [];

  const order = new Map(attemptIds.map((id, index) => [id, index]));
  attempts.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  return {
    id: session.id,
    noteId: session.note_id,
    noteTitle: session.note_title || "Untitled Note",
    score: Number(session.score || 0),
    createdAt: Number(session.created_at || 0),
    attempts: attempts.map((attempt) => ({
      id: attempt.id,
      topic: attempt.topic || "Saved Attempt",
      subtopic: attempt.subtopic || "Earlier quiz",
      prompt: attempt.prompt || "Original question unavailable for this older attempt.",
      response: attempt.response || "",
      answer: attempt.answer || "See feedback",
      score: Number(attempt.score || 0),
      feedback: attempt.feedback || ""
    }))
  };
}

async function handleAPI(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/notes") {
    return writeJSON(response, 200, { notes: listNotes() });
  }

  if (request.method === "GET" && url.pathname === "/api/model") {
    return writeJSON(response, 200, {
      mode: "ollama",
      endpoint: gemmaBaseURL,
      model: gemmaModel
    });
  }

  if (request.method === "GET" && url.pathname === "/api/quizzes") {
    return writeJSON(response, 200, { sessions: allHistory() });
  }

  if (request.method === "GET" && url.pathname === "/api/wiki/search") {
    const query = String(url.searchParams.get("q") || "").trim();
    if (query.length < 2) return writeJSON(response, 400, { error: "Search needs at least 2 characters." });
    return writeJSON(response, 200, { results: await searchWikipedia(query) });
  }

  if (request.method === "POST" && url.pathname === "/api/wiki/import") {
    const body = await readJSON(request);
    const title = String(body.title || "").trim();
    if (!title) return writeJSON(response, 400, { error: "Wikipedia title is required." });
    const article = await wikipediaArticle(title);
    const note = createNote(article.title, article.text);
    return writeJSON(response, 201, { note });
  }

  if (request.method === "POST" && url.pathname === "/api/notes") {
    const body = await readJSON(request);
    const title = String(body.title || "Untitled Note").trim();
    const text = String(body.body || "").trim();
    if (!text) return writeJSON(response, 400, { error: "Note text is required." });
    return writeJSON(response, 201, { note: createNote(title, text) });
  }

  const buildMatch = url.pathname.match(/^\/api\/notes\/([^/]+)\/build$/);
  if (request.method === "POST" && buildMatch) {
    const noteId = buildMatch[1];
    const note = noteSummary(noteId);
    if (!note) return writeJSON(response, 404, { error: "Note not found." });
    sqlite(`UPDATE notes SET status = 'building' WHERE id = '${sqlEscape(noteId)}';`);
    const target = questionTargetFor(note.body);
    const result = await gemmaJSON(quizPromptFor(note, target));
    saveQuestions(noteId, result.summary, result.questions || []);
    return writeJSON(response, 200, { note: noteSummary(noteId) });
  }

  const quizMatch = url.pathname.match(/^\/api\/notes\/([^/]+)\/quiz$/);
  if (request.method === "GET" && quizMatch) {
    const noteId = quizMatch[1];
    return writeJSON(response, 200, { questions: startQuiz(noteId) });
  }

  const submitMatch = url.pathname.match(/^\/api\/notes\/([^/]+)\/quiz$/);
  if (request.method === "POST" && submitMatch) {
    const noteId = submitMatch[1];
    const body = await readJSON(request);
    return writeJSON(response, 200, await submitQuiz(noteId, body.answers || []));
  }

  const historyMatch = url.pathname.match(/^\/api\/notes\/([^/]+)\/history$/);
  if (request.method === "GET" && historyMatch) {
    return writeJSON(response, 200, { sessions: history(historyMatch[1]) });
  }

  const sessionMatch = url.pathname.match(/^\/api\/quiz-sessions\/([^/]+)$/);
  if (request.method === "GET" && sessionMatch) {
    const session = sessionDetail(sessionMatch[1]);
    if (!session) return writeJSON(response, 404, { error: "Quiz session not found." });
    return writeJSON(response, 200, { session });
  }

  return writeJSON(response, 404, { error: "Not found." });
}

function serveStatic(response, pathname) {
  const filePath = pathname === "/" ? join(publicDir, "index.html") : join(publicDir, pathname);
  if (!filePath.startsWith(publicDir) || !existsSync(filePath)) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }
  const type = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "application/javascript",
    ".svg": "image/svg+xml"
  }[extname(filePath)] || "application/octet-stream";
  response.writeHead(200, { "content-type": type });
  response.end(readFileSync(filePath));
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      await handleAPI(request, response, url);
      return;
    }
    serveStatic(response, decodeURIComponent(url.pathname));
  } catch (error) {
    writeJSON(response, 500, { error: error.message || "Server error" });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Accordian web running at http://localhost:${port}`);
  console.log(`Gemma endpoint: ${gemmaBaseURL} (${gemmaModel})`);
});

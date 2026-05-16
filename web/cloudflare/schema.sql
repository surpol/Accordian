CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  source_type TEXT NOT NULL DEFAULT 'text',
  status TEXT NOT NULL DEFAULT 'ready',
  created_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  subtopic TEXT NOT NULL,
  prompt TEXT NOT NULL,
  answer TEXT NOT NULL,
  choices TEXT NOT NULL,
  understanding_score REAL NOT NULL DEFAULT 0,
  created_at REAL NOT NULL,
  last_seen_at REAL,
  FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS quiz_queue (
  id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'ready',
  question_ids TEXT NOT NULL DEFAULT '[]',
  summary TEXT NOT NULL DEFAULT '',
  created_at REAL NOT NULL,
  consumed_at REAL,
  FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS attempts (
  id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  response TEXT NOT NULL,
  answer TEXT NOT NULL,
  score REAL NOT NULL,
  feedback TEXT NOT NULL DEFAULT '',
  created_at REAL NOT NULL,
  FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS quiz_sessions (
  id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL,
  score REAL NOT NULL,
  attempt_ids TEXT NOT NULL DEFAULT '[]',
  created_at REAL NOT NULL,
  FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_actions (
  id TEXT PRIMARY KEY,
  note_id TEXT,
  action_type TEXT NOT NULL,
  object_type TEXT NOT NULL DEFAULT '',
  object_id TEXT NOT NULL DEFAULT '',
  payload TEXT NOT NULL DEFAULT '{}',
  created_at REAL NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_questions_note ON questions(note_id);
CREATE INDEX IF NOT EXISTS idx_queue_note_state ON quiz_queue(note_id, state);
CREATE INDEX IF NOT EXISTS idx_attempts_note ON attempts(note_id);
CREATE INDEX IF NOT EXISTS idx_sessions_note ON quiz_sessions(note_id);

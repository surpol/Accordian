# Accordian.ai - Educating with an Intelligent Interface

Subtitle: A local-first Gemma 4 tutor that turns notes into personalized quiz journeys  
Track: Future of Education

## Motivation

My name is Surya, and I teach programming at theCoderSchool. In class, I saw students use AI chatbots such as Gemini for learning. The promise was obvious: students were curious, fast, and willing to build. The problem was also obvious: the chat interface often put too much responsibility on the learner. Students asked large questions with short prompts, skipped context, and received answers that were not always connected to what they actually needed to understand.

Accordian.ai was built from that observation. The goal is not to make another chatbot. The goal is to use Gemma 4 inside a learning framework where the student does less navigation and the software provides more direction. A student should be able to paste a stream of text from notes, Wikipedia, a book excerpt, or a math template, then move through a guided quiz loop that helps them understand the material.

## Design Approach

Accordian.ai is a progressive web application with local-first behavior. It is designed to feel like an installable app, while keeping the learner's notes, quiz history, and learning state in SQLite.

The core interface is quiz-first, not chat-first. Instead of asking the student to invent prompts, Accordian asks the student to provide source material. The system reads that material, generates questions, stores every answer, and prepares the next quiz. This removes friction from the study loop.

The product works as a multi-tool learning agent:

- Input Tool: receives pasted notes, Wikipedia text, book excerpts, and structured math templates.
- Map Tool: uses Gemma 4 to decompose a note into topics, concepts, source evidence, and question objects.
- Test Tool: uses Gemma 4 to create multiple-choice questions, plausible distractors, and harder follow-up checks.
- Grade Tool: grades answers against note-backed rubrics and stores matched or missing ideas.
- Memory Tool: stores notes, questions, attempts, scores, feedback, and quiz history in SQLite.
- Planner Tool: uses stored learning evidence to prepare the next quiz without requiring the student to choose every step.

The main loop is intentionally simple: add notes, take a quiz, review results, continue. The interface hides most internal complexity so the learner can focus on answering.

## Architecture

Gemma 4 is the intelligence layer. It reads each note, creates summaries, generates grounded questions, writes answer choices, and prepares follow-up quiz material. The model is bounded by prompts that instruct it to use only supplied notes, return structured JSON, and create questions that can be validated before storage.

SQLite is the memory layer. It stores notes, concepts, questions, variants, quiz sessions, attempts, feedback, scores, and user actions. This matters because Accordian should not ask Gemma to start from scratch every time. Each new quiz can include recent performance, weak concepts, mastered concepts, and previously assigned questions.

Ollama is the local model runtime used during development and demo. It runs Gemma 4 locally, which supports Accordian's privacy-first and offline-first direction. The production web version can use a reachable Gemma-compatible endpoint, while the same architecture still treats SQLite as the source of learning memory.

The UI is a PWA learning surface. The current implementation uses a lightweight Node service with a static web frontend, SQLite storage, and API routes for notes, Wikipedia import, quiz generation, quiz submission, history, and backup/restore. The mobile interface is designed around one active journey at a time.

## Challenges and Validation

The hardest challenge was preventing the app from becoming a random worksheet generator. Early versions produced repeated questions, shallow fallback questions, and quiz states that stayed stuck on "preparing." We changed the system so questions are objects connected to concepts, source excerpts, prior attempts, and canonical concept keys.

We also added validation gates. The app rejects duplicate prompts, overlapping answers, weak distractors, meta questions, and questions that are not grounded in the note. For math topics, Gemma is pushed toward concrete calculation checks instead of vague practice-plan questions. For sports or Wikipedia facts, prompts are repaired when wording could make a cumulative record sound like a single-season record.

Testing focused on repeated quiz loops. We used topics such as Photosynthesis, Java basics, Baltimore Ravens, Cleveland Cavaliers, and math templates. The expected behavior is that a perfect quiz should lead to adjacent or harder material, while missed concepts should return in a related form. SQLite stores the evidence that makes this possible.

## Impact and Next Steps

Accordian.ai addresses a real classroom problem: students often need structure more than open-ended AI conversation. The app turns raw text into a learning journey where progress is measured through evidence, not vibes. It can help students study notes, articles, book chapters, and math procedures without needing to design their own prompts or study plan.

The next step is to strengthen the production model runtime. The local Ollama flow proves the architecture, while a public demo needs a reachable Gemma endpoint or bundled on-device model path. Future work also includes richer answer grading, teacher dashboards, classroom note sets, and multimodal inputs such as worksheet photos or lecture recordings.

The key idea is simple: the note is the source material, Gemma writes and grades the tests, SQLite remembers every run, and the learner keeps moving until understanding improves.

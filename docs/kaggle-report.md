# QuizLoop.ai: Evidence-Based Learning with Gemma 4

Subtitle: An iOS-first tutor that turns any note into grounded quizzes, feedback, and local learning memory.

## Motivation

I built QuizLoop.ai for the Future of Education track from a classroom problem I see as a programming teacher at theCoderSchool. Students are excited to use AI, but open chat is often a weak learning interface. A student has to know what to ask, paste enough context, judge whether the answer is grounded, and decide what to practice next. Younger learners especially tend to send short prompts for large goals, then accept whatever the chatbot says.

QuizLoop changes the interface. Instead of asking the student to prompt-engineer a tutor, the student adds source material: class notes, Wikipedia text, a book excerpt, or a math template. QuizLoop turns that text into a guided quiz journey. The student keeps answering small checks while the system records evidence, finds weak concepts, and prepares the next useful quiz.

The product thesis is simple: the note is the curriculum, Gemma 4 creates and grades the checks, SQLite remembers the learning evidence, and the interface keeps the learner moving. This is the "multi-tool agent" idea in a learning product: the student does not see a pile of tools, but the system quietly uses the right tool at the right time.

## Product Design

QuizLoop is quiz-first, not chat-first. Chat can explain, but it does not prove that learning happened. Quizzes produce evidence. Every answer tells the system what the learner understands, what is shaky, and what should return later.

The app has four simple surfaces:

- Home: one active learning journey and the next quiz.
- Library: saved notes and understanding per note.
- History: past quizzes, scores, answers, and feedback.
- Settings: local Gemma runtime setup.

The input UX is also part of the product. Students can paste custom notes, import Wikipedia text, or start from structured templates for math and book excerpts. These are not extra features; they reduce the friction between "I have material" and "I am actively testing myself." For a learner, the first useful action should be starting a quiz, not formatting notes or deciding how to ask an AI for help.

The main loop is:

1. Save a note.
2. Gemma 4 reads it and extracts learnable concepts.
3. QuizLoop stores topics, segments, questions, answers, distractors, importance, and difficulty.
4. The learner takes a quiz.
5. Answers are graded and saved.
6. SQLite updates the learner's evidence.
7. Gemma uses that memory to create fresh, related, or harder questions.

Under the surface, QuizLoop behaves like a small learning agent made of focused tools:

- note reader: turns raw text into a source object
- concept extractor: finds topics and smaller learnable segments
- quiz generator: creates grounded checks and distractors
- answer grader: evaluates student responses against source evidence
- memory retriever: pulls prior attempts and weak concepts from SQLite
- quiz planner: chooses whether to review, deepen, or move forward
- progress tracker: turns attempts into visible understanding per note

## Learning Objects

The core technical design is an object model stored in SQLite:

- `Note`: raw source text, title, source type, processing state, and summary.
- `Topic`: a broad area extracted from the note.
- `Segment`: a small source-grounded concept.
- `Question`: prompt, answer, choices, type, topic, subtopic, segment reference, importance, difficulty, and canonical concept key.
- `Attempt`: learner response, score, feedback, matched ideas, missed ideas, and timestamp.
- `QuizSession`: a completed quiz with attempts, score, note relationship, and history.

This prevents QuizLoop from becoming a random worksheet generator. A question is not just text on the screen; it is a durable learning object. An answer is not just right or wrong; it is evidence. A quiz is not a one-off model response; it is part of a mastery path. The app can therefore adapt to the individual without asking the student to design a study plan.

## How Gemma 4 Is Used

Gemma 4 acts as bounded intelligence inside the learning framework. I did not train or publish new weights. Instead, the contribution is agentic retrieval, source grounding, validation, and a memory loop around Gemma 4.

During note processing, Gemma receives the note text and returns structured JSON: topics, concepts, grounded questions, correct answers, distractors, importance, difficulty, and source references. The system rejects unusable output before the learner sees it: duplicate prompts, overlapping choices, answer-revealing choices, meta questions, vague wording like "mentioned in the text," and questions not grounded in the note.

During quiz planning, SQLite performs agentic retrieval for Gemma. It retrieves prior questions, recent quiz attempts, weak concepts, mastered concepts, selected focus, and source excerpts. Gemma then expands the quiz bank with new questions that are adjacent, harder, or targeted at a missed concept. If a learner gets a perfect quiz, the next quiz should move forward. If a learner misses an idea, the system can bring it back in a different form.

During grading, multiple-choice answers are scored deterministically. Open-ended answers can be graded by Gemma against the expected answer, source evidence, and rubric. The goal is semantic grading: did the learner express the idea, not did they match exact wording.

## Architecture

QuizLoop has three layers. The SwiftUI app is the learning interface: Home shows the active journey and next quiz, Library stores notes, History exposes past quizzes and feedback, and Settings manages the local model. The app talks to Gemma through a GemmaService protocol, so development can use an Ollama-compatible Gemma endpoint while the production path uses Google AI Edge / LiteRT-LM for an on-device Gemma 4 E2B model.

SQLite is the memory layer. It stores Note, Topic, Segment, Question, Attempt, and QuizSession objects. Every answer, score, feedback note, concept key, source reference, and prior prompt is durable learning evidence.

Gemma 4 is the intelligence layer. QuizLoop retrieves source excerpts, weak concepts, mastered concepts, recent questions, and quiz history from SQLite, then asks Gemma for structured JSON. The app validates that JSON before showing a question: grounded source, non-duplicate prompt, plausible distractors, clear answer, and usable difficulty. This keeps Gemma bounded by the note while still giving it enough context to personalize the next quiz.

## Validation

The hardest challenge was not building a quiz screen; it was making the quizzes educationally trustworthy. A weak version of this app can look impressive while still asking repeated, shallow, or poorly grounded questions. I treated that as the main failure mode.

Validation was done through repeated end-to-end learning loops on different types of notes: science explanations, programming notes, sports biographies, company histories, and math procedures. Each run checked whether the app could:

- keep questions grounded in the saved note
- avoid duplicate prompts and repeated answer choices
- create enough checks for the size of the source text
- use quiz history when building the next quiz
- return missed concepts without trapping the learner in the same wording
- save every answer, score, and feedback object to SQLite

Those tests shaped the final framework. Questions now carry source references, concept keys, difficulty, importance, and attempt history. The app validates Gemma output before showing it to the learner, and SQLite gives Gemma the prior attempts needed to plan the next quiz. The result is still a prototype, but the important behavior is present: raw text becomes structured learning evidence, and each quiz should make the next quiz more informed.

## Impact

QuizLoop.ai reimagines AI tutoring as an evidence loop. It helps students study without designing prompts or study plans. It also gives educators a safer AI pattern: Gemma is powerful, but bounded by the learner's source material, structured memory, and measurable checks.

The real-world utility is that any stream of text can become a guided learning journey. A student can paste a chapter, import an article, or use a math template, then begin testing understanding immediately. The app keeps going until the stored evidence shows that the note is understood. That is the impact goal: make high-quality self-learning feel less like managing an AI chatbot and more like being guided by a patient tutor who remembers every attempt.

The future direction is deeper integration with the college workflow. QuizLoop can expand from text streams into PDFs, syllabi, lecture notes, slides, screenshots, and lecture audio. With Gemma 4's multimodal direction, the same framework can turn course material into grounded checks across text, images, and audio. Integrations with Canvas and Blackboard would let students convert assigned readings and class resources into quiz journeys automatically, while educators could use concept-level evidence to see where a class needs support.

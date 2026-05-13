# Accordian Web Product Design

## Purpose

Accordian turns a stream of text into a structured learning journey.

The learner should not have to decide what to study next. They provide notes, Wikipedia text, or another text source. Accordian decomposes that text into durable learning objects, tests those objects repeatedly in different forms, stores every result in SQLite, and uses Gemma to generate the next best learning step.

The product goal is simple:

> Help the learner reach 100% understanding of every important question implied by the note.

## Core Principle

A quiz is not the source of truth.

The source of truth is the note and the learning objects generated from it.

The app should work like this:

1. A note is saved.
2. Gemma decomposes the note into topics, subtopics, concepts, and question objects.
3. SQLite stores those objects permanently.
4. The app tests each question object in multiple forms.
5. Every answer updates understanding scores.
6. Gemma uses recent history and weak patterns to create new variants or adjacent questions.
7. The learner keeps moving forward until every question reaches mastery.

## Object Model

### Note

A `Note` is the raw learning source.

Examples:
- pasted class notes
- Wikipedia article text
- transcript text
- syllabus text
- textbook excerpt

Fields:
- `id`
- `title`
- `body`
- `summary`
- `source_type`
- `created_at`
- `processing_state`

The note should never disappear from the system. All learning objects trace back to a note.

### Topic

A `Topic` is a broad section of meaning inside a note.

Example for Photosynthesis:
- Photosynthesis Overview
- Light-Dependent Reactions
- Calvin Cycle
- Ecological Importance

Fields:
- `id`
- `note_id`
- `title`
- `summary`
- `importance`

Topics help organize the note, but they are not what we directly grade.

### Concept

A `Concept` is the smallest meaningful unit the learner must understand.

Example:
- chlorophyll absorbs light
- water is split in light-dependent reactions
- ATP and NADPH power the Calvin cycle
- carbon dioxide is fixed into sugars

Fields:
- `id`
- `note_id`
- `topic_id`
- `title`
- `source_excerpt`
- `importance`
- `difficulty`
- `understanding_score`
- `last_tested_at`
- `mastery_state`

Concepts are the backbone of the learning journey.

### Question Object

A `Question` is a durable testable object generated from a concept.

It is not just one prompt. It represents something the learner should be able to answer in multiple forms.

Fields:
- `id`
- `note_id`
- `topic_id`
- `concept_id`
- `canonical_prompt`
- `canonical_answer`
- `accepted_answers`
- `source_excerpt`
- `assessment_angle`
- `importance`
- `difficulty`
- `understanding_score`
- `attempt_count`
- `last_seen_at`
- `mastery_state`

Assessment angles:
- definition
- cause
- sequence
- comparison
- consequence
- application
- detail

### Delivery Variant

A `QuestionVariant` is one way to ask a question object.

The same question object can appear as:
- multiple choice
- short answer
- fill in the blank
- ordering
- true or false with explanation

Fields:
- `id`
- `question_id`
- `delivery_type`
- `prompt`
- `choices`
- `correct_answer`
- `rubric`
- `created_at`

This lets Accordian test the same idea in different ways instead of pretending one MC answer proves understanding.

### Attempt

An `Attempt` stores exactly what happened when the learner answered.

Fields:
- `id`
- `question_id`
- `variant_id`
- `quiz_session_id`
- `response`
- `score`
- `grading_reason`
- `matched_ideas`
- `missing_ideas`
- `created_at`

Attempts must snapshot prompt, answer, choices, and rubric so history stays readable even if future variants change.

### Quiz Session

A `QuizSession` is a temporary delivery container.

Fields:
- `id`
- `note_id`
- `focus_topic_id`
- `score`
- `question_ids`
- `attempt_ids`
- `created_at`

Quiz sessions are useful for history, but they are not the main intelligence layer.

### Learning Memory

`LearningMemory` summarizes the learner’s pattern.

Fields:
- `question_id`
- `concept_id`
- `latest_score`
- `average_score`
- `attempt_count`
- `delivery_breakdown`
- `weakness_reason`
- `next_due_at`
- `mastery_state`

This is the object Gemma should receive when creating the next quiz.

## Understanding Score

Every question object has an understanding score from `0.0` to `1.0`.

The score should combine:
- recent correctness
- answer quality
- difficulty
- delivery variety
- time since last success
- repeated mistakes

Example:

```text
Question Understanding =
  40% recent score
  25% average score
  15% delivery variety
  10% difficulty weight
  10% retention / time decay
```

Multiple choice can prove recognition.
Short answer can prove recall.
Explanation can prove understanding.

Therefore a question should not reach 100% from one easy multiple-choice answer.

## Mastery States

Each question should be in one state:

- `new`: never tested
- `learning`: tested but unstable
- `weak`: repeatedly missed
- `improving`: recent score is better than prior score
- `strong`: consistently correct
- `mastered`: high score across multiple delivery types

The goal of the product is to move every important question to `mastered`.

## Gemma Usage

Gemma should not freely chat or invent outside context.

Gemma should operate inside controlled jobs:

### Job 1: Decompose Note

Input:
- note title
- note body

Output:
- topics
- concepts
- canonical question objects
- source excerpts
- importance and difficulty

Rule:
Use only the note text.

### Job 2: Create Variants

Input:
- question object
- source excerpt
- prior variants

Output:
- multiple-choice variant
- short-answer variant
- fill-in-blank variant
- distractors for MC

Rule:
Variants must test the same question object from different angles.

### Job 3: Grade Rich Answers

Input:
- question object
- variant
- learner response
- rubric
- source excerpt

Output:
- score
- matched ideas
- missing ideas
- concise feedback

Rule:
Gemma grades against the note-backed rubric only.

### Job 4: Plan Next Quiz

Input:
- current question objects
- recent attempts
- weak questions
- mastered questions
- delivery history
- note coverage

Output:
- next quiz plan
- question IDs to test
- delivery type for each question
- reason for selection
- any needed new variants

Rule:
Gemma should not choose randomly. It should explain the learning reason in structured data.

## Quiz Algorithm

The next quiz should be created from SQLite memory.

Priority order:

1. New important questions not yet tested.
2. Weak questions the learner recently missed.
3. Questions answered correctly only in easy formats.
4. Questions not tested recently.
5. Strong questions that need occasional retention checks.

Avoid:
- repeating the same exact prompt in back-to-back quizzes
- testing only one subtopic
- letting MC correctness alone imply mastery
- generating questions unrelated to the note

## Web SQLite Schema Direction

The web schema should move toward:

```sql
notes
topics
concepts
questions
question_variants
attempts
quiz_sessions
learning_memory
model_runs
```

Current web app has:

```sql
notes
questions
attempts
quiz_sessions
concept_memory
model_runs
```

Next migration should add:

```sql
topics
concepts
question_variants
learning_memory
```

Then `questions` should become durable question objects, not just prompt rows.

## User Experience

The learner should experience the app as a forward journey:

1. Add a note or import Wikipedia.
2. Accordian says the learning journey is being built.
3. Start quiz.
4. Answer questions.
5. See result.
6. Review feedback if desired.
7. Continue to the next quiz.

The learner should not need to understand topics, schemas, or Gemma internals.

Visible UI should focus on:
- current note
- next quiz
- progress toward mastery
- quiz history
- review feedback

Backend can track the richer percentages.

## Success Criteria

The product is working when:

- A long note creates many question objects.
- Questions cover the full note, not only the first paragraph.
- Each question has an understanding score.
- The same question can be tested in multiple forms.
- Missed questions return in later quizzes.
- Correct MC answers do not immediately mean mastery.
- Gemma receives structured SQLite history before creating the next quiz.
- Quiz history always shows what was asked, what the learner answered, the correct answer, and why it was graded that way.

## Product Thesis

Accordian is not a chatbot.

It is a learning compiler.

It compiles text into testable learning objects, uses SQLite as durable memory, and uses Gemma as the local intelligence layer that creates, grades, and plans the next step.

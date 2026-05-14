# Accordian Web UX Todo

Goal: make the app feel like a simple Google-style learning surface. The learner should know what to do next without understanding Gemma, SQLite, quiz banks, or internal learning objects.

## Done In This Pass

- Rename top-level navigation to `Home`, `Library`, and `History`.
- Reword the product header around a private learning assistant.
- Replace internal `quiz bank` language with learner-facing `journey` and `checks`.
- Replace three separate Home metrics with one progress card.
- Keep the model badge visible but visually quiet.
- Persist active tab, active journey, draft note text, in-progress quiz, answers, and the next-quiz waiting state in browser storage.
- Prevent starting the next quiz while fresh follow-up checks are still being prepared.
- Auto-advance after selecting a multiple-choice answer.

## Next Interface Work

- Make the quiz surface full-screen focused after `Start Quiz`.
- Make the results screen show one grade first, then a clean `View Results` path.
- Improve History rows so each quiz has a useful title beyond the note name.
- Add a compact note detail section in Library so tapping a journey clearly shows the saved text stream.
- Replace vague loading states with exact states: `Reading note`, `Preparing quiz`, and `Grading`.
- Add a small progress indicator for long-running note reads.

## Product Rules

- Do not expose database terms in the UI.
- Do not show duplicate percentage signals on the same screen.
- Do not let the learner start a stale quiz when a personalized follow-up quiz is being prepared.
- Do not ask the learner to choose from implementation concepts like topics, concepts, variants, or banks.
- Keep every screen pointed forward: add text, start quiz, review results, continue.

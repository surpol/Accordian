# QuizLoop.ai

QuizLoop.ai is a Gemma 4 learning app that turns notes into adaptive quizzes. The product thesis is simple: students should not need to prompt a chatbot to learn. They should be able to add source material, take focused checks, review feedback, and keep moving through a guided learning loop.

This repository contains two surfaces:

- **iOS app**: the product direction and main architecture for the Kaggle writeup. It is built in SwiftUI with local SQLite memory and a `GemmaService` boundary for Gemma runtimes.
- **Web/PWA demo**: the public demo surface used for the video. It mirrors the same learning framework with a browser interface, Cloudflare Pages/Functions support, and a Gemma-compatible backend.

## Kaggle Positioning

Primary track: **Future of Education**.

The project fits this track because it reimagines AI tutoring as an evidence loop instead of chat. Gemma 4 decomposes notes, creates grounded questions, generates distractors, expands quizzes from learning history, and grades open-ended responses. SQLite stores the learner's evidence so future quizzes can target weak concepts and avoid shallow repetition.

The iOS app is designed around a runtime-agnostic `GemmaService` protocol. The competition-facing direction is on-device Gemma 4: the `gemma-4-E2B-it.litertlm` model through LiteRT-LM. QuizLoop uses a text-only LiteRT-LM runner on iPhone, keeps the engine warm between calls, and saves all learning state in SQLite. An Ollama-compatible endpoint is available only as a development convenience.

## Architecture

```text
Source material
  -> Note object
  -> Gemma 4 decomposition
  -> Topics / segments / question objects
  -> Quiz sessions
  -> Attempts, scores, feedback
  -> SQLite memory
  -> Next personalized quiz
```

Key objects:

- `Note`: raw learning material from pasted text, Wikipedia, books, or math templates.
- `Topic`: high-level grouping from the note.
- `Segment`: small source-grounded concept.
- `Question`: durable quiz object with prompt, answer, choices, topic, difficulty, and canonical concept key.
- `Attempt`: learner answer, score, feedback, and timestamp.
- `QuizSession`: one completed quiz and its grouped attempts.

## Repository Map

```text
AppView.swift, QuizLoopApp.swift     SwiftUI app entry points
Features/                         iOS feature screens
Models/                           Learning objects and runtime configuration
Services/                         SQLite store, TutorEngine, Gemma services
Views/                            Shared SwiftUI views
Podfile                           Optional iOS dependency path
QuizLoop.xcodeproj                Xcode project with Swift Package dependencies
web/                              PWA demo and Cloudflare backend
docs/kaggle-report.md             Current Kaggle writeup body
docs/ios-google-ai-edge.md        iOS on-device Gemma runtime notes
docs/quiz-lifecycle.md            Quiz creation and scheduling details
docs/tdd/                         Learning-loop test notes
```

## Install the iOS App

The iOS app is the product-ready QuizLoop experience. It can be installed on an iPhone or run in the iOS Simulator from Xcode.

Requirements:

- macOS with Xcode installed
- iOS 17 or newer simulator/device
- A recent iPhone for on-device Gemma 4 E2B inference. The model is large, so newer devices with more memory work best.
- Swift Package resolution in Xcode
- Optional developer convenience: a local Gemma 4 endpoint

Clone the repo:

```bash
git clone https://github.com/surpol/QuizLoop.ai.git
cd QuizLoop.ai
```

Run the app in Xcode:

```bash
open QuizLoop.xcodeproj
```

Then choose an iPhone simulator or a connected iPhone and press **Run**.

The current Xcode project links the LiteRT-LM package path used by the app and includes a build phase that re-signs the nested LiteRT runtime library for device builds.

### Primary Runtime Target: LiteRT-LM Gemma 4

The production offline target is the official LiteRT-LM Gemma 4 E2B model:

```text
gemma-4-E2B-it.litertlm
```

This model card describes the artifact as ready for deployment on Android, iOS, desktop, IoT, and web, with support for long text context. QuizLoop keeps this behind the `GemmaService` runtime boundary so the learning framework does not change if the runtime package changes.

The app can download the `.litertlm` model from **Settings -> Model**, or you can package the model with the app target for a judge/demo build so setup is instant and does not depend on a slow first-run download.

On first local quiz creation, the iPhone may take roughly 30-45 seconds to generate starter questions because Gemma is running on-device. After the engine is warm, QuizLoop reuses the text-only LiteRT-LM engine instead of reloading the model for every request.

### iPhone Setup Flow

1. Build and run the app from Xcode on a connected iPhone.
2. Open **Settings -> Model**.
3. Choose **Use LiteRT-LM Gemma 4**.
4. Download or import `gemma-4-E2B-it.litertlm`.
5. Tap **Use Model** / **Save and Test**.
6. Return to Home, add a note, and tap **Try Again** or **Start Quiz** once the note is ready.

If the app says **Connect model**, check Settings first. If the app says **Creating questions**, leave it open while the first local quiz is generated.

### Optional Runtime: Local Development Server

For development, the same `GemmaService` boundary can talk to an Ollama-compatible Gemma endpoint:

```bash
ollama pull gemma4:e2b
ollama serve
```

This is useful while building and debugging, but it is not the core submission architecture. On a physical iPhone, `127.0.0.1` points to the phone, not your Mac. Use your Mac's LAN IP address if you are testing this path.

The app supports runtime modes through the same `GemmaService` protocol:

- **LiteRT-LM**: official Gemma 4 E2B mobile artifact target, using `gemma-4-E2B-it.litertlm`. This is the iOS submission direction.
- **Gemma Server**: development-only mode using an Ollama-compatible endpoint.

The repo still includes CocoaPods files from the earlier MediaPipe exploration, but the working iPhone path is LiteRT-LM.

## Run the Web Demo

```bash
cd web
npm run dev
```

Open:

```text
http://localhost:4173
```

Public demo:

```text
https://accordian-bgp.pages.dev/
```

The hosted web app needs a reachable Gemma-compatible backend for live generation. The public web demo is useful for showing the learning loop, while the iOS app is the product-ready offline direction.

## Gemma 4 Runtime

The iOS app is designed to make Gemma 4 local to the product rather than a cloud chatbot. The preferred target is LiteRT-LM with `gemma-4-E2B-it.litertlm`.

Current iOS runtime behavior:

- Uses a direct `CLiteRTLM` text-only runner for `.litertlm` models.
- Passes `nil` for vision/audio runtime backends because QuizLoop currently needs text generation for note decomposition, quiz creation, and grading.
- Reuses a single LiteRT-LM engine across requests to avoid reloading the large model.
- Creates short starter quiz banks on-device first, then stores them in SQLite so users can begin learning.
- Avoids large background expansion prompts on iPhone because they can exceed the mobile runtime context window.

For local development only, you can use an Ollama-compatible endpoint:

```bash
ollama pull gemma4:e2b
ollama serve
```

The web backend reads:

```text
GEMMA_BASE_URL
GEMMA_API_TOKEN
GEMMA_MODEL=gemma4:e2b
```

The iOS runtime path is documented in [docs/ios-google-ai-edge.md](docs/ios-google-ai-edge.md).

## Debugging iPhone Builds

Useful commands:

```bash
xcodebuild -workspace QuizLoop.xcworkspace -scheme QuizLoop -configuration Debug -destination 'id=<DEVICE_ID>' build
xcrun devicectl device install app --device <COREDEVICE_ID> ~/Library/Developer/Xcode/DerivedData/QuizLoop-*/Build/Products/Debug-iphoneos/QuizLoop.app
xcrun devicectl device process launch --device <COREDEVICE_ID> --terminate-existing --activate --console com.suryapolina.quizloop
```

Important logs are prefixed with:

```text
[QuizLoop][Gemma]
[QuizLoop][Tutor]
```

## Submission Links

- Live web demo: https://accordian-bgp.pages.dev/
- Kaggle writeup source: [docs/kaggle-report.md](docs/kaggle-report.md)
- iOS edge notes: [docs/ios-google-ai-edge.md](docs/ios-google-ai-edge.md)
- Web deployment notes: [web/DEPLOYMENT.md](web/DEPLOYMENT.md)

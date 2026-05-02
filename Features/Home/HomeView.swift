import SwiftUI

struct HomeView: View {
    @EnvironmentObject private var assistant: TutorEngine
    @EnvironmentObject private var speechService: SpeechService
    @State private var typedPrompt = ""

    var body: some View {
        ScrollViewReader { proxy in
            VStack(spacing: 0) {
                ScrollView {
                    VStack(spacing: 18) {
                        AssistantHeader(isResponding: assistant.isResponding)

                        TranscriptPanel(
                            transcript: speechService.transcript,
                            state: speechService.state,
                            isRecording: speechService.isRecording
                        )

                        ConversationView(turns: assistant.turns)
                    }
                    .padding(20)
                    .id("conversation-bottom")
                }

                AssistantControls(
                    text: $typedPrompt,
                    isRecording: speechService.isRecording,
                    isResponding: assistant.isResponding,
                    onMicTap: handleMicTap,
                    onSubmit: submitTypedPrompt
                )
            }
            .background(WavesTheme.background)
            .navigationTitle("Waves")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        assistant.reset()
                    } label: {
                        Image(systemName: "arrow.counterclockwise")
                    }
                    .accessibilityLabel("Reset conversation")
                }
            }
            .onChange(of: assistant.turns.count) {
                withAnimation(.snappy) {
                    proxy.scrollTo("conversation-bottom", anchor: .bottom)
                }
            }
        }
    }

    private func handleMicTap() {
        if speechService.isRecording {
            let prompt = speechService.transcript
            speechService.stopRecording()
            submit(prompt)
        } else {
            speechService.toggleRecording()
        }
    }

    private func submitTypedPrompt() {
        let prompt = typedPrompt
        typedPrompt = ""
        submit(prompt)
    }

    private func submit(_ prompt: String) {
        Task {
            if let response = await assistant.submit(prompt) {
                speechService.speak(response)
            }
        }
    }
}

private struct AssistantHeader: View {
    let isResponding: Bool

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "waveform.circle.fill")
                .font(.system(size: 68))
                .foregroundStyle(.teal)

            Text(isResponding ? "Thinking..." : "Ask Waves")
                .font(.largeTitle.weight(.bold))

            Text("Powered by your local Gemma 4 model.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 28)
    }
}

private struct TranscriptPanel: View {
    let transcript: String
    let state: SpeechService.RecordingState
    let isRecording: Bool

    var body: some View {
        VStack(spacing: 14) {
            WaveformBars(isActive: isRecording)
                .frame(height: 46)

            Text(transcript.isEmpty ? statusText : transcript)
                .font(.body)
                .foregroundStyle(transcript.isEmpty ? .secondary : .primary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(14)
                .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 8))
        }
        .padding(16)
        .background(Color(.systemBackground), in: RoundedRectangle(cornerRadius: 8))
    }

    private var statusText: String {
        switch state {
        case .idle:
            "Tap the microphone and speak."
        case .requestingPermission:
            "Checking voice permissions..."
        case .recording:
            "Listening..."
        case .unavailable(let message):
            message
        }
    }
}

private struct WaveformBars: View {
    let isActive: Bool

    private let heights: [CGFloat] = [16, 28, 40, 22, 34, 46, 28, 38, 20, 32]

    var body: some View {
        HStack(spacing: 7) {
            ForEach(Array(heights.enumerated()), id: \.offset) { index, height in
                RoundedRectangle(cornerRadius: 3)
                    .fill(isActive ? Color.teal.gradient : Color.gray.opacity(0.28).gradient)
                    .frame(width: 10, height: isActive ? height : max(10, height * 0.42))
                    .animation(
                        .easeInOut(duration: 0.6)
                            .repeatForever(autoreverses: true)
                            .delay(Double(index) * 0.05),
                        value: isActive
                    )
            }
        }
        .frame(maxWidth: .infinity)
        .accessibilityHidden(true)
    }
}

private struct ConversationView: View {
    let turns: [TutorTurn]

    var body: some View {
        VStack(spacing: 12) {
            ForEach(turns) { turn in
                HStack {
                    if turn.speaker == .learner {
                        Spacer(minLength: 36)
                    }

                    Text(turn.text)
                        .font(.body)
                        .foregroundStyle(turn.speaker == .learner ? .white : .primary)
                        .padding(14)
                        .background(
                            turn.speaker == .learner ? Color.teal : Color(.secondarySystemBackground),
                            in: RoundedRectangle(cornerRadius: 8)
                        )

                    if turn.speaker == .waves {
                        Spacer(minLength: 36)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity)
    }
}

private struct AssistantControls: View {
    @Binding var text: String
    let isRecording: Bool
    let isResponding: Bool
    let onMicTap: () -> Void
    let onSubmit: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            Button(action: onMicTap) {
                Image(systemName: isRecording ? "stop.fill" : "mic.fill")
                    .frame(width: 48, height: 48)
                    .background(isRecording ? .red : .teal, in: Circle())
                    .foregroundStyle(.white)
            }
            .disabled(isResponding)
            .accessibilityLabel(isRecording ? "Stop recording" : "Start recording")

            TextField("Message Waves", text: $text, axis: .vertical)
                .textFieldStyle(.plain)
                .lineLimit(1...3)
                .padding(12)
                .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 8))
                .submitLabel(.send)
                .onSubmit(onSubmit)

            Button(action: onSubmit) {
                Image(systemName: isResponding ? "hourglass" : "arrow.up")
                    .frame(width: 44, height: 44)
                    .background(canSend ? Color.teal : Color.gray.opacity(0.3), in: Circle())
                    .foregroundStyle(.white)
            }
            .disabled(canSend == false)
            .accessibilityLabel("Send message")
        }
        .padding(16)
        .background(.regularMaterial)
    }

    private var canSend: Bool {
        text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false && isResponding == false
    }
}

#Preview {
    NavigationStack {
        HomeView()
            .environmentObject(TutorEngine())
            .environmentObject(SpeechService())
    }
}

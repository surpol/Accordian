import AVFoundation
import Foundation
import Speech

@MainActor
final class SpeechService: ObservableObject {
    enum RecordingState {
        case idle
        case requestingPermission
        case recording
        case unavailable(String)
    }

    private let recognizer = SFSpeechRecognizer()
    private let audioEngine = AVAudioEngine()
    private let speechSynthesizer = AVSpeechSynthesizer()
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?

    @Published var state: RecordingState = .idle
    @Published var transcript = ""

    var isRecording: Bool {
        if case .recording = state { return true }
        return false
    }

    func toggleRecording() {
        if isRecording {
            stopRecording()
        } else {
            Task { await startRecording() }
        }
    }

    func startRecording() async {
        state = .requestingPermission

        let speechStatus = await requestSpeechAuthorization()
        guard speechStatus == .authorized else {
            state = .unavailable("Speech recognition permission is needed to learn by voice.")
            return
        }

        let audioStatus = await requestMicrophoneAuthorization()
        guard audioStatus else {
            state = .unavailable("Microphone permission is needed to hear your questions.")
            return
        }

        do {
            try configureRecognition()
            transcript = ""
            state = .recording
        } catch {
            state = .unavailable(error.localizedDescription)
        }
    }

    func stopRecording() {
        audioEngine.stop()
        audioEngine.inputNode.removeTap(onBus: 0)
        recognitionRequest?.endAudio()
        recognitionTask?.cancel()
        recognitionRequest = nil
        recognitionTask = nil
        state = .idle
    }

    func speak(_ text: String) {
        speechSynthesizer.stopSpeaking(at: .immediate)

        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = AVSpeechSynthesisVoice(language: "en-US")
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate

        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio)
        speechSynthesizer.speak(utterance)
    }

    private func configureRecognition() throws {
        recognitionTask?.cancel()
        recognitionTask = nil

        let audioSession = AVAudioSession.sharedInstance()
        try audioSession.setCategory(.record, mode: .measurement, options: .duckOthers)
        try audioSession.setActive(true, options: .notifyOthersOnDeactivation)

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        recognitionRequest = request

        guard let recognizer, recognizer.isAvailable else {
            throw SpeechServiceError.recognizerUnavailable
        }

        recognitionTask = recognizer.recognitionTask(with: request) { [weak self] result, error in
            Task { @MainActor in
                guard let self else { return }
                if let result {
                    self.transcript = result.bestTranscription.formattedString
                }
                if error != nil || result?.isFinal == true {
                    self.stopRecording()
                }
            }
        }

        let inputNode = audioEngine.inputNode
        let format = inputNode.outputFormat(forBus: 0)
        inputNode.installTap(onBus: 0, bufferSize: 1_024, format: format) { [weak request] buffer, _ in
            request?.append(buffer)
        }

        audioEngine.prepare()
        try audioEngine.start()
    }

    private func requestSpeechAuthorization() async -> SFSpeechRecognizerAuthorizationStatus {
        await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { status in
                continuation.resume(returning: status)
            }
        }
    }

    private func requestMicrophoneAuthorization() async -> Bool {
        await withCheckedContinuation { continuation in
            AVAudioApplication.requestRecordPermission { isAllowed in
                continuation.resume(returning: isAllowed)
            }
        }
    }
}

enum SpeechServiceError: LocalizedError {
    case recognizerUnavailable

    var errorDescription: String? {
        switch self {
        case .recognizerUnavailable:
            "Speech recognition is unavailable on this device."
        }
    }
}

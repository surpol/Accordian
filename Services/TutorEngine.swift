import Foundation

@MainActor
final class TutorEngine: ObservableObject {
    @Published private(set) var turns: [TutorTurn]

    @Published private(set) var isResponding = false
    @Published private(set) var lastError: String?

    private let gemmaService: GemmaService
    private let conversationStore: ConversationStore

    init(
        gemmaService: GemmaService = OllamaGemmaService(),
        conversationStore: ConversationStore = ConversationStore()
    ) {
        self.gemmaService = gemmaService
        self.conversationStore = conversationStore

        let savedTurns = conversationStore.loadTurns()
        if savedTurns.isEmpty {
            let welcomeTurn = TutorTurn(
                speaker: .waves,
                text: "Hi, I am Waves. Tap the mic and ask me anything.",
                createdAt: .now
            )
            self.turns = [welcomeTurn]
            conversationStore.save(welcomeTurn)
        } else {
            self.turns = savedTurns
        }
    }

    @discardableResult
    func submit(_ prompt: String) async -> String? {
        let trimmedPrompt = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmedPrompt.isEmpty == false else { return nil }

        appendTurn(TutorTurn(speaker: .learner, text: trimmedPrompt, createdAt: .now))
        isResponding = true
        lastError = nil

        do {
            let response = try await gemmaService.reply(to: conversationHistory())
            appendTurn(TutorTurn(speaker: .waves, text: response, createdAt: .now))
            isResponding = false
            return response
        } catch {
            let message = "I could not reach Gemma. Make sure Ollama is running with the Gemma 4 model, then try again."
            lastError = error.localizedDescription
            appendTurn(TutorTurn(speaker: .waves, text: message, createdAt: .now))
            isResponding = false
            return message
        }
    }

    func reset() {
        lastError = nil
        conversationStore.deleteAll()

        let freshTurn = TutorTurn(
            speaker: .waves,
            text: "Fresh session ready. What would you like to ask?",
            createdAt: .now
        )
        turns = [freshTurn]
        conversationStore.save(freshTurn)
    }

    private func appendTurn(_ turn: TutorTurn) {
        turns.append(turn)
        conversationStore.save(turn)
    }

    private func conversationHistory() -> [GemmaMessage] {
        turns.map { turn in
            GemmaMessage(
                role: turn.speaker == .learner ? "user" : "assistant",
                content: turn.text
            )
        }
    }
}

struct GemmaMessage: Codable, Equatable {
    let role: String
    let content: String
}

protocol GemmaService {
    func reply(to messages: [GemmaMessage]) async throws -> String
}

struct OllamaGemmaService: GemmaService {
    var endpoint = URL(string: "http://127.0.0.1:11434/api/chat")!
    var model = "gemma4:e2b"

    func reply(to messages: [GemmaMessage]) async throws -> String {
        let requestBody = OllamaChatRequest(
            model: model,
            messages: [
                GemmaMessage(
                    role: "system",
                    content: "You are Waves, a simple helpful voice assistant. Keep answers concise and natural to speak out loud."
                )
            ] + messages,
            stream: false
        )

        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(requestBody)

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse, 200..<300 ~= httpResponse.statusCode else {
            throw GemmaServiceError.badResponse
        }

        let decoded = try JSONDecoder().decode(OllamaChatResponse.self, from: data)
        return decoded.message.content.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

private struct OllamaChatRequest: Codable {
    let model: String
    let messages: [GemmaMessage]
    let stream: Bool
}

private struct OllamaChatResponse: Codable {
    let message: GemmaMessage
}

enum GemmaServiceError: LocalizedError {
    case badResponse

    var errorDescription: String? {
        switch self {
        case .badResponse:
            "Gemma returned an invalid response."
        }
    }
}

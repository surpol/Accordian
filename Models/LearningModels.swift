import Foundation

struct TutorTurn: Identifiable, Equatable {
    enum Speaker {
        case learner
        case waves
    }

    let id: UUID
    let speaker: Speaker
    let text: String
    let createdAt: Date

    init(id: UUID = UUID(), speaker: Speaker, text: String, createdAt: Date) {
        self.id = id
        self.speaker = speaker
        self.text = text
        self.createdAt = createdAt
    }
}

struct LearningTopic: Identifiable, Equatable {
    let id = UUID()
    let title: String
    let summary: String
    let mastery: Double
}

struct LearningInsight: Identifiable, Equatable {
    let id = UUID()
    let title: String
    let detail: String
    let systemImage: String
}

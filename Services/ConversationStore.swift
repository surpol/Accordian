import Foundation
import SQLite3

private let sqliteTransient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

final class ConversationStore {
    private let databaseURL: URL
    private var database: OpaquePointer?

    init(databaseURL: URL = ConversationStore.defaultDatabaseURL()) {
        self.databaseURL = databaseURL
        open()
        createSchema()
    }

    deinit {
        sqlite3_close(database)
    }

    func loadTurns() -> [TutorTurn] {
        let sql = """
        SELECT id, speaker, text, created_at
        FROM messages
        ORDER BY created_at ASC
        """

        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(database, sql, -1, &statement, nil) == SQLITE_OK else {
            return []
        }
        defer { sqlite3_finalize(statement) }

        var turns: [TutorTurn] = []
        while sqlite3_step(statement) == SQLITE_ROW {
            guard
                let idText = sqlite3_column_text(statement, 0),
                let speakerText = sqlite3_column_text(statement, 1),
                let messageText = sqlite3_column_text(statement, 2)
            else {
                continue
            }

            let idString = String(cString: idText)
            let speakerString = String(cString: speakerText)
            let text = String(cString: messageText)
            let createdAt = Date(timeIntervalSince1970: sqlite3_column_double(statement, 3))

            guard
                let id = UUID(uuidString: idString),
                let speaker = TutorTurn.Speaker(databaseValue: speakerString)
            else {
                continue
            }

            turns.append(TutorTurn(id: id, speaker: speaker, text: text, createdAt: createdAt))
        }

        return turns
    }

    func save(_ turn: TutorTurn) {
        let sql = """
        INSERT OR REPLACE INTO messages (id, speaker, text, created_at)
        VALUES (?, ?, ?, ?)
        """

        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(database, sql, -1, &statement, nil) == SQLITE_OK else {
            return
        }
        defer { sqlite3_finalize(statement) }

        sqlite3_bind_text(statement, 1, turn.id.uuidString, -1, sqliteTransient)
        sqlite3_bind_text(statement, 2, turn.speaker.databaseValue, -1, sqliteTransient)
        sqlite3_bind_text(statement, 3, turn.text, -1, sqliteTransient)
        sqlite3_bind_double(statement, 4, turn.createdAt.timeIntervalSince1970)
        sqlite3_step(statement)
    }

    func deleteAll() {
        sqlite3_exec(database, "DELETE FROM messages", nil, nil, nil)
    }

    private func open() {
        let directory = databaseURL.deletingLastPathComponent()
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        sqlite3_open(databaseURL.path, &database)
    }

    private func createSchema() {
        let sql = """
        CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY NOT NULL,
            speaker TEXT NOT NULL,
            text TEXT NOT NULL,
            created_at REAL NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_messages_created_at
        ON messages(created_at);
        """

        sqlite3_exec(database, sql, nil, nil, nil)
    }

    private static func defaultDatabaseURL() -> URL {
        let baseURL = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return baseURL.appending(path: "Waves", directoryHint: .isDirectory).appending(path: "conversations.sqlite")
    }
}

private extension TutorTurn.Speaker {
    init?(databaseValue: String) {
        switch databaseValue {
        case "learner":
            self = .learner
        case "waves":
            self = .waves
        default:
            return nil
        }
    }

    var databaseValue: String {
        switch self {
        case .learner:
            "learner"
        case .waves:
            "waves"
        }
    }
}

import SwiftUI

struct AppView: View {
    @State private var selectedTab: AppTab = .ask
    @State private var draftPrompt = ""

    var body: some View {
        TabView(selection: $selectedTab) {
            NavigationStack {
                AskView(draftPrompt: $draftPrompt) {
                    selectedTab = .notes
                }
            }
            .tabItem {
                Label("Learn", systemImage: "sparkles")
            }
            .tag(AppTab.ask)

            NavigationStack {
                NotesView { prompt in
                    draftPrompt = prompt
                    selectedTab = .ask
                }
            }
            .tabItem {
                Label("Notes", systemImage: "tray.full")
            }
            .tag(AppTab.notes)

            NavigationStack {
                QuizzesView()
            }
            .tabItem {
                Label("Quizzes", systemImage: "checklist")
            }
            .tag(AppTab.quizzes)

            NavigationStack {
                SettingsView()
            }
            .tabItem {
                Label("Settings", systemImage: "gearshape")
            }
            .tag(AppTab.settings)
        }
        .tint(.teal)
    }
}

private enum AppTab {
    case ask
    case notes
    case quizzes
    case settings
}

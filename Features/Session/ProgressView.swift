import SwiftUI

struct ProgressScreen: View {
    var body: some View {
        Text("Waves")
            .navigationTitle("Waves")
    }
}

#Preview {
    NavigationStack {
        ProgressScreen()
            .environmentObject(TutorEngine())
    }
}

import SwiftUI

struct LibraryView: View {
    var body: some View {
        Text("Waves")
            .navigationTitle("Waves")
    }
}

#Preview {
    NavigationStack {
        LibraryView()
            .environmentObject(TutorEngine())
    }
}

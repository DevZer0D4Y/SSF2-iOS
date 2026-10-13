import Foundation

/// Session-only scratch storage for compressed sprites, outside WebKit's memory budget.
/// The file is unlinked immediately: it disappears on process exit, including a crash.
final class TextureStore {
    private var file: FileHandle?
    private var entries: [Int: (offset: UInt64, count: Int)] = [:]
    private var free: [(offset: UInt64, count: Int)] = []
    private var end: UInt64 = 0
    private var next = 1
    private let maximumBlob = 32 * 1024 * 1024
    private let maximumFile: UInt64 = 2 * 1024 * 1024 * 1024

    init() {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("ssf2-textures-\(UUID().uuidString)")
        if FileManager.default.createFile(atPath: url.path, contents: nil) {
            file = try? FileHandle(forUpdating: url)
            try? FileManager.default.removeItem(at: url)
        }
    }
    deinit { try? file?.close() }

    func respond(_ message: String) -> String? {
        guard message.utf8.count <= maximumBlob * 4 / 3 + 1024,
              let input = message.data(using: .utf8),
              let request = (try? JSONSerialization.jsonObject(with: input)) as? [String: String],
              let file else { return nil }
        do {
            switch request["op"] {
            case "reset":
                try file.truncate(atOffset: 0)
                entries.removeAll(); free.removeAll(); end = 0; next = 1
                return "ok"
            case "put":
                guard let encoded = request["data"], let data = Data(base64Encoded: encoded),
                      !data.isEmpty, data.count <= maximumBlob else { return nil }
                let offset: UInt64
                if let i = free.indices.filter({ free[$0].count >= data.count }).min(by: { free[$0].count < free[$1].count }) {
                    let slot = free.remove(at: i); offset = slot.offset
                    if slot.count > data.count { free.append((offset + UInt64(data.count), slot.count - data.count)) }
                } else {
                    guard end + UInt64(data.count) <= maximumFile else { return nil }
                    offset = end; end += UInt64(data.count)
                }
                try file.seek(toOffset: offset); try file.write(contentsOf: data)
                let id = next; next += 1; entries[id] = (offset, data.count)
                return String(id)
            case "get":
                guard let raw = request["id"], let id = Int(raw), let entry = entries[id] else { return nil }
                try file.seek(toOffset: entry.offset)
                guard let data = try file.read(upToCount: entry.count), data.count == entry.count else { return nil }
                return data.base64EncodedString()
            case "drop":
                guard let raw = request["id"], let id = Int(raw) else { return nil }
                if let entry = entries.removeValue(forKey: id) {
                    free.append(entry); free.sort { $0.offset < $1.offset }
                    var merged: [(offset: UInt64, count: Int)] = []
                    for slot in free {
                        if let last = merged.last, last.offset + UInt64(last.count) == slot.offset {
                            merged[merged.count - 1].count += slot.count
                        } else { merged.append(slot) }
                    }
                    free = merged
                }
                return "ok"
            default: return nil
            }
        } catch { return nil }
    }
}

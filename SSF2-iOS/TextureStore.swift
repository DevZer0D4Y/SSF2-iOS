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

    func reset() throws {
        guard let file else { throw CocoaError(.fileWriteUnknown) }
        try file.truncate(atOffset: 0)
        entries.removeAll(); free.removeAll(); end = 0; next = 1
    }
    func put(_ data: Data) throws -> String {
        guard let file, !data.isEmpty, data.count <= maximumBlob else { throw CocoaError(.fileWriteUnknown) }
        let offset: UInt64
        if let i = free.indices.filter({ free[$0].count >= data.count }).min(by: { free[$0].count < free[$1].count }) {
            let slot = free.remove(at: i); offset = slot.offset
            if slot.count > data.count { free.append((offset + UInt64(data.count), slot.count - data.count)) }
        } else {
            guard end + UInt64(data.count) <= maximumFile else { throw CocoaError(.fileWriteOutOfSpace) }
            offset = end; end += UInt64(data.count)
        }
        try file.seek(toOffset: offset); try file.write(contentsOf: data)
        let id = next; next += 1; entries[id] = (offset, data.count)
        return String(id)
    }
    func get(_ raw: String) throws -> Data {
        guard let file, let id = Int(raw), let entry = entries[id] else { throw CocoaError(.fileReadUnknown) }
        try file.seek(toOffset: entry.offset)
        guard let data = try file.read(upToCount: entry.count), data.count == entry.count else { throw CocoaError(.fileReadUnknown) }
        return data
    }
    func drop(_ raw: String) throws {
        guard let id = Int(raw) else { throw CocoaError(.fileReadUnknown) }
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
    }
    /// Binary, same-origin requests avoid WebKit's JavaScript-dialog machinery and base64 copies.
    func respond(_ request: URLRequest) -> (Int, Data) {
        guard let url = request.url, url.scheme == "ssf2", url.host == "localhost" else { return (403, Data()) }
        let parts = url.path.split(separator: "/").map(String.init)
        guard parts.first == "__ssf2_texture", parts.count >= 2 else { return (404, Data()) }
        do {
            switch (request.httpMethod ?? "GET", parts[1], parts.count) {
            case ("POST", "reset", 2): try reset(); return (200, Data("ok".utf8))
            case ("POST", "put", 2):
                guard let data = request.httpBody else { return (400, Data()) }
                return (200, Data(try put(data).utf8))
            case ("GET", "get", 3): return (200, try get(parts[2]))
            case ("POST", "drop", 3): try drop(parts[2]); return (200, Data("ok".utf8))
            default: return (400, Data())
            }
        } catch { return (507, Data()) }
    }

    // Retain the data-only helper for cache unit tests and older development harnesses.
    func respond(_ message: String) -> String? {
        guard message.utf8.count <= maximumBlob * 4 / 3 + 1024,
              let input = message.data(using: .utf8),
              let request = (try? JSONSerialization.jsonObject(with: input)) as? [String: String] else { return nil }
        do {
            switch request["op"] {
            case "reset": try reset(); return "ok"
            case "put":
                guard let encoded = request["data"], let data = Data(base64Encoded: encoded) else { return nil }
                return try put(data)
            case "get": return try get(request["id"] ?? "").base64EncodedString()
            case "drop": try drop(request["id"] ?? ""); return "ok"
            default: return nil
            }
        } catch { return nil }
    }
}

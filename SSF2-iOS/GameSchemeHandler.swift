import Foundation
import WebKit

/// Serves the bundled Web folder to WebKit as ssf2://localhost/…, straight from the app bundle.
/// No sockets and no network stack are involved, so the game loads the same way with or without
/// Wi-Fi, survives the app being suspended, and keeps one stable origin for Flash save data.
final class GameSchemeHandler: NSObject, WKURLSchemeHandler {
    static let scheme = "ssf2"
    static let host = "localhost"
    static let startURL = URL(string: "\(scheme)://\(host)/index.html")!
    static let types = ["html": "text/html; charset=utf-8", "css": "text/css", "js": "text/javascript", "wasm": "application/wasm", "json": "application/json", "map": "application/json", "png": "image/png", "svg": "image/svg+xml", "swf": "application/x-shockwave-flash"]

    /// Called on the main thread after each request with its path, status and body size.
    var onResponse: ((String, Int, Int) -> Void)?
    private let root: URL
    private let textures: TextureStore?
    private let queue = DispatchQueue(label: "ssf2.assets", qos: .userInitiated, attributes: .concurrent)
    private var active: [ObjectIdentifier: WKURLSchemeTask] = [:]

    init(root: URL, textures: TextureStore? = nil) {
        self.textures = textures
        self.root = root.standardizedFileURL.resolvingSymlinksInPath()
    }

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        if task.request.url?.path.hasPrefix("/__ssf2_texture/") == true {
            let (status, data) = textures?.respond(task.request) ?? (503, Data())
            guard let url = task.request.url else { return }
            task.didReceive(HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: ["Content-Type":"application/octet-stream", "Cache-Control":"no-store", "Content-Length":String(data.count)])!)
            if !data.isEmpty { task.didReceive(data) }
            task.didFinish()
            return
        }
        let id = ObjectIdentifier(task)
        active[id] = task
        let request = task.request
        queue.async { [root] in
            let (status, path, data, mime) = Self.read(request, root: root)
            DispatchQueue.main.async {
                // WebKit raises if a stopped task is answered, so only reply to tasks still in flight.
                guard self.active.removeValue(forKey: id) === task, let url = request.url else { return }
                let headers = ["Content-Type": mime, "Content-Length": String(data.count), "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*"]
                task.didReceive(HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: headers)!)
                if request.httpMethod != "HEAD", !data.isEmpty { task.didReceive(data) }
                task.didFinish()
                self.onResponse?(path, status, data.count)
            }
        }
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {
        active.removeValue(forKey: ObjectIdentifier(task))
    }

    private static func read(_ request: URLRequest, root: URL) -> (Int, String, Data, String) {
        let fail = { (status: Int, path: String) in (status, path, Data(), "text/plain") }
        guard let url = request.url, url.host == host else { return fail(400, request.url?.absoluteString ?? "?") }
        let decoded = url.path // already percent-decoded
        guard ["GET", "HEAD"].contains(request.httpMethod ?? "GET") else { return fail(405, decoded) }
        guard !decoded.contains("\0"), !decoded.contains("\\") else { return fail(400, decoded) }
        let path = decoded == "/" || decoded.isEmpty ? "index.html" : String(decoded.drop(while: { $0 == "/" }))
        let file = root.appendingPathComponent(path).standardizedFileURL.resolvingSymlinksInPath()
        guard file.path.hasPrefix(root.path + "/") else { return fail(403, decoded) }
        guard let data = try? Data(contentsOf: file, options: .mappedIfSafe) else { return fail(404, decoded) }
        return (200, decoded, data, types[file.pathExtension.lowercased()] ?? "application/octet-stream")
    }
}

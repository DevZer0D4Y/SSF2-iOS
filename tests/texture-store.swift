import Foundation
@main struct TextureStoreTests {
    static func main() {
        let store = TextureStore()
        func call(_ values: [String:String]) -> String? {
            let data = try! JSONSerialization.data(withJSONObject: values)
            return store.respond(String(data: data, encoding: .utf8)!)
        }
        assert(call(["op":"reset"]) == "ok")
        let a = Data(repeating: 23, count: 128 * 1024), b = Data(repeating: 42, count: 64 * 1024)
        let first = call(["op":"put", "data":a.base64EncodedString()])!
        assert(call(["op":"get", "id":first]) == a.base64EncodedString())
        assert(call(["op":"drop", "id":first]) == "ok")
        let second = call(["op":"put", "data":b.base64EncodedString()])!
        assert(call(["op":"get", "id":second]) == b.base64EncodedString())
        assert(call(["op":"get", "id":first]) == nil)
        for _ in 0..<100 {
            let id = call(["op":"put", "data":a.base64EncodedString()])!
            assert(call(["op":"get", "id":id]) == a.base64EncodedString())
            assert(call(["op":"drop", "id":id]) == "ok")
        }
        assert(call(["op":"put", "data":"not base64"]) == nil)
        assert(call(["op":"get", "id":"../file"]) == nil)
        assert(store.respond("invalid JSON") == nil)
        assert(call(["op":"reset"]) == "ok")
        assert(call(["op":"get", "id":second]) == nil)
        print("PASS: native sprite storage, exact reads, freed slot reuse, invalid requests and session reset")
    }
}

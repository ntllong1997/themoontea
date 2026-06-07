import Foundation

/// Supabase Realtime (v2) **Broadcast** client.
///
/// Uses a pub/sub broadcast channel — no postgres `Replication` publication is
/// required. The trade-off: the writer must call `broadcastChange()` itself
/// after every successful insert/update, so other clients refresh.
actor SupabaseRealtime {

    typealias ChangeHandler = @Sendable () -> Void

    private let channelName: String
    private let topic: String
    private let broadcastEvent: String

    private var task: URLSessionWebSocketTask?
    private var session: URLSession?
    private var heartbeatTask: Task<Void, Never>?
    private var receiveTask: Task<Void, Never>?
    private var reconnectTask: Task<Void, Never>?
    private var refCounter: Int = 0
    private var joinRef: String = ""
    private var onChange: ChangeHandler?
    private var isStopped: Bool = true
    private var isJoined: Bool = false
    private var backoff: UInt64 = 1_000_000_000 // 1s

    /// - Parameter channelName: any room name — every client subscribing to
    ///   the same name shares the channel.
    /// - Parameter broadcastEvent: the event name used for change notifications.
    init(channelName: String, broadcastEvent: String = "changed") {
        self.channelName = channelName
        self.topic = "realtime:\(channelName)"
        self.broadcastEvent = broadcastEvent
    }

    func subscribe(onChange: @escaping ChangeHandler) async {
        self.onChange = onChange
        guard isStopped else { return }  // Already connected; just update the handler
        isStopped = false
        await connect()
    }

    func unsubscribe() {
        isStopped = true
        isJoined = false
        heartbeatTask?.cancel(); heartbeatTask = nil
        receiveTask?.cancel();   receiveTask = nil
        reconnectTask?.cancel(); reconnectTask = nil
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
    }

    /// Publish a "something changed" ping to every other subscriber on this channel.
    func broadcastChange(payload: [String: Any] = [:]) async {
        guard isJoined else { return }
        let msg: [String: Any] = [
            "topic": topic,
            "event": "broadcast",
            "ref": nextRef(),
            "payload": [
                "type": "broadcast",
                "event": broadcastEvent,
                "payload": payload
            ]
        ]
        await sendJSON(msg)
    }

    // MARK: - Connect

    private func connect() async {
        guard !isStopped else { return }
        guard !Secrets.supabaseURL.contains("YOUR-PROJECT-REF") else {
            print("[realtime] missing Supabase config")
            return
        }
        guard let base = URL(string: Secrets.supabaseURL) else { return }
        let host = base.host ?? ""
        var comps = URLComponents()
        comps.scheme = "wss"
        comps.host = host
        comps.path = "/realtime/v1/websocket"
        comps.queryItems = [
            .init(name: "apikey", value: Secrets.supabaseAnonKey),
            .init(name: "vsn", value: "1.0.0"),
        ]
        guard let url = comps.url else { return }

        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        let session = URLSession(configuration: config)
        let task = session.webSocketTask(with: url)
        self.session = session
        self.task = task
        isJoined = false
        task.resume()

        await sendJoin()
        startReceiveLoop()
        startHeartbeat()
    }

    private func scheduleReconnect() {
        guard !isStopped else { return }
        isJoined = false
        let delay = backoff
        backoff = min(backoff * 2, 30_000_000_000) // cap 30s
        reconnectTask?.cancel()
        reconnectTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: delay)
            guard let self else { return }
            await self.reconnect()
        }
    }

    private func reconnect() async {
        heartbeatTask?.cancel(); heartbeatTask = nil
        receiveTask?.cancel();   receiveTask = nil
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
        await connect()
    }

    // MARK: - Send

    private func nextRef() -> String {
        refCounter += 1
        return String(refCounter)
    }

    private func sendJoin() async {
        let ref = nextRef()
        joinRef = ref
        // `self: false` → the publisher will not receive its own broadcasts.
        // That's what we want: optimistic updates handle the writer's own UI.
        let payload: [String: Any] = [
            "topic": topic,
            "event": "phx_join",
            "ref": ref,
            "join_ref": ref,
            "payload": [
                "access_token": Secrets.supabaseAnonKey,
                "config": [
                    "broadcast": ["ack": false, "self": false],
                    "presence": ["key": ""]
                ]
            ]
        ]
        await sendJSON(payload)
    }

    private func sendHeartbeat() async {
        let payload: [String: Any] = [
            "topic": "phoenix",
            "event": "heartbeat",
            "payload": [:],
            "ref": nextRef()
        ]
        await sendJSON(payload)
    }

    private func sendJSON(_ obj: [String: Any]) async {
        guard let task,
              let data = try? JSONSerialization.data(withJSONObject: obj),
              let text = String(data: data, encoding: .utf8) else { return }
        do {
            try await task.send(.string(text))
        } catch {
            // Code=-999 means we cancelled the task ourselves (during reconnect/unsubscribe).
            // Don't trigger another reconnect — one is already in flight.
            if (error as? URLError)?.code == .cancelled { return }
            print("[realtime] send failed: \(error)")
            scheduleReconnect()
        }
    }

    // MARK: - Receive

    private func startReceiveLoop() {
        receiveTask?.cancel()
        receiveTask = Task { [weak self] in
            while true {
                guard let self else { return }
                if await self.isStopped { return }
                guard let task = await self.currentTask() else { return }
                do {
                    let message = try await task.receive()
                    await self.handle(message: message)
                } catch {
                    // Code=-999 means we cancelled the task ourselves; don't loop.
                    if (error as? URLError)?.code == .cancelled { return }
                    print("[realtime] receive error: \(error)")
                    await self.scheduleReconnect()
                    return
                }
            }
        }
    }

    private func currentTask() -> URLSessionWebSocketTask? { task }

    private func handle(message: URLSessionWebSocketTask.Message) async {
        let text: String
        switch message {
        case .string(let s): text = s
        case .data(let d):   text = String(data: d, encoding: .utf8) ?? ""
        @unknown default:    return
        }
        guard let data = text.data(using: .utf8),
              let raw = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
        guard let event = raw["event"] as? String else { return }

        switch event {
        case "phx_reply":
            if let payload = raw["payload"] as? [String: Any],
               (payload["status"] as? String) == "ok" {
                backoff = 1_000_000_000
                // The successful reply to our join_ref means we are joined.
                if let ref = raw["ref"] as? String, ref == joinRef {
                    isJoined = true
                }
            }
        case "broadcast":
            // payload.event matches the broadcastEvent we registered with
            if let payload = raw["payload"] as? [String: Any],
               (payload["event"] as? String) == broadcastEvent {
                onChange?()
            }
        case "phx_error", "phx_close":
            scheduleReconnect()
        default:
            break
        }
    }

    // MARK: - Heartbeat

    private func startHeartbeat() {
        heartbeatTask?.cancel()
        heartbeatTask = Task { [weak self] in
            while true {
                try? await Task.sleep(nanoseconds: 30_000_000_000)
                guard let self else { return }
                if await self.isStopped { return }
                await self.sendHeartbeat()
            }
        }
    }
}

import Foundation

/// Supabase Realtime (v2) **Postgres Changes** client.
///
/// Subscribes to row-level INSERT/UPDATE/DELETE events on a table via logical
/// replication, instead of relying on writers to manually ping a broadcast
/// channel. The trade-off: the table must be added to the `supabase_realtime`
/// publication and have RLS that allows the connecting role to read it.
actor SupabaseRealtime {

    /// `type` is `"INSERT" | "UPDATE" | "DELETE"`. `record` is the full new
    /// row (INSERT/UPDATE only); `oldRecord` is present for UPDATE/DELETE but
    /// only carries the replica identity's columns (primary key here).
    typealias PostgresChangeHandler = @Sendable (
        _ type: String,
        _ record: [String: Any]?,
        _ oldRecord: [String: Any]?
    ) -> Void

    private let channelName: String
    private let topic: String
    private let table: String

    private var task: URLSessionWebSocketTask?
    private var session: URLSession?
    private var heartbeatTask: Task<Void, Never>?
    private var receiveTask: Task<Void, Never>?
    private var reconnectTask: Task<Void, Never>?
    private var refCounter: Int = 0
    private var joinRef: String = ""
    private var onChange: PostgresChangeHandler?
    private var onJoin: (@Sendable () -> Void)?
    private var isStopped: Bool = true
    private var isJoined: Bool = false
    private var isConnecting: Bool = false
    private var backoff: UInt64 = 1_000_000_000 // 1s

    /// - Parameter channelName: any room name — every client subscribing to
    ///   the same name shares the channel.
    /// - Parameter table: the `public` schema table to receive postgres_changes for.
    init(channelName: String, table: String) {
        self.channelName = channelName
        self.topic = "realtime:\(channelName)"
        self.table = table
    }

    /// - Parameter onJoin: called after every successful join (first connect
    ///   *and* every reconnect) — postgres_changes does not replay events
    ///   missed while disconnected, so callers should use this to catch up.
    func subscribe(onChange: @escaping PostgresChangeHandler, onJoin: @escaping @Sendable () -> Void = {}) async {
        self.onChange = onChange
        self.onJoin = onJoin
        guard isStopped else { return }  // Already connected; just update the handlers
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

    /// Call when the app returns to the foreground. A socket that died while
    /// the app was suspended can otherwise sit hung in receive() or waiting
    /// out exponential backoff — this forces a liveness check right now.
    func nudge() async {
        guard !isStopped else { return }
        if isJoined {
            // On a dead socket this send throws, which schedules a reconnect.
            await sendHeartbeat()
        } else {
            reconnectTask?.cancel()
            backoff = 1_000_000_000
            await connect()
        }
    }

    // MARK: - Connect

    // Actor reentrancy guard: connect() suspends at several `await` points
    // below (the Secrets accesses, sendJoin()), and during any of those the
    // actor can run another queued connect() call — a scheduleReconnect()
    // timer and a foreground nudge() landing close together, for instance.
    // Without `isConnecting`, both calls would each open their own live
    // websocket; only the *last* one to finish ends up referenced by
    // `self.task`, silently orphaning the other as a connection that's
    // never explicitly closed and lingers until Supabase's server-side idle
    // timeout reaps it. On a day with more reconnect churn (flaky network),
    // that's exactly what drives concurrent-connection count above normal.
    private func connect() async {
        guard !isStopped else { return }
        guard !isConnecting else { return }
        isConnecting = true
        defer { isConnecting = false }

        guard await !Secrets.supabaseURL.contains("YOUR-PROJECT-REF") else {
            print("[realtime] missing Supabase config")
            return
        }
        guard let base = await URL(string: Secrets.supabaseURL) else { return }
        let host = base.host ?? ""
        var comps = URLComponents()
        comps.scheme = "wss"
        comps.host = host
        comps.path = "/realtime/v1/websocket"
        comps.queryItems = await [
            .init(name: "apikey", value: Secrets.supabaseAnonKey),
            .init(name: "vsn", value: "1.0.0"),
        ]
        guard let url = comps.url else { return }

        // Tear down any existing socket before opening a new one. Keeping
        // this inside the isConnecting-guarded section (rather than as a
        // separate pre-step, as before) makes teardown-then-create atomic
        // with respect to every call path that can trigger a reconnect.
        heartbeatTask?.cancel(); heartbeatTask = nil
        receiveTask?.cancel();   receiveTask = nil
        task?.cancel(with: .goingAway, reason: nil)

        let config = URLSessionConfiguration.default
        // On Apple platforms this behaves as an idle-read timeout for a
        // pending receive(): if no frame arrives within the interval, the
        // receive fails. It must sit well above the 30s heartbeat cadence or
        // the socket flaps whenever a heartbeat reply is a beat late. 90s =
        // three missed heartbeats, doubling as our dead-socket detector.
        config.timeoutIntervalForRequest = 90
        config.waitsForConnectivity = true
        let newSession = URLSession(configuration: config)
        let newTask = newSession.webSocketTask(with: url)
        session = newSession
        task = newTask
        isJoined = false
        newTask.resume()

        await sendJoin()

        // unsubscribe() can run while the awaits above were suspended —
        // don't leave a joined-but-abandoned socket open on Supabase's side.
        guard !isStopped else {
            newTask.cancel(with: .goingAway, reason: nil)
            if task === newTask { task = nil }
            return
        }

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
            await self.connect()
        }
    }

    // MARK: - Send

    private func nextRef() -> String {
        refCounter += 1
        return String(refCounter)
    }

    private func sendJoin() async {
        let ref = nextRef()
        joinRef = ref
        let payload: [String: Any] = [
            "topic": topic,
            "event": "phx_join",
            "ref": ref,
            "join_ref": ref,
            "payload": [
                "access_token": Secrets.supabaseAnonKey,
                "config": [
                    "postgres_changes": [
                        ["event": "*", "schema": "public", "table": table]
                    ]
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
                    onJoin?()
                }
            }
        case "postgres_changes":
            guard let payload = raw["payload"] as? [String: Any],
                  let data = payload["data"] as? [String: Any],
                  let changeType = data["type"] as? String else { return }
            onChange?(changeType, data["record"] as? [String: Any], data["old_record"] as? [String: Any])
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

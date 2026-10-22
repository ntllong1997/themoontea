import Foundation

/// The staff database login, shared with the website's tills.
///
/// Orders are readable and writable only by staff once the database is
/// locked down (supabase/pending/lock_down_orders.sql in the web repo), so
/// every request and the live-updates socket carry this login's access token
/// instead of the public anon key. The login is made with
/// scripts/create-staff-user.mjs; put its email and password in
/// `Secrets.staffEmail` / `Secrets.staffPassword`.
///
/// Until those are filled in — or if signing in fails — the anon key is used,
/// as before, which keeps working until the lockdown is applied.
actor StaffAuth {
    static let shared = StaffAuth()

    private struct Session: Decodable {
        let access_token: String
        let refresh_token: String
        let expires_in: Double
    }

    private let session: URLSession
    private var accessToken: String?
    private var refreshToken: String?
    private var expiresAt = Date.distantPast
    private var pending: Task<String, Error>?
    /// Logged once per outage, not on every request while it lasts.
    private var isFailing = false

    private init() {
        let cfg = URLSessionConfiguration.default
        cfg.timeoutIntervalForRequest = 15
        self.session = URLSession(configuration: cfg)
    }

    private var isConfigured: Bool {
        !Secrets.staffEmail.hasPrefix("YOUR-") && !Secrets.staffPassword.hasPrefix("YOUR-")
    }

    /// The token to send as `Authorization: Bearer …` and as a Realtime
    /// `access_token`: the staff session's, renewed a minute before it expires.
    func bearerToken() async -> String {
        guard isConfigured else { return Secrets.supabaseAnonKey }
        if let accessToken, expiresAt.timeIntervalSinceNow > 60 { return accessToken }
        do {
            return try await signIn()
        } catch {
            print("[staff-auth] sign-in failed: \(error)")
            if !isFailing {
                isFailing = true
                ActivityLog.shared.error(.sync, "Staff database sign-in failed, using the public key", ["error": error.localizedDescription])
            }
            return Secrets.supabaseAnonKey
        }
    }

    /// Call when Supabase refuses the token (HTTP 401): the next request signs in again.
    func invalidate() {
        accessToken = nil
        expiresAt = .distantPast
    }

    /// One sign-in at a time; callers arriving meanwhile wait for the same one.
    private func signIn() async throws -> String {
        if let pending { return try await pending.value }
        let task = Task { try await self.fetchSession() }
        pending = task
        defer { pending = nil }
        return try await task.value
    }

    private func fetchSession() async throws -> String {
        if let refreshToken,
           let renewed = try? await requestToken(grant: "refresh_token", body: ["refresh_token": refreshToken]) {
            return store(renewed)
        }
        let fresh = try await requestToken(
            grant: "password",
            body: ["email": Secrets.staffEmail, "password": Secrets.staffPassword]
        )
        return store(fresh)
    }

    private func store(_ fresh: Session) -> String {
        accessToken = fresh.access_token
        refreshToken = fresh.refresh_token
        expiresAt = Date().addingTimeInterval(fresh.expires_in)
        if isFailing {
            isFailing = false
            ActivityLog.shared.info(.sync, "Staff database sign-in works again")
        }
        return fresh.access_token
    }

    private func requestToken(grant: String, body: [String: String]) async throws -> Session {
        guard let base = URL(string: Secrets.supabaseURL),
              var comps = URLComponents(url: base.appendingPathComponent("/auth/v1/token"),
                                        resolvingAgainstBaseURL: false) else {
            throw SupabaseError.invalidURL
        }
        comps.queryItems = [.init(name: "grant_type", value: grant)]
        guard let url = comps.url else { throw SupabaseError.invalidURL }

        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue(Secrets.supabaseAnonKey, forHTTPHeaderField: "apikey")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONEncoder().encode(body)

        let (data, resp) = try await session.data(for: req)
        guard let http = resp as? HTTPURLResponse else { throw SupabaseError.http(0, "no response") }
        guard (200..<300).contains(http.statusCode) else {
            throw SupabaseError.http(http.statusCode, String(data: data, encoding: .utf8) ?? "")
        }
        do { return try JSONDecoder().decode(Session.self, from: data) }
        catch { throw SupabaseError.decoding(error) }
    }
}

import Foundation

// Prices and menu options now live in MenuCatalog.swift, which is the single
// place a new category is added. Only genuinely cross-cutting constants belong
// here.
enum AppConstants {
    static let taxRate: Double = 0.0825
    static let defaultCashAppURL = "https://cash.app/$ThiLNguyen"
    /// The shop this iPad takes orders for — the `orders.location` column.
    /// Order numbers restart at 1 per location, so every order read and write
    /// is scoped to it. Location 2 runs on the website only.
    static let locationID = 1
}

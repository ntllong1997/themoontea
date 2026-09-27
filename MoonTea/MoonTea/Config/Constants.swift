import Foundation

// Prices and menu options are edited on the web at /menu and loaded by
// MenuStore (built-in copy: DefaultMenu.swift). Only genuinely cross-cutting
// constants belong here.
enum AppConstants {
    static let taxRate: Double = 0.0825
    static let defaultCashAppURL = "https://cash.app/$ThiLNguyen"
    /// The shop this iPad takes orders for — the `orders.location` column.
    /// Order numbers restart at 1 per location, so every order read and write
    /// is scoped to it. Location 2 runs on the website only.
    static let locationID = 1
}

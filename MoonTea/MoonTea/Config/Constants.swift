import Foundation

// Prices and menu options now live in MenuCatalog.swift, which is the single
// place a new category is added. Only genuinely cross-cutting constants belong
// here.
enum AppConstants {
    static let taxRate: Double = 0.0825
    static let defaultCashAppURL = "https://cash.app/$ThiLNguyen"
}

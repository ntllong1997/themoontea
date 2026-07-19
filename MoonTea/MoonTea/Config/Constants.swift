import Foundation

enum AppConstants {
    static let taxRate: Double = 0.0825
    static let bobaPrice: Double = 8.0
    static let corndogPrice: Double = 8.0
    static let hotCheetoDustPrice: Double = 1.0

    static let drinkOptions: [String] = [
        "Brown Sugar",
        "Matcha Brown Sugar",
        "Golden Taro",
        "Korean Strawberry",
        "Tropical",
        "Strawberry",
        "Cafe",
        "Matcha Strawberry",
    ]

    static let bobaOptions: [String] = [
        "Tapioca",
        "Mango Popping",
        "Strawberry Popping",
        "Nothing",
    ]

    static let corndogInsideOptions: [String] = ["Cheese", "Half-Half"]
    static let corndogOutsideOptions: [String] = ["Potato", "Hot Cheeto", "Original"]

    static let drinkCustomizations: [String: String] = [
        "Matcha Strawberry": "Only Matcha",
        "Golden Taro": "Only Taro",
    ]

    static let defaultCashAppURL = "https://cash.app/$ThiLNguyen"
}

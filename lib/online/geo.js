// "Is the customer at the pop-up?" — distance between two points on Earth.
// No imports, for `node --test`.

/** How close an online customer must be to the pop-up (about 1 mile). */
export const ORDER_RADIUS_METERS = 1609;

/**
 * Phones report how sure they are (the accuracy radius). Up to this much of
 * it is forgiven, so a customer standing at the stall with a vague indoor fix
 * isn't turned away; beyond it the reading is too fuzzy to trust.
 */
export const MAX_ACCURACY_ALLOWANCE_METERS = 400;

const EARTH_RADIUS_METERS = 6371008.8;
const toRadians = (degrees) => (degrees * Math.PI) / 180;

/** Great-circle distance in meters (haversine). */
export function distanceMeters(a, b) {
    const dLat = toRadians(b.latitude - a.latitude);
    const dLng = toRadians(b.longitude - a.longitude);
    const h =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * Math.sin(dLng / 2) ** 2;
    return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** A {latitude, longitude, accuracy} reading from the browser, or null if malformed. */
export function parseCoordinates(input) {
    if (!input || typeof input !== 'object') return null;
    const latitude = Number(input.latitude);
    const longitude = Number(input.longitude);
    const accuracy = input.accuracy === undefined ? 0 : Number(input.accuracy);
    if (![latitude, longitude, accuracy].every(Number.isFinite)) return null;
    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || accuracy < 0) return null;
    return { latitude, longitude, accuracy };
}

/**
 * Is a reading close enough to a pop-up? Returns the distance either way so
 * the page can say how far away the customer is.
 */
export function checkNearby(reading, popup, radius = ORDER_RADIUS_METERS) {
    const distance = distanceMeters(reading, popup);
    const allowance = Math.min(reading.accuracy ?? 0, MAX_ACCURACY_ALLOWANCE_METERS);
    return { nearby: distance - allowance <= radius, distance: Math.round(distance) };
}

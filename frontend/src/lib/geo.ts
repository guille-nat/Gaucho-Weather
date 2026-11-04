/** Why the phone did not give its position, worded for the farmer. */
export type GeoFailure = 'denied' | 'unavailable';

export interface Position {
  lat: number;
  lon: number;
}

/** The browser's position as a promise. A city-level fix is enough for the weather. */
export function locate(): Promise<Position> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      reject('unavailable' satisfies GeoFailure);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ lat: coords.latitude, lon: coords.longitude }),
      (error) =>
        reject(
          (error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable') satisfies GeoFailure,
        ),
      { enableHighAccuracy: false, timeout: 12_000, maximumAge: 10 * 60_000 },
    );
  });
}

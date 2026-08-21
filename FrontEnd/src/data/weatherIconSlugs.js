// Icon files in public/icons/weather_code/ are named after the ORIGINAL
// English Tomorrow.io condition strings (e.g. "Mostly Clear" -> mostly_clear_day.svg).
// weather_code_data.json now holds the Spanish text shown to the user, so the
// icon lookup needs its own stable, English, code-keyed slug map — otherwise
// translating the display text would silently break every weather icon.
// Keep this in sync with BackEnd Tomorrow.io weather codes, not with the
// (translatable) display text.
export const WEATHER_ICON_SLUGS = {
  0: "unknown",
  1000: "clear_sunny",
  1100: "mostly_clear",
  1101: "partly_cloudy",
  1102: "mostly_cloudy",
  1001: "cloudy",
  2000: "fog",
  2100: "light_fog",
  4000: "drizzle",
  4001: "rain",
  4200: "light_rain",
  4201: "heavy_rain",
  5000: "snow",
  5001: "flurries",
  5100: "light_snow",
  5101: "heavy_snow",
  6000: "freezing_drizzle",
  6001: "freezing_rain",
  6200: "light_freezing_rain",
  6201: "heavy_freezing_rain",
  7000: "ice_pellets",
  7101: "heavy_ice_pellets",
  7102: "light_ice_pellets",
  8000: "thunderstorm",
};

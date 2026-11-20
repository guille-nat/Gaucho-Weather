import type { ReactNode, SVGProps } from 'react';

/** One authored icon set: 24 px grid, 2 px round stroke, `currentColor`. */
const PATHS = {
  plus: <path d="M12 5v14M5 12h14" />,
  chevronRight: <path d="M9 5l7 7-7 7" />,
  chevronLeft: <path d="M15 5l-7 7 7 7" />,
  refresh: <path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  thermometer: (
    <>
      <path d="M10 13.5V5a2 2 0 0 1 4 0v8.5a4 4 0 1 1-4 0Z" />
      <path d="M12 17v-6" />
    </>
  ),
  parcel: (
    <>
      <path d="M4 7.5 17 4l3 14-14 2.5Z" />
      <path d="M8.5 11.5l6-1.5M9.5 15.5l6-1.5" />
    </>
  ),
  bell: (
    <>
      <path d="M6 10a6 6 0 1 1 12 0c0 5.5 2.5 7 2.5 7h-17S6 15.5 6 10Z" />
      <path d="M10 20.5a2.2 2.2 0 0 0 4 0" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  crosshair: (
    <>
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s7-6.2 7-11.5a7 7 0 0 0-14 0C5 14.8 12 21 12 21Z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </>
  ),
  pencil: (
    <>
      <path d="M4 20h4L19 9l-4-4L4 16v4Z" />
      <path d="M13.5 6.5l4 4" />
    </>
  ),
  trash: <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />,
  cloudOff: (
    <>
      <path d="M3 3l18 18" />
      <path d="M8.2 6.6A6 6 0 0 1 17.7 10H18a4 4 0 0 1 2.6 7" />
      <path d="M17 19H7a5 5 0 0 1-1.6-9.7" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M3 3l18 18" />
      <path d="M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.2" />
      <path d="M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5.4-1.6" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </>
  ),
  check: <path d="M4 12.5l5 5L20 6.5" />,
  alert: (
    <>
      <path d="M12 3.5 2.5 20h19L12 3.5Z" />
      <path d="M12 10v4.5M12 17.4v.1" />
    </>
  ),
  alertCircle: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5M12 16.4v.1" />
    </>
  ),
  snowflake: <path d="M12 2.5v19M3.8 7.3l16.4 9.4M3.8 16.7l16.4-9.4" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.6v.1" />
    </>
  ),
  logout: <path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10" />,
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.5 15.5 20 20" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
  navigation: <path d="M4 11 20 4l-7 16-2-7-7-2Z" />,
  arrowUp: <path d="M12 20V4M6 10l6-6 6 6" />,
  history: (
    <>
      <path d="M4 12a8 8 0 1 0 2.34-5.66L4 8.5" />
      <path d="M4 4v4.5h4.5M12 8v4l3 2" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
    </>
  ),
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />,
  cloud: <path d="M7 19h10.5a4.5 4.5 0 0 0 .6-8.96A6 6 0 0 0 6.6 11.1 4 4 0 0 0 7 19Z" />,
  cloudSun: (
    <>
      <path d="M8.5 5.2A4 4 0 0 1 14.6 8" />
      <path d="M5 9.6A4 4 0 0 1 4.7 8M8.5 2.5v1M3.4 4.4l.7.7" />
      <path d="M8 20h9.5a3.8 3.8 0 0 0 .5-7.57A5 5 0 0 0 8.4 13.2 3.4 3.4 0 0 0 8 20Z" />
    </>
  ),
  rain: (
    <>
      <path d="M7 15h10.5a4.2 4.2 0 0 0 .6-8.36A5.6 5.6 0 0 0 7.1 7.6 3.7 3.7 0 0 0 7 15Z" />
      <path d="M8 18.5 7 21M12 18.5 11 21M16 18.5 15 21" />
    </>
  ),
  storm: (
    <>
      <path d="M7 15h10.5a4.2 4.2 0 0 0 .6-8.36A5.6 5.6 0 0 0 7.1 7.6 3.7 3.7 0 0 0 7 15Z" />
      <path d="M12.5 13 10 17.5h3.5L11 22" />
    </>
  ),
  undo: (
    <>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </>
  ),
  layers: (
    <>
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 13 9 5 9-5" />
    </>
  ),
  drop: <path d="M12 3s6 6.6 6 11a6 6 0 0 1-12 0c0-4.4 6-11 6-11Z" />,
  wind: <path d="M3 9h11a3 3 0 1 0-3-3M3 15h15a3 3 0 1 1-3 3M3 12h7" />,
  sunrise: (
    <>
      <path d="M7 17a5 5 0 0 1 10 0M3 20.5h18M12 3v6M9 6l3-3 3 3" />
    </>
  ),
  sunset: (
    <>
      <path d="M7 17a5 5 0 0 1 10 0M3 20.5h18M12 3v6M9 6l3 3 3-3" />
    </>
  ),
  humidity: (
    <>
      <path d="M12 3s6 6.6 6 11a6 6 0 0 1-12 0c0-4.4 6-11 6-11Z" />
      <path d="M9 15.5a3 3 0 0 0 3 2.5" />
    </>
  ),
  sprout: (
    <>
      <path d="M12 21v-9" />
      <path d="M12 12C12 8.1 9.4 5.5 4.5 5.5c0 3.9 2.6 6.5 7.5 6.5Z" />
      <path d="M12 15c0-3.3 2.3-5.5 6.5-5.5 0 3.3-2.3 5.5-6.5 5.5Z" />
    </>
  ),
  pause: <path d="M9 5.5v13M15 5.5v13" />,
  play: <path d="M8 5.2v13.6a.6.6 0 0 0 .9.5l10.6-6.8a.6.6 0 0 0 0-1L8.9 4.7a.6.6 0 0 0-.9.5Z" />,
  star: (
    <path d="m12 3.5 2.6 5.3 5.9.86-4.25 4.14 1 5.85L12 16.9l-5.25 2.75 1-5.85L3.5 9.66l5.9-.86Z" />
  ),
  barn: (
    <>
      <path d="M3 10.5 12 4l9 6.5V20H3Z" />
      <path d="M9.5 20v-5.5h5V20" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number;
  strokeWidth?: number;
}

export function Icon({ name, size = 22, strokeWidth = 2, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}

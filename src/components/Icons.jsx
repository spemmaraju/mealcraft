// Inline SVG line icons lifted verbatim from the approved design bundle
// (components/nav.html, components/actions.html, components/cards.html,
// components/rows.html) — Round 2.6 retheme. Centralizing them here means
// every consumer (nav bar, FAB, meal cards, provenance badges, add-sheet
// action grid, day-strip) draws from the exact same paths instead of
// re-typing SVG markup per file. All icons are stroke-based (currentColor),
// 24x24 viewBox, so callers control color/size via CSS (font-size doesn't
// apply — use width/height or an em-based wrapper).

function Svg({ size = 24, strokeWidth = 1.8, className, children, viewBox = '0 0 24 24' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export function PantryIcon(props) {
  return (
    <Svg {...props}>
      <rect x="4" y="8" width="16" height="12" rx="2" />
      <path d="M4 8l2-4h12l2 4" />
      <path d="M9 12h6" />
    </Svg>
  )
}

export function LibraryIcon(props) {
  return (
    <Svg {...props}>
      <path d="M4 5c2-1 5-1 8 1 3-2 6-2 8-1v13c-2-1-5-1-8 1-3-2-6-2-8-1z" />
      <path d="M12 6v13" />
    </Svg>
  )
}

export function PlanIcon(props) {
  return (
    <Svg {...props}>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 9h16M8 3v4M16 3v4" />
    </Svg>
  )
}

export function TrackIcon(props) {
  return (
    <Svg {...props}>
      <rect x="6" y="4" width="12" height="17" rx="2" />
      <path d="M9 4V3a1 1 0 011-1h4a1 1 0 011 1v1" />
      <path d="M9 13l2 2 4-4" />
    </Svg>
  )
}

export function SettingsIcon(props) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19 12a7 7 0 00-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 00-2-1.2L14 3h-4l-.6 2.6a7 7 0 00-2 1.2l-2.3-.9-2 3.4 2 1.5A7 7 0 005 12a7 7 0 00.1 1.2l-2 1.5 2 3.4 2.3-.9a7 7 0 002 1.2L10 21h4l.6-2.6a7 7 0 002-1.2l2.3.9 2-3.4-2-1.5A7 7 0 0019 12z" />
    </Svg>
  )
}

export const NAV_ICONS = {
  pantry: PantryIcon,
  library: LibraryIcon,
  plan: PlanIcon,
  track: TrackIcon,
  settings: SettingsIcon,
}

export function FabPlusIcon(props) {
  return (
    <Svg strokeWidth={2.4} {...props}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  )
}

export function CheckIcon(props) {
  return (
    <Svg strokeWidth={2.5} {...props}>
      <path d="M5 13l4 4L19 7" />
    </Svg>
  )
}

export function CloseIcon(props) {
  return (
    <Svg strokeWidth={2} {...props}>
      <path d="M18 6L6 18M6 6l12 12" />
    </Svg>
  )
}

export function SearchIcon(props) {
  return (
    <Svg strokeWidth={2} {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </Svg>
  )
}

export function BarcodeIcon(props) {
  return (
    <Svg strokeWidth={2} {...props}>
      <path d="M4 5v14M8 5v14M11 5v14M15 5v14M18 5v14M21 5v14" />
    </Svg>
  )
}

export function ManualIcon(props) {
  return (
    <Svg strokeWidth={2} {...props}>
      <path d="M4 20l4-1 10-10-3-3L5 16l-1 4z" />
    </Svg>
  )
}

export function GlobeIcon(props) {
  return (
    <Svg strokeWidth={2} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 010 18 14 14 0 010-18z" />
    </Svg>
  )
}

export function StreakIcon(props) {
  return (
    <Svg strokeWidth={2} {...props}>
      <path d="M12 2v4M12 18v4M4.9 4.9l2.9 2.9M16.2 16.2l2.9 2.9M2 12h4M18 12h4M4.9 19.1l2.9-2.9M16.2 7.8l2.9-2.9" />
    </Svg>
  )
}

// ---- Meal-card icons (components/cards.html / screens/track.html) --------

export function BreakfastIcon(props) {
  return (
    <Svg {...props}>
      <path d="M6 3v7a3 3 0 003 3h0a3 3 0 003-3V3M9 13v8M17 3c-1.5 1.5-2 3-2 5s.5 3.5 2 5c1.5-1.5 2-3 2-5s-.5-3.5-2-5zM17 13v8" />
    </Svg>
  )
}

export function LunchIcon(props) {
  return (
    <Svg {...props}>
      <path d="M4 10h16M4 10a8 8 0 0116 0M4 10v1a8 8 0 0016 0v-1M9 17v2M15 17v2" />
    </Svg>
  )
}

export function DinnerIcon(props) {
  return (
    <Svg {...props}>
      <path d="M5 4h14M6 4v13a3 3 0 003 3h6a3 3 0 003-3V4M9 8v8M15 8v8" />
    </Svg>
  )
}

export function SnackIcon(props) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="9" cy="10" r="1" fill="currentColor" stroke="none" />
      <circle cx="14" cy="9" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="14" r="1" fill="currentColor" stroke="none" />
      <circle cx="10" cy="15" r="1" fill="currentColor" stroke="none" />
    </Svg>
  )
}

export const MEAL_ICONS = {
  breakfast: BreakfastIcon,
  lunch: LunchIcon,
  dinner: DinnerIcon,
  snack: SnackIcon,
}

// ---- Provenance icons (components/rows.html badges) -----------------------

export function SeedProvenanceIcon(props) {
  return <CheckIcon {...props} />
}
export function OnlineProvenanceIcon(props) {
  return <GlobeIcon {...props} />
}
export function ManualProvenanceIcon(props) {
  return <ManualIcon {...props} />
}
export function BarcodeProvenanceIcon(props) {
  return <BarcodeIcon {...props} />
}

export const PROVENANCE_ICONS = {
  seed: SeedProvenanceIcon,
  online: OnlineProvenanceIcon,
  manual: ManualProvenanceIcon,
  barcode: BarcodeProvenanceIcon,
}

import type { JSX } from "solid-js";

export interface IconProps {
  size?: number;
}

/** Shared frame: 24×24 viewBox, stroked with the current text color, hidden from screen readers. */
function Svg(props: IconProps & { children: JSX.Element }) {
  return (
    <svg
      width={props.size ?? 16}
      height={props.size ?? 16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {props.children}
    </svg>
  );
}

export const IconSearch = (p: IconProps) => (
  <Svg size={p.size}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-4-4" />
  </Svg>
);

export const IconKeyboard = (p: IconProps) => (
  <Svg size={p.size}>
    <rect x="2" y="6" width="20" height="12" rx="2" />
    <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" />
  </Svg>
);

export const IconSettings = (p: IconProps) => (
  <Svg size={p.size}>
    <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" />
    <circle cx="16" cy="6" r="2" />
    <circle cx="10" cy="12" r="2" />
    <circle cx="18" cy="18" r="2" />
  </Svg>
);

export const IconSun = (p: IconProps) => (
  <Svg size={p.size}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Svg>
);

export const IconMoon = (p: IconProps) => (
  <Svg size={p.size}>
    <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
  </Svg>
);

export const IconFocus = (p: IconProps) => (
  <Svg size={p.size}>
    <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" />
    <circle cx="12" cy="12" r="2.5" />
  </Svg>
);

export const IconNotes = (p: IconProps) => (
  <Svg size={p.size}>
    <path d="M6 3h9l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
    <path d="M14 3v5h5M9 13h6M9 17h4" />
  </Svg>
);

export const IconChevronLeft = (p: IconProps) => (
  <Svg size={p.size}>
    <path d="m15 18-6-6 6-6" />
  </Svg>
);

export const IconChevronRight = (p: IconProps) => (
  <Svg size={p.size}>
    <path d="m9 18 6-6-6-6" />
  </Svg>
);

export const IconChevronUp = (p: IconProps) => (
  <Svg size={p.size}>
    <path d="m18 15-6-6-6 6" />
  </Svg>
);

export const IconChevronDown = (p: IconProps) => (
  <Svg size={p.size}>
    <path d="m6 9 6 6 6-6" />
  </Svg>
);

export const IconArrowUp = (p: IconProps) => (
  <Svg size={p.size}>
    <path d="M12 19V5M5 12l7-7 7 7" />
  </Svg>
);

export const IconArrowDown = (p: IconProps) => (
  <Svg size={p.size}>
    <path d="M12 5v14M19 12l-7 7-7-7" />
  </Svg>
);

/** Horizontal ⋯ (more actions). */
export const IconMore = (p: IconProps) => (
  <Svg size={p.size}>
    <path d="M5 12h.01M12 12h.01M19 12h.01" stroke-width="3" />
  </Svg>
);

export const IconPlus = (p: IconProps) => (
  <Svg size={p.size}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const IconMinus = (p: IconProps) => (
  <Svg size={p.size}>
    <path d="M5 12h14" />
  </Svg>
);

export const IconImage = (p: IconProps) => (
  <Svg size={p.size}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-5-5L5 21" />
  </Svg>
);

/** Scene separator: a rule broken by three dots. */
export const IconSeparator = (p: IconProps) => (
  <Svg size={p.size}>
    <path d="M3 12h3M18 12h3M9 12h.01M12 12h.01M15 12h.01" />
  </Svg>
);

export const IconEraser = (p: IconProps) => (
  <Svg size={p.size}>
    <path d="m7 21-4.3-4.3a1 1 0 0 1 0-1.4l10-10a1 1 0 0 1 1.4 0l5.6 5.6a1 1 0 0 1 0 1.4L11 21" />
    <path d="M7 21h14M5.5 12.5l6 6" />
  </Svg>
);

export const IconClose = (p: IconProps) => (
  <Svg size={p.size}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Svg>
);

export const IconBook = (p: IconProps) => (
  <Svg size={p.size}>
    <path d="M4 19.5V5a2 2 0 0 1 2-2h14v15H6.5a2.5 2.5 0 0 0 0 5H20v-5" />
  </Svg>
);

export const IconTrash = (p: IconProps) => (
  <Svg size={p.size}>
    <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M6 6l1 14a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-14M10 11v6M14 11v6" />
  </Svg>
);

export const IconPencil = (p: IconProps) => (
  <Svg size={p.size}>
    <path d="M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    <path d="m15 5 4 4" />
  </Svg>
);

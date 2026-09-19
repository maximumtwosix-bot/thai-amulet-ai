// Small, hand-written inline SVG icon set (Lucide-style: 24x24 viewBox, currentColor stroke,
// round caps/joins) — this project has no icon library installed (no lucide-react, no
// @heroicons/react in package.json), so these replace emoji directly rather than adding a new
// dependency. Each accepts a `className` so callers control size/color via Tailwind.

import type { ReactNode } from "react";

type IconProps = {
  className?: string;
};

function base(children: ReactNode, className?: string) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? "h-5 w-5"}
    >
      {children}
    </svg>
  );
}

export function ArrowLeftIcon({ className }: IconProps) {
  return base(
    <>
      <path d="m12 19-7-7 7-7" />
      <path d="M19 12H5" />
    </>,
    className
  );
}

export function LogOutIcon({ className }: IconProps) {
  return base(
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </>,
    className
  );
}

export function HomeIcon({ className }: IconProps) {
  return base(
    <>
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </>,
    className
  );
}

export function PackageIcon({ className }: IconProps) {
  return base(
    <>
      <path d="M16.5 9.4 7.55 4.24" />
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <polyline points="3.29 7 12 12 20.71 7" />
      <line x1="12" y1="22" x2="12" y2="12" />
    </>,
    className
  );
}

export function ReceiptIcon({ className }: IconProps) {
  return base(
    <>
      <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" />
      <path d="M8 8h8" />
      <path d="M8 12h8" />
      <path d="M8 16h4" />
    </>,
    className
  );
}

export function UsersIcon({ className }: IconProps) {
  return base(
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>,
    className
  );
}

export function WalletIcon({ className }: IconProps) {
  return base(
    <>
      <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
      <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
      <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
    </>,
    className
  );
}

export function LandmarkIcon({ className }: IconProps) {
  return base(
    <>
      <line x1="3" y1="22" x2="21" y2="22" />
      <line x1="6" y1="18" x2="6" y2="11" />
      <line x1="10" y1="18" x2="10" y2="11" />
      <line x1="14" y1="18" x2="14" y2="11" />
      <line x1="18" y1="18" x2="18" y2="11" />
      <polygon points="12 2 20 7 4 7" />
    </>,
    className
  );
}

export function FileTextIcon({ className }: IconProps) {
  return base(
    <>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <line x1="10" y1="9" x2="8" y2="9" />
    </>,
    className
  );
}

export function BotIcon({ className }: IconProps) {
  return base(
    <>
      <path d="M12 8V4H8" />
      <rect x="4" y="8" width="16" height="12" rx="2" />
      <path d="M2 14h2" />
      <path d="M20 14h2" />
      <path d="M15 13v2" />
      <path d="M9 13v2" />
    </>,
    className
  );
}

export function BarChartIcon({ className }: IconProps) {
  return base(
    <>
      <line x1="12" y1="20" x2="12" y2="10" />
      <line x1="18" y1="20" x2="18" y2="4" />
      <line x1="6" y1="20" x2="6" y2="16" />
    </>,
    className
  );
}

export function SettingsIcon({ className }: IconProps) {
  return base(
    <>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z" />
      <circle cx="12" cy="12" r="3" />
    </>,
    className
  );
}

export function PenLineIcon({ className }: IconProps) {
  return base(
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </>,
    className
  );
}

export function ClapperboardIcon({ className }: IconProps) {
  return base(
    <>
      <path d="m20.2 6 -2.9-2.9c-.4-.4-1-.4-1.4 0L4 15" />
      <path d="M4 15h16v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
      <path d="m6.2 5.3 3.1 3.1" />
      <path d="m12.4 3.1 3.1 3.1" />
    </>,
    className
  );
}

export function ChevronDownIcon({ className }: IconProps) {
  return base(<path d="m6 9 6 6 6-6" />, className);
}

export function FlagIcon({ className }: IconProps) {
  return base(
    <>
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </>,
    className
  );
}

export function MegaphoneIcon({ className }: IconProps) {
  return base(
    <>
      <path d="m3 11 18-5v12L3 14z" />
      <path d="M11 16v3a2 2 0 0 1-2 2H8a1 1 0 0 1-1-1v-4" />
      <path d="M15 8.5a4 4 0 0 1 0 7" />
    </>,
    className
  );
}

export function BriefcaseIcon({ className }: IconProps) {
  return base(
    <>
      <rect width="20" height="14" x="2" y="7" rx="2" ry="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </>,
    className
  );
}

export function MessageCircleIcon({ className }: IconProps) {
  return base(<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />, className);
}

// Brand mark (solid fill, not the stroke-line style used elsewhere in this file) — the classic
// Facebook "f" circle logo, used only as a visual cue that the Marketing section links out to
// Facebook/Meta products, never as a functional brand asset.
export function FacebookIcon({ className }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className ?? "h-5 w-5"}>
      <path d="M12 2C6.48 2 2 6.48 2 12c0 5 3.66 9.13 8.44 9.88v-6.99h-2.54V12h2.54V9.8c0-2.5 1.49-3.89 3.78-3.89 1.09 0 2.23.2 2.23.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.44 2.89h-2.34v6.99C18.34 21.13 22 17 22 12c0-5.52-4.48-10-10-10z" />
    </svg>
  );
}

export function SearchIcon({ className }: IconProps) {
  return base(
    <>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </>,
    className
  );
}

export function ImageIcon({ className }: IconProps) {
  return base(
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </>,
    className
  );
}

export function XIcon({ className }: IconProps) {
  return base(
    <>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </>,
    className
  );
}

export function SparklesIcon({ className }: IconProps) {
  return base(
    <>
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
      <path d="M20 3v4" />
      <path d="M22 5h-4" />
      <path d="M4 17v2" />
      <path d="M5 18H3" />
    </>,
    className
  );
}

// Brand mark (solid fill, same convention as FacebookIcon above) — a single asymmetric 4-point
// sparkle/star, matching the real Gemini logomark's shape (one long axis, one short axis) rather
// than the generic multi-dot "sparkles" cluster used elsewhere in this file.
export function GeminiIcon({ className }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className ?? "h-5 w-5"}>
      <path d="M12 2c0 3.5 1 6.5 3 8.5s5 3 8.5 3c-3.5 0-6.5 1-8.5 3s-3 5-3 8.5c0-3.5-1-6.5-3-8.5s-5-3-8.5-3c3.5 0 6.5-1 8.5-3s3-5 3-8.5z" />
    </svg>
  );
}

// Brand mark (solid fill, same convention as FacebookIcon/GeminiIcon above) — a monochrome
// recreation of the Google "G" logomark, used for Google-product shortcut links (e.g. Google Flow)
// where a generic icon wouldn't be recognizable at a glance.
export function GoogleIcon({ className }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className ?? "h-5 w-5"}>
      <path d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.51 5.44A6.27 6.27 0 0 1 5.91 12.99 6.27 6.27 0 0 1 12.18 6.73c1.94 0 3.24.83 3.99 1.55l2.36-2.28C17.13 4.65 14.95 3.6 12.18 3.6a9.27 9.27 0 0 0-9.27 9.29 9.27 9.27 0 0 0 9.27 9.29c5.35 0 8.9-3.76 8.9-9.05 0-.71-.07-1.31-.15-2.03z" />
    </svg>
  );
}

export function UploadCloudIcon({ className }: IconProps) {
  return base(
    <>
      <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
      <path d="M12 12v9" />
      <path d="m16 16-4-4-4 4" />
    </>,
    className
  );
}

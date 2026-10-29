import React, { memo } from "react";

interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
  className?: string;
  style?: React.CSSProperties;
}

// ── 1. Action & Navigation Arrows ──────────────────────────────
export const IconPlay = memo(function IconPlay({ size = 14, className = "", style, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      className={className}
      style={{ display: "inline-block", verticalAlign: "middle", ...style }}
      aria-hidden="true"
      {...rest}
    >
      <defs>
        <linearGradient id="icon-play-grad" x1="2" y1="2" x2="14" y2="14" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFF4CC" />
          <stop offset="50%" stopColor="#F0A93B" />
          <stop offset="100%" stopColor="#C9812A" />
        </linearGradient>
      </defs>
      <path
        d="M3 2.5L14 8L3 13.5V2.5Z"
        fill="url(#icon-play-grad)"
        stroke="#4A2E12"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path d="M4.5 4.8L11 8L4.5 11.2V4.8Z" fill="#FFF8E0" opacity="0.45" />
    </svg>
  );
});

export const IconArrowRight = memo(function IconArrowRight({ size = 14, className = "", style, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      className={className}
      style={{ display: "inline-block", verticalAlign: "middle", ...style }}
      aria-hidden="true"
      {...rest}
    >
      <path
        d="M2 8H11.5M11.5 8L7.5 4M11.5 8L7.5 12"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
      <rect x="13" y="6" width="2" height="4" fill="currentColor" opacity="0.8" />
    </svg>
  );
});

export const IconArrowLeft = memo(function IconArrowLeft({ size = 14, className = "", style, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      className={className}
      style={{ display: "inline-block", verticalAlign: "middle", ...style }}
      aria-hidden="true"
      {...rest}
    >
      <path
        d="M14 8H4.5M4.5 8L8.5 4M4.5 8L8.5 12"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
      <rect x="1" y="6" width="2" height="4" fill="currentColor" opacity="0.8" />
    </svg>
  );
});

export const IconChevronLeft = memo(function IconChevronLeft({ size = 16, className = "", style, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      shapeRendering="crispEdges"
      fill="none"
      className={className}
      style={{ display: "inline-block", verticalAlign: "middle", ...style }}
      aria-hidden="true"
      {...rest}
    >
      {/* stepped pixel chevron — crisp at every size, matches the voxel look */}
      <g fill="currentColor">
        <rect x="9" y="2" width="3" height="2" />
        <rect x="7" y="4" width="3" height="2" />
        <rect x="5" y="6" width="3" height="4" />
        <rect x="7" y="10" width="3" height="2" />
        <rect x="9" y="12" width="3" height="2" />
      </g>
      <g fill="currentColor" opacity="0.35">
        <rect x="12" y="4" width="2" height="2" />
        <rect x="10" y="6" width="2" height="4" />
        <rect x="12" y="10" width="2" height="2" />
      </g>
    </svg>
  );
});

export const IconChevronRight = memo(function IconChevronRight({ size = 16, className = "", style, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      shapeRendering="crispEdges"
      fill="none"
      className={className}
      style={{ display: "inline-block", verticalAlign: "middle", ...style }}
      aria-hidden="true"
      {...rest}
    >
      {/* stepped pixel chevron — crisp at every size, matches the voxel look */}
      <g fill="currentColor">
        <rect x="4" y="2" width="3" height="2" />
        <rect x="6" y="4" width="3" height="2" />
        <rect x="8" y="6" width="3" height="4" />
        <rect x="6" y="10" width="3" height="2" />
        <rect x="4" y="12" width="3" height="2" />
      </g>
      <g fill="currentColor" opacity="0.35">
        <rect x="2" y="4" width="2" height="2" />
        <rect x="4" y="6" width="2" height="4" />
        <rect x="2" y="10" width="2" height="2" />
      </g>
    </svg>
  );
});

// ── 2. Health & Combat Symbols ─────────────────────────────────
export const IconHeart = memo(function IconHeart({ size = 14, className = "", style, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      className={className}
      style={{ display: "inline-block", verticalAlign: "middle", ...style }}
      aria-hidden="true"
      {...rest}
    >
      <defs>
        <linearGradient id="icon-heart-grad" x1="8" y1="2" x2="8" y2="15" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#76ECC1" />
          <stop offset="40%" stopColor="#56DCA8" />
          <stop offset="100%" stopColor="#1B6D4F" />
        </linearGradient>
      </defs>
      <path
        d="M8 14.5L2 8.5C0.6 7.1 0.6 4.7 2 3.3C3.4 1.9 5.8 1.9 7.2 3.3L8 4.1L8.8 3.3C10.2 1.9 12.6 1.9 14 3.3C15.4 4.7 15.4 7.1 14 8.5L8 14.5Z"
        fill="url(#icon-heart-grad)"
        stroke="#0F3828"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <circle cx="5" cy="5" r="1.2" fill="#E8FFF5" opacity="0.75" />
    </svg>
  );
});

/**
 * Crossed raptorial blades — the "in combat" mark.
 * Drawn to survive 10px: one solid X of chunky blade bodies, a bright
 * edge-light on each, and a hot spark at the crossing. Tints via
 * currentColor so the standings can run it red and reports amber.
 */
export const IconClash = memo(function IconClash({ size = 14, className = "", style, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      className={className}
      style={{ display: "inline-block", verticalAlign: "middle", ...style }}
      aria-hidden="true"
      {...rest}
    >
      {/* dark outline keeps the X legible on paper AND wood */}
      <path d="M2 2L14 14M14 2L2 14" stroke="#1A0E08" strokeWidth="4.6" strokeLinecap="round" />
      {/* blade bodies */}
      <path d="M2 2L14 14M14 2L2 14" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
      {/* edge light down each blade */}
      <path d="M3.2 2.4L13.6 12.8M12.8 2.4L2.4 12.8" stroke="#FFF4CC" strokeWidth="0.75" strokeLinecap="round" opacity="0.85" />
      {/* pommels */}
      <circle cx="2.2" cy="13.8" r="1.4" fill="#1A0E08" />
      <circle cx="13.8" cy="13.8" r="1.4" fill="#1A0E08" />
      <circle cx="2.2" cy="13.8" r="0.8" fill="#F0A93B" />
      <circle cx="13.8" cy="13.8" r="0.8" fill="#F0A93B" />
      {/* strike spark at the crossing */}
      <path d="M8 5.2L8.9 7.1L10.8 8L8.9 8.9L8 10.8L7.1 8.9L5.2 8L7.1 7.1Z" fill="#FFF8E0" />
      <circle cx="8" cy="8" r="1" fill="#FFFFFF" />
    </svg>
  );
});

// ── 3. Star Gems & Instar Ratings ──────────────────────────────
export const IconStar = memo(function IconStar({ size = 12, className = "", style, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 14 14"
      width={size}
      height={size}
      fill="none"
      className={className}
      style={{ display: "inline-block", verticalAlign: "middle", ...style }}
      aria-hidden="true"
      {...rest}
    >
      <defs>
        <linearGradient id="icon-star-facet" x1="7" y1="1" x2="7" y2="13" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFF9E0" />
          <stop offset="45%" stopColor="#F5B642" />
          <stop offset="100%" stopColor="#A86E18" />
        </linearGradient>
      </defs>
      {/* true five-point star with a faceted gold body and dark outline */}
      <polygon
        points="7,0.8 8.7,5.1 13.2,5.4 9.7,8.3 10.8,12.7 7,10.3 3.2,12.7 4.3,8.3 0.8,5.4 5.3,5.1"
        fill="url(#icon-star-facet)"
        stroke="#422C0E"
        strokeWidth="1"
        strokeLinejoin="round"
      />
      {/* left facet shade — gives the star its cut-gem read */}
      <polygon points="7,3 5.3,5.1 7,9.2" fill="#FFFDF2" opacity="0.55" />
    </svg>
  );
});

export const StarRating = memo(function StarRating({
  star,
  size = 10,
  className = "",
  label,
}: {
  star: number;
  size?: number;
  className?: string;
  /** Omit to keep the gems decorative — parents usually name the specimen. */
  label?: string;
}) {
  if (star <= 0) return null;
  return (
    <span
      className={`inline-flex items-center gap-[1px] ${className}`}
      aria-label={label ?? undefined}
      aria-hidden={label ? undefined : true}
    >
      {Array.from({ length: star }).map((_, i) => (
        <IconStar key={i} size={size} />
      ))}
    </span>
  );
});

// ── 4. Utility & Modal Controls ────────────────────────────────
export const IconClose = memo(function IconClose({ size = 12, className = "", style, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 14 14"
      width={size}
      height={size}
      fill="none"
      className={className}
      style={{ display: "inline-block", verticalAlign: "middle", ...style }}
      aria-hidden="true"
      {...rest}
    >
      <path
        d="M2.5 2.5L11.5 11.5M11.5 2.5L2.5 11.5"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
    </svg>
  );
});

export const IconHelp = memo(function IconHelp({ size = 14, className = "", style, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      className={className}
      style={{ display: "inline-block", verticalAlign: "middle", ...style }}
      aria-hidden="true"
      {...rest}
    >
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M6 6C6 4.9 6.9 4 8 4C9.1 4 10 4.9 10 6C10 7.2 8.5 7.7 8.5 9"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="8.5" cy="11.5" r="0.9" fill="currentColor" />
    </svg>
  );
});

// ── 5. Shop & Economy Glyphs ────────────────────────────────────
export const IconLock = memo(function IconLock({ size = 12, className = "", style, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 14 14"
      width={size}
      height={size}
      fill="none"
      className={className}
      style={{ display: "inline-block", verticalAlign: "middle", ...style }}
      aria-hidden="true"
      {...rest}
    >
      <path
        d="M4.5 5.5V4C4.5 2.6 5.6 1.5 7 1.5C8.4 1.5 9.5 2.6 9.5 4V5.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <rect x="2.5" y="5.5" width="9" height="7" rx="1.2" fill="currentColor" />
      <circle cx="7" cy="8.5" r="1.1" fill="#14100C" />
      <path d="M7 9.5V11" stroke="#14100C" strokeWidth="1" />
    </svg>
  );
});

export const IconUnlock = memo(function IconUnlock({ size = 12, className = "", style, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 14 14"
      width={size}
      height={size}
      fill="none"
      className={className}
      style={{ display: "inline-block", verticalAlign: "middle", ...style }}
      aria-hidden="true"
      {...rest}
    >
      <path
        d="M4.5 5V3.5C4.5 2.1 5.6 1 7 1C8.4 1 9.5 2.1 9.5 3.5V4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <rect x="2.5" y="5.5" width="9" height="7" rx="1.2" fill="currentColor" />
      <circle cx="7" cy="8.5" r="1.1" fill="#14100C" />
      <path d="M7 9.5V11" stroke="#14100C" strokeWidth="1" />
    </svg>
  );
});

export const IconScout = memo(function IconScout({ size = 13, className = "", style, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      className={className}
      style={{ display: "inline-block", verticalAlign: "middle", ...style }}
      aria-hidden="true"
      {...rest}
    >
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.1" />
      <path d="M8 1V4M8 12V15M1 8H4M12 8H15" stroke="currentColor" strokeWidth="1.4" strokeLinecap="square" />
    </svg>
  );
});

export const IconReroll = memo(function IconReroll({ size = 13, className = "", style, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      className={className}
      style={{ display: "inline-block", verticalAlign: "middle", ...style }}
      aria-hidden="true"
      {...rest}
    >
      <path
        d="M13.5 6A5.5 5.5 0 0 0 3.2 4.2M2.5 3V6H5.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2.5 10A5.5 5.5 0 0 0 12.8 11.8M13.5 13V10H10.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
});

export const IconUpgrade = memo(function IconUpgrade({ size = 13, className = "", style, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      className={className}
      style={{ display: "inline-block", verticalAlign: "middle", ...style }}
      aria-hidden="true"
      {...rest}
    >
      <path d="M3 13L8 8L13 13" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" />
      <path d="M5 8L8 5L11 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" opacity="0.75" />
      <path d="M7 4L8 3L9 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="square" opacity="0.5" />
    </svg>
  );
});

export const IconAutoDeploy = memo(function IconAutoDeploy({ size = 12, className = "", style, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 14 14"
      width={size}
      height={size}
      fill="none"
      className={className}
      style={{ display: "inline-block", verticalAlign: "middle", ...style }}
      aria-hidden="true"
      {...rest}
    >
      <polygon points="8,1 2,8 7,8 6,13 12,6 7,6" fill="currentColor" />
    </svg>
  );
});

export const IconCoin = memo(function IconCoin({ size = 14, className = "", style, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      className={className}
      style={{ display: "inline-block", verticalAlign: "middle", ...style }}
      aria-hidden="true"
      {...rest}
    >
      <defs>
        <linearGradient id="icon-coin-grad" x1="2" y1="2" x2="14" y2="14" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFF4CC" />
          <stop offset="45%" stopColor="#F0A93B" />
          <stop offset="100%" stopColor="#8A5A1E" />
        </linearGradient>
      </defs>
      <circle cx="8" cy="8" r="7" fill="url(#icon-coin-grad)" stroke="#4A2E10" strokeWidth="1" />
      <circle cx="8" cy="8" r="5.5" stroke="#FFE9A3" strokeWidth="0.8" opacity="0.65" />
      {/* scarab beetle engraving */}
      <ellipse cx="8" cy="8" rx="2.4" ry="3.1" fill="#5E3812" />
      <circle cx="8" cy="4.9" r="1.1" fill="#5E3812" />
      <path d="M5.6 6.5L4 5M10.4 6.5L12 5M5.6 9.5L4 11M10.4 9.5L12 11" stroke="#5E3812" strokeWidth="0.8" strokeLinecap="round" />
      <line x1="8" y1="5.5" x2="8" y2="11.1" stroke="#F0A93B" strokeWidth="0.6" />
    </svg>
  );
});

/** Settings — a machined brass cog. */
export const IconSettings = memo(function IconSettings({ size = 16, className = "", style, ...rest }: IconProps) {
  const teeth = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2;
    const x = 12 + Math.cos(a) * 8.4;
    const y = 12 + Math.sin(a) * 8.4;
    return <rect key={i} x={x - 2.1} y={y - 2.1} width="4.2" height="4.2" fill="currentColor" transform={`rotate(${(a * 180) / Math.PI} ${x} ${y})`} />;
  });
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" className={className} style={{ display: "inline-block", verticalAlign: "middle", ...style }} aria-hidden="true" {...rest}>
      {teeth}
      <circle cx="12" cy="12" r="7" fill="currentColor" />
      <circle cx="12" cy="12" r="3" fill="#14100C" />
    </svg>
  );
});

/** Language — a latitudinal globe with a meridian. */
export const IconGlobe = memo(function IconGlobe({ size = 16, className = "", style, ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" className={className} style={{ display: "inline-block", verticalAlign: "middle", ...style }} aria-hidden="true" {...rest}>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.7" />
      <ellipse cx="12" cy="12" rx="4" ry="8.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M3.8 9h16.4M3.8 15h16.4" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
});

/** Admin — calibration sliders in a brass frame. */
export const IconAdmin = memo(function IconAdmin({ size = 16, className = "", style, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      className={className}
      style={{ display: "inline-block", verticalAlign: "middle", ...style }}
      aria-hidden="true"
      {...rest}
    >
      <rect x="2.5" y="2.5" width="19" height="19" rx="3" stroke="currentColor" strokeWidth="1.7" />
      <path d="M6 8H14M18.5 8H20M4 12H8.5M13.5 12H20M6 16H16.5M20 16H20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="16.2" cy="8" r="2" fill="currentColor" />
      <circle cx="11" cy="12" r="2" fill="currentColor" />
      <circle cx="18.2" cy="16" r="2" fill="currentColor" />
    </svg>
  );
});

export const IconSpeed = memo(function IconSpeed({ size = 12, className = "", style, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      className={className}
      style={{ display: "inline-block", verticalAlign: "middle", ...style }}
      aria-hidden="true"
      {...rest}
    >
      <path d="M2.5 12A6.5 6.5 0 1 1 13.5 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="8" y1="8" x2="11.5" y2="4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="8" cy="8" r="1.6" fill="currentColor" />
    </svg>
  );
});

// ── 6. Tactical Status & Outcome Badges ─────────────────────────
export const IconBurrow = memo(function IconBurrow({ size = 12, className = "", style, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      className={className}
      style={{ display: "inline-block", verticalAlign: "middle", ...style }}
      aria-hidden="true"
      {...rest}
    >
      <ellipse cx="8" cy="8" rx="6.5" ry="4.5" stroke="currentColor" strokeWidth="1.5" />
      <ellipse cx="8" cy="8" rx="4" ry="2.5" fill="currentColor" opacity="0.6" />
      <circle cx="8" cy="8" r="1.5" fill="#140C0E" />
    </svg>
  );
});

export const IconVulnerable = memo(function IconVulnerable({ size = 12, className = "", style, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      className={className}
      style={{ display: "inline-block", verticalAlign: "middle", ...style }}
      aria-hidden="true"
      {...rest}
    >
      <path d="M8 1.5L2 4V8.5C2 12 8 14.5 8 14.5C8 14.5 14 12 14 8.5V4L8 1.5Z" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 3.5L6.5 7.5H9.5L8 12.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" />
    </svg>
  );
});

export const IconTrendUp = memo(function IconTrendUp({ size = 11, className = "", style, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 12 12"
      width={size}
      height={size}
      fill="none"
      className={className}
      style={{ display: "inline-block", verticalAlign: "middle", ...style }}
      aria-hidden="true"
      {...rest}
    >
      <polygon points="6,2 11,10 1,10" fill="currentColor" stroke="currentColor" strokeWidth="0.8" strokeLinejoin="round" />
    </svg>
  );
});

export const IconTrendDown = memo(function IconTrendDown({ size = 11, className = "", style, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 12 12"
      width={size}
      height={size}
      fill="none"
      className={className}
      style={{ display: "inline-block", verticalAlign: "middle", ...style }}
      aria-hidden="true"
      {...rest}
    >
      <polygon points="6,10 11,2 1,2" fill="currentColor" stroke="currentColor" strokeWidth="0.8" strokeLinejoin="round" />
    </svg>
  );
});

export const IconTrophy = memo(function IconTrophy({ size = 16, className = "", style, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 18 18"
      width={size}
      height={size}
      fill="none"
      className={className}
      style={{ display: "inline-block", verticalAlign: "middle", ...style }}
      aria-hidden="true"
      {...rest}
    >
      <path d="M4.5 2H13.5V7.5C13.5 10 11 11.5 9 11.5C7 11.5 4.5 10 4.5 7.5V2Z" fill="#F0A93B" stroke="#543C16" strokeWidth="1" />
      <path d="M4.5 4H2C2 6.5 3.5 8 4.5 8M13.5 4H16C16 6.5 14.5 8 13.5 8" stroke="#F0A93B" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M9 11.5V14M6 16H12M7.5 14H10.5" stroke="#F0A93B" strokeWidth="1.6" strokeLinecap="square" />
      <polygon points="9,3.5 10,5.5 12,6 10.5,7.5 11,9.5 9,8.5 7,9.5 7.5,7.5 6,6 8,5.5" fill="#FFF4CC" />
    </svg>
  );
});

export const IconSkull = memo(function IconSkull({ size = 14, className = "", style, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      className={className}
      style={{ display: "inline-block", verticalAlign: "middle", ...style }}
      aria-hidden="true"
      {...rest}
    >
      <path d="M3 7C3 4.2 5.2 2 8 2C10.8 2 13 4.2 13 7C13 9 11.8 10.5 11 11.5V13.5H5V11.5C4.2 10.5 3 9 3 7Z" fill="currentColor" />
      <circle cx="6" cy="7" r="1.3" fill="#140C0E" />
      <circle cx="10" cy="7" r="1.3" fill="#140C0E" />
      <path d="M7 13.5V12M9 13.5V12" stroke="#140C0E" strokeWidth="0.8" />
    </svg>
  );
});

// ── 7. Rank Insignia ───────────────────────────────────────────
// These are stamped onto the straight side bands of the octagonal
// specimen seal, never over the specimen art itself. Deliberately
// flat-filled (no <defs>) so hundreds of instances stay cheap.

/** Frontline — riveted heater shield, optically centred on a 24px grid. */
export const IconRoleShield = memo(function IconRoleShield({ size = 10, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" className={className} style={{ display: "block" }} aria-hidden="true">
      <path
        d="M12 2.6L19 5.1V11.2C19 16.1 15.9 19.6 12 21.4C8.1 19.6 5 16.1 5 11.2V5.1L12 2.6Z"
        fill="#175C44"
        stroke="#71E2B9"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M7.6 9.4L12 12L16.4 9.4" stroke="#D7FFF0" strokeWidth="1.7" strokeLinecap="square" />
      <circle cx="12" cy="6.6" r="1.25" fill="#D7FFF0" />
      <circle cx="7.4" cy="6.4" r="0.8" fill="#0E3627" />
      <circle cx="16.6" cy="6.4" r="0.8" fill="#0E3627" />
    </svg>
  );
});

/** Artillery — optical ranging reticle, perfectly concentric on a 24px grid. */
export const IconRoleScope = memo(function IconRoleScope({ size = 10, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" className={className} style={{ display: "block" }} aria-hidden="true">
      <circle cx="12" cy="12" r="8" fill="#152C4A" stroke="#9CC8FF" strokeWidth="1.7" />
      <circle cx="12" cy="12" r="4.6" stroke="#C9E2FF" strokeWidth="1.1" strokeOpacity="0.9" />
      <path d="M12 2.2V6.4M12 17.6V21.8M2.2 12H6.4M17.6 12H21.8" stroke="#E3F4FF" strokeWidth="1.8" strokeLinecap="square" />
      <circle cx="12" cy="12" r="2.3" fill="#FFE7A3" />
      <circle cx="11.1" cy="11.1" r="0.85" fill="#FFFFFF" opacity="0.85" />
    </svg>
  );
});

/**
 * Assassin — a symmetrical mantis predator emblem: triangular head,
 * two huge compound eyes, swept antennae and crossed raptorial forelegs.
 * Mirrored about x=12 so it sits dead-centre in its badge at any size —
 * the old single diagonal hook drifted low and read as a green smudge.
 */
export const IconRoleScythe = memo(function IconRoleScythe({ size = 10, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" className={className} style={{ display: "block" }} aria-hidden="true">
      {/* crossed raptorial forelegs behind the head */}
      <path d="M5.4 12.6C7.4 15.8 9.6 17.6 12 18.4C14.4 17.6 16.6 15.8 18.6 12.6" stroke="#F0A93B" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M6.8 17.8L5.2 20.4M17.2 17.8L18.8 20.4" stroke="#F0A93B" strokeWidth="1.3" strokeLinecap="round" />
      {/* antennae */}
      <path d="M9.4 5.6C7.8 3.9 5.9 3 3.9 2.6M14.6 5.6C16.2 3.9 18.1 3 20.1 2.6" stroke="#B9F7CD" strokeWidth="1.2" strokeLinecap="round" />
      {/* triangular mantis head */}
      <path
        d="M7.2 5.4H16.8L19.4 10.2L12 19.6L4.6 10.2L7.2 5.4Z"
        fill="#239647"
        stroke="#A7F3BC"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* compound eyes */}
      <ellipse cx="8.6" cy="10" rx="1.65" ry="2.5" fill="#DFFFE8" stroke="#123B22" strokeWidth="0.9" />
      <ellipse cx="15.4" cy="10" rx="1.65" ry="2.5" fill="#DFFFE8" stroke="#123B22" strokeWidth="0.9" />
      <circle cx="8.6" cy="10.6" r="0.62" fill="#123B22" />
      <circle cx="15.4" cy="10.6" r="0.62" fill="#123B22" />
      {/* mouth point + neck keel */}
      <path d="M10.6 16.2L12 18.2L13.4 16.2" stroke="#DFFFE8" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
});

/**
 * Commander — three-point jewelled crest.
 * Rendered above the seal as a heraldic crown rather than stamped over the art.
 */
export const IconCrest = memo(function IconCrest({ size = 12, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 18" width={size} height={(size * 18) / 24} fill="none" className={className} style={{ display: "block" }} aria-hidden="true">
      <path
        d="M4.2 13.6L3.2 5.9L7.6 8.7L12 3.9L16.4 8.7L20.8 5.9L19.8 13.6H4.2Z"
        fill="#F5B642"
        stroke="#4A3010"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <rect x="4.2" y="13.6" width="15.6" height="2.3" fill="#D98A26" stroke="#4A3010" strokeWidth="0.9" />
      <path d="M5.6 11.8L7.6 10.2L9.6 11.8L12 10.4L14.4 11.8L16.4 10.2L18.4 11.8" stroke="#FFF6D6" strokeWidth="0.9" strokeLinejoin="round" />
      <circle cx="3.2" cy="4.9" r="1.35" fill="#FFE7A3" stroke="#4A3010" strokeWidth="0.7" />
      <circle cx="12" cy="3" r="1.55" fill="#FFF6D6" stroke="#4A3010" strokeWidth="0.7" />
      <circle cx="20.8" cy="4.9" r="1.35" fill="#FFE7A3" stroke="#4A3010" strokeWidth="0.7" />
      <circle cx="12" cy="11" r="1.25" fill="#E0522F" stroke="#4A3010" strokeWidth="0.7" />
    </svg>
  );
});

/** Back-compat alias. */
export const IconRoleCannon = IconRoleScope;

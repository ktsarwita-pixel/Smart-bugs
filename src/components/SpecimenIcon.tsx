import React, { memo } from "react";
import { PixelArt } from "./PixelArt";
import { BUGS, COMMANDERS, artFor, voxFor, type BugId } from "../game/data";
import { StarRating, IconRoleShield, IconRoleScope, IconRoleScythe, IconCrest } from "./CustomIcons";

/**
 * Where the rank insignia lives relative to the seal.
 *  - "corner": brass escutcheon overhanging the lower-right bevel (needs
 *              ~30% free space around the seal — inspectors, standings, lists).
 *  - "none":   seal only. Use this inside tight cards and render
 *              <RankBadge/> yourself where the layout has room for it.
 */
export type BadgeMode = "corner" | "none";

interface Props {
  /** bug id or commander id */
  id: string;
  /** outer medallion size in px */
  size?: number;
  star?: number;
  selected?: boolean;
  /** sold / dead / unavailable */
  dim?: boolean;
  /** hide the brass frame — bare sprite only */
  bare?: boolean;
  /** rank insignia placement; defaults to the overhanging corner badge */
  badge?: BadgeMode;
  className?: string;
  title?: string;
}

const accentFor = (id: string): string => {
  const b = (BUGS as unknown as Record<string, { accent: string }>)[id];
  if (b) return b.accent;
  return COMMANDERS.find((c) => c.id === id)?.accent ?? "#F0A93B";
};

const isCommanderId = (id: string) => !(id in BUGS);

/** Unit rank insignia, resolved once per role. */
const INSIGNIA: Record<string, (size: number) => React.ReactNode> = {
  Frontline: (s) => <IconRoleShield size={s} />,
  Artillery: (s) => <IconRoleScope size={s} />,
  Assassin: (s) => <IconRoleScythe size={s} />,
};

/** Resolves the right glyph for a specimen id at a given pixel size. */
export function rankGlyph(id: string, size: number): React.ReactNode {
  if (isCommanderId(id)) return <IconCrest size={size} />;
  return INSIGNIA[BUGS[id as BugId].role]?.(size) ?? null;
}

export const roleLabel = (id: string) =>
  isCommanderId(id) ? "Commander" : BUGS[id as BugId].role;

/**
 * Standalone rank badge — a brass escutcheon holding the role glyph.
 * Drop it anywhere a layout has room (beside a name, in a header row) so the
 * seal itself can stay a clean portrait. Decorative: the role is always
 * stated in adjacent visible text, so it must NOT inject itself into a
 * parent button's accessible name.
 */
export const RankBadge = memo(function RankBadge({
  id,
  size = 16,
  className = "",
  dim = false,
}: {
  id: string;
  size?: number;
  className?: string;
  dim?: boolean;
}) {
  const commander = isCommanderId(id);
  const glyph = Math.round(size * (commander ? 0.86 : 0.78));
  return (
    <span
      className={`rank-badge${commander ? " rank-badge--crest" : ""}${dim ? " rank-badge--dim" : ""} ${className}`.trim()}
      style={{ width: commander ? Math.round(size * 1.18) : size, height: size }}
      title={roleLabel(id)}
      aria-hidden="true"
    >
      {rankGlyph(id, glyph)}
    </span>
  );
});

/**
 * A specimen seal: octagonal brass rim, recessed accent plate, and the
 * portrait drawn at full size. Every 16x16 sprite fills all sixteen rows, so
 * NOTHING is ever stamped onto the plate — the rank insignia either hangs
 * off the bevel as a separate badge or is rendered beside the seal by the
 * parent layout.
 */
export const SpecimenIcon = memo(function SpecimenIcon({
  id,
  size = 40,
  star = 0,
  selected = false,
  dim = false,
  bare = false,
  badge = "corner",
  className = "",
  title,
}: Props) {
  const { art, pal } = artFor(id);
  const accent = accentFor(id);

  if (bare) {
    return (
      <PixelArt
        art={art}
        pal={pal}
        size={size}
        glow={voxFor(id).glow}
        className={className}
        style={dim ? { filter: "grayscale(1)", opacity: 0.3 } : undefined}
      />
    );
  }

  const spriteSize = Math.round(size * 0.76);
  const showCorner = badge === "corner" && size >= 26;
  const cornerSize = Math.max(11, Math.round(size * 0.42));

  return (
    <span
      className={`spec-icon${selected ? " spec-icon--sel" : ""}${dim ? " spec-icon--dim" : ""} ${className}`.trim()}
      style={{ width: size, height: size, "--accent": accent } as React.CSSProperties}
      title={title}
    >
      <span className="spec-icon__plate">
        <PixelArt art={art} pal={pal} size={spriteSize} glow={voxFor(id).glow} />
        <span className="spec-icon__sheen" />
      </span>

      {/* Star gems — bottom band, beneath the sprite's feet */}
      {star > 0 && (
        <span className="spec-icon__pips drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
          <StarRating star={star} size={size < 36 ? 7 : 9} />
        </span>
      )}

      {/* Detached rank badge on the lower-right bevel */}
      {showCorner && (
        <span className="spec-icon__corner" aria-hidden="true">
          <RankBadge id={id} size={cornerSize} dim={dim} />
        </span>
      )}
    </span>
  );
});

export const bugShortName = (id: BugId) => BUGS[id]?.short ?? id;

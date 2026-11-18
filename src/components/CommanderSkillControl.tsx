import { useId } from "react";
import { useSettings } from "../i18n";
import type { CmdDef } from "../game/data";
import { IconStar } from "./CustomIcons";

interface Props {
  commander: CmdDef;
  status: string;
  prompt: string;
  targeting: boolean;
  disabled: boolean;
  options: { uid: number; label: string }[];
  onToggle: () => void;
  onTarget: (uid: number) => void;
}

/** The native picker makes drawer targeting usable with a keyboard or no WebGL. */
export function CommanderSkillControl({ commander, status, prompt, targeting, disabled, options, onToggle, onTarget }: Props) {
  const { t } = useSettings();
  const id = useId();
  return (
    <div className="commander-control" data-commander={commander.id} data-targeting={targeting}>
      <button type="button" className="commander-control__skill" title={t(commander.skill.desc)}
        aria-pressed={targeting} aria-describedby={id} disabled={disabled && !targeting} onClick={onToggle}>
        <IconStar size={13} />
        <span>{t(commander.skill.name)}</span>
      </button>
      <span id={id} className={targeting ? "sr-only" : "commander-control__status"} role="status">
        {targeting ? prompt : status}
      </span>
      {targeting && (
        <select value="" aria-label={prompt} className="commander-control__targets"
          onChange={(e) => { if (e.currentTarget.value) onTarget(Number(e.currentTarget.value)); }}>
          <option value="" disabled>{prompt}</option>
          {options.map(({ uid, label }) => <option key={uid} value={uid}>{label}</option>)}
        </select>
      )}
    </div>
  );
}

import { IconClose, IconGlobe, IconSettings } from "./CustomIcons";
import { useSettings, type Lang } from "../i18n";

interface Props {
  open: boolean;
  onClose: () => void;
}

const LANGS: { id: Lang; native: string; latin: string }[] = [
  { id: "en", native: "English", latin: "English" },
  { id: "id", native: "Bahasa Indonesia", latin: "Indonesian" },
];

/**
 * Options sheet. Mobile-first bottom sheet, centred dialog on desktop.
 * Everything here is applied immediately and persisted to localStorage.
 */
export function SettingsModal({ open, onClose }: Props) {
  const { lang, setLang, motion, setMotion, t } = useSettings();
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/80 backdrop-blur-[3px] sm:items-center sm:p-4"
      role="presentation"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="rise flex max-h-[90dvh] w-full max-w-[460px] flex-col overflow-hidden border-2 border-[#4A3828] bg-[#120D09] shadow-[0_18px_60px_rgba(0,0,0,.9)]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-3 border-b border-[#3B322A] bg-[#1D150F] px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid h-10 w-10 shrink-0 place-items-center border border-[#4A3828] bg-[#17110C] text-[#F0A93B]">
              <IconSettings size={19} />
            </span>
            <div className="min-w-0">
              <h2 id="settings-title" className="font-pixel text-[11px] text-[#FFF3DC]">
                {t("SETTINGS")}
              </h2>
              <p className="latin text-[12px] text-[#9C8F7E]">{t("LANGUAGE & DISPLAY")}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("CLOSE")}
            className="grid h-11 w-11 shrink-0 place-items-center border border-[#4A3828] bg-[#120D09] text-[#EDE2CB] active:translate-y-[1px]"
          >
            <IconClose size={13} />
          </button>
        </header>

        <div className="safe-b min-h-0 flex-1 overflow-y-auto p-3.5">
          <div className="mb-2 flex items-center gap-2">
            <IconGlobe size={14} className="text-[#56DCA8]" />
            <h3 className="label text-[8px] text-[#56DCA8]">{t("LANGUAGE")}</h3>
          </div>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t("LANGUAGE")}>
            {LANGS.map((option) => {
              const on = lang === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setLang(option.id)}
                  className={`lift min-h-[56px] border px-3 py-2 text-left ${
                    on
                      ? "border-[#F0A93B] bg-[#241B14] shadow-[0_0_0_1px_#F0A93B]"
                      : "border-[#3B322A] bg-[#17110C] hover:border-[#6B4B24]"
                  }`}
                >
                  <span className="block font-pixel text-[9px]" style={{ color: on ? "#F0A93B" : "#EDE2CB" }}>
                    {option.native}
                  </span>
                  <span className="mt-1 block font-mono text-[9px] text-[#8C7E6E]">{option.latin}</span>
                  <span className="mt-1 block label text-[6.5px]" style={{ color: on ? "#56DCA8" : "#6B5F52" }}>
                    {on ? t("SELECTED") : ""}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-4 mb-2 flex items-center gap-2">
            <IconSettings size={13} className="text-[#F0A93B]" />
            <h3 className="label text-[8px] text-[#F0A93B]">{t("MOTION")}</h3>
          </div>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t("MOTION")}>
            {(["full", "reduced"] as const).map((option) => {
              const on = motion === option;
              return (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setMotion(option)}
                  className={`lift min-h-[48px] border px-3 py-2 text-left font-mono text-[10px] ${
                    on
                      ? "border-[#56DCA8] bg-[#0F241C] text-[#D6FFEF]"
                      : "border-[#3B322A] bg-[#17110C] text-[#B3A594]"
                  }`}
                >
                  {option === "full" ? t("Full motion") : t("Reduced motion")}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[10px] leading-snug text-[#7B6E5F]">
            {t("Reduced motion quietens ambient effects and the interface.")}
          </p>
        </div>

        <div className="border-t border-[#3B322A] p-3">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[46px] w-full border border-[#4A3828] bg-[#17110C] label text-[9px] text-[#EDE2CB] active:translate-y-[1px]"
          >
            {t("CLOSE")}
          </button>
        </div>
      </section>
    </div>
  );
}

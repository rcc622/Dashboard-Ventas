export type Tone = "good" | "warning" | "serious" | "critical";

const TONE: Record<Tone, { className: string; icon: string; label: string }> = {
  good: { className: "text-good", icon: "●", label: "Al día" },
  warning: { className: "text-warning", icon: "!", label: "Atención" },
  serious: { className: "text-serious", icon: "▲", label: "Serio" },
  critical: { className: "text-critical", icon: "■", label: "Crítico" },
};

interface StatTileProps {
  label: string;
  value: string;
  hint?: string;
  /** Estado semántico: siempre va con icono + texto, nunca solo color. */
  tone?: Tone;
  /** La cifra principal del dashboard (una sola por vista). */
  hero?: boolean;
}

export function StatTile({ label, value, hint, tone, hero = false }: StatTileProps) {
  return (
    <div className={`rounded-xl border border-border bg-surface p-4 ${hero ? "col-span-2" : ""}`}>
      <div className="text-xs text-muted">{label}</div>
      <div className={`mt-1 font-semibold leading-none text-text ${hero ? "text-5xl" : "text-3xl"}`}>{value}</div>
      {(hint || tone) && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-text-2">
          {tone && (
            <span className={`${TONE[tone].className} font-semibold`}>
              <span aria-hidden>{TONE[tone].icon}</span> {TONE[tone].label}
            </span>
          )}
          {hint && (
            <span>
              {tone ? "· " : ""}
              {hint}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

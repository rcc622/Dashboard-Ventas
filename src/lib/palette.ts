/**
 * Paleta del dashboard (modo oscuro, superficie #1a1a19).
 * Validada con el validador de la skill dataviz: las 3 primeras series pasan
 * separación CVD y contraste. El texto nunca usa color de serie: usa text/text2/muted.
 */
export const palette = {
  /** Series categóricas en orden fijo (nunca se reciclan): azul, naranja, aqua, amarillo. */
  series: ["#3987e5", "#d95926", "#199e70", "#c98500"],
  surface: "#1a1a19",
  surface2: "#232322",
  grid: "#2c2c2a",
  axis: "#383835",
  muted: "#898781",
  text: "#ffffff",
  text2: "#c3c2b7",
  status: {
    good: "#0ca30c",
    warning: "#fab219",
    serious: "#ec835a",
    critical: "#d03b3b",
  },
} as const;

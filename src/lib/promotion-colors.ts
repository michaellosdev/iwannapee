export const PROMOTION_COLORS = [
  { key: "aqua", label: "Aqua" },
  { key: "sky", label: "Sky" },
  { key: "blue", label: "Blue" },
  { key: "mint", label: "Mint" },
  { key: "green", label: "Green" },
  { key: "yellow", label: "Yellow" },
  { key: "orange", label: "Orange" },
  { key: "coral", label: "Coral" },
  { key: "pink", label: "Pink" },
  { key: "lavender", label: "Lavender" },
] as const;

export type PromotionColorKey = (typeof PROMOTION_COLORS)[number]["key"];

export const DEFAULT_PROMOTION_COLOR: PromotionColorKey = "aqua";

const promotionColorKeys = new Set<string>(PROMOTION_COLORS.map((color) => color.key));

export function normalizePromotionColorKey(value: unknown): PromotionColorKey {
  return typeof value === "string" && promotionColorKeys.has(value)
    ? value as PromotionColorKey
    : DEFAULT_PROMOTION_COLOR;
}

export function promotionColorClassName(color: PromotionColorKey) {
  return `promotion-color-${color}`;
}

// Background color mapping
export const bgColors: Record<string, string> = {
  slate: "bg-slate-800",
  blue: "bg-blue-800",
  amber: "bg-amber-700",
  green: "bg-green-800",
  purple: "bg-purple-800",
  red: "bg-red-800",
  zinc: "bg-zinc-800",
  neutral: "bg-neutral-800",
  white: "bg-white",
  black: "bg-black",
};

// Light colors that need dark text
const lightColors = ["white", "#ffffff", "#fff", "#f0f8ff", "#fafafa", "#f5f5f5", "#e5e5e5", "amber"];

export function isLightColor(color: string): boolean {
  const lower = color.toLowerCase();
  if (lightColors.includes(lower)) return true;
  if (lower.startsWith("#") && lower.length >= 4) {
    const firstChar = lower[1];
    return ["f", "e", "d", "c"].includes(firstChar);
  }
  return false;
}

export function getBgClass(color: string): string {
  const lower = color.toLowerCase();
  if (bgColors[lower]) return bgColors[lower];
  if (color.startsWith("#")) return "";
  return "bg-zinc-800";
}

export function getBgStyle(color: string): React.CSSProperties {
  if (color.startsWith("#")) {
    return { backgroundColor: color };
  }
  return {};
}

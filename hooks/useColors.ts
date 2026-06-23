import { useColorScheme } from "react-native";

import colors from "@/constants/colors";

export type AppColors = typeof colors.dark & { radius: number };

export function useColors(): AppColors {
  const scheme = useColorScheme();
  const palette =
    scheme === "dark" && "dark" in colors
      ? (colors as unknown as Record<string, typeof colors.light>).dark
      : colors.light;
  return { ...palette, radius: colors.radius };
}

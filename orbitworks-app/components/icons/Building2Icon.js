import Svg, { Path } from "react-native-svg";

// Lucide "building-2" icon - the same one the web dashboard uses for a
// company. Drawn with react-native-svg (bundled with Expo Go).
export default function Building2Icon({ size = 14, color = "currentColor", strokeWidth = 2 }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="M10 12h4" />
      <Path d="M10 8h4" />
      <Path d="M14 21v-3a2 2 0 0 0-4 0v3" />
      <Path d="M6 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2" />
      <Path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16" />
    </Svg>
  );
}

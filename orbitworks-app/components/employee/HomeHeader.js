import { View, Text, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../../lib/ThemeContext";
import Avatar from "../Avatar";

// Employee Home top row: selfie + name on the left, job site on the right
// (blank when there is none).
export default function HomeHeader({ name, photoUrl, siteName }) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <View style={styles.left}>
        <Avatar name={name} photoUrl={photoUrl} size={48} />
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
          {name}
        </Text>
      </View>
      {siteName ? (
        <View style={[styles.site, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="map-pin" size={13} color={colors.accent} />
          <Text style={[styles.siteText, { color: colors.accent }]} numberOfLines={1}>
            {siteName}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  left: { flexDirection: "row", alignItems: "center", gap: 12, flexShrink: 1 },
  name: { fontSize: 18, fontWeight: "700", flexShrink: 1 },
  site: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    maxWidth: "45%",
  },
  siteText: { fontSize: 13, fontWeight: "600", flexShrink: 1 },
});

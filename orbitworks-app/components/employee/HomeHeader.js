import { View, Text, StyleSheet } from "react-native";
import { lightColors as colors, radii, spacing, fontSizes } from "../../lib/theme";
import Avatar from "../Avatar";
import Building2Icon from "../icons/Building2Icon";

// Employee App top row: selfie, a small greeting over the name, and (while
// known) the employee's company as a blue pill on the right.
export default function HomeHeader({ name, photoUrl, greeting, companyName }) {
  return (
    <View style={styles.row}>
      <View style={styles.left}>
        <Avatar name={name} photoUrl={photoUrl} size={44} />
        <View style={styles.names}>
          {greeting ? <Text style={styles.greeting}>{greeting}</Text> : null}
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
        </View>
      </View>
      {companyName ? (
        <View style={styles.site}>
          <Building2Icon size={12} color={colors.onColor} />
          <Text style={styles.siteText} numberOfLines={1}>
            {companyName}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  left: { flexDirection: "row", alignItems: "center", gap: spacing.md, flexShrink: 1 },
  names: { flexShrink: 1 },
  greeting: { fontSize: fontSizes.sm, color: colors.subtext },
  name: { fontSize: fontSizes.lg, fontWeight: "700", color: colors.text, marginTop: 1 },
  site: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    maxWidth: "45%",
  },
  siteText: { fontSize: fontSizes.sm, fontWeight: "600", color: colors.onColor, flexShrink: 1 },
});

import { ScrollView, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { spacing, fontSizes } from "../../lib/theme";
import { makeStyles } from "../../lib/makeStyles";
import { useTabBarSpace } from "../../lib/hooks/useTabBarSpace";

// Light Employee App tab page: bold title top-left, scrolling content, and
// room at the bottom for the floating tab bar. fill: let content stretch to
// the full height (for centered empty states).
export default function TabPage({ title, children, fill }) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const tabBarSpace = useTabBarSpace();
  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.lg, paddingBottom: tabBarSpace + spacing.xxl },
        fill && styles.fill,
      ]}
    >
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {children}
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  page: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.xl },
  fill: { flexGrow: 1 },
  title: { fontSize: fontSizes.pageTitle, fontWeight: "800", color: colors.text, marginBottom: spacing.lg },
}));

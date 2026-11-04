import { View, Text } from "react-native";
import { spacing, fontSizes } from "../../lib/theme";
import { makeStyles } from "../../lib/makeStyles";
import ListRow from "../ui/ListRow";
import StatusPill from "../ui/StatusPill";

// One comment on the Comments screen: the text, when it was typed, and its
// sync pill (Will sync / Not synced) while it's still on the phone.
// tag: { label, tone } or null. whenLabel: "Today, 9:05 AM" (or "Saving").
export default function CommentRow({ note, whenLabel, tag, divider }) {
  const styles = useStyles();
  return (
    <ListRow divider={divider}>
      <Text style={styles.note}>{note}</Text>
      <View style={styles.meta}>
        <Text style={styles.when}>{whenLabel}</Text>
        {tag ? <StatusPill label={tag.label} tone={tag.tone} /> : null}
      </View>
    </ListRow>
  );
}

const useStyles = makeStyles((colors) => ({
  note: { fontSize: fontSizes.md, color: colors.text },
  meta: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.xs },
  when: { fontSize: fontSizes.sm, color: colors.subtext },
}));

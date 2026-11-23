import { Modal, View, Text, TouchableOpacity } from "react-native";
import { Feather } from "@expo/vector-icons";
import { radii, spacing, fontSizes } from "../lib/theme";
import { useTheme } from "../lib/ThemeContext";
import { makeStyles } from "../lib/makeStyles";
import Button from "./ui/Button";

// Logout fix (2026-11-21), both apps: Log out while something hasn't sent.
// title: "3 punches haven't sent yet" (lib/queueOwnerLogic.js unsentTitle);
// message: nothing is deleted, they send when you sign back in. "Send now"
// is the big first button (the screen sends, then logs out if nothing is
// left, else shows note); "Log out anyway" keeps them on the phone;
// "Stay signed in" closes the box. Nothing here ever deletes anything.
export default function LogoutUnsentModal({ visible, title, message, note, sending, offline, onSendNow, onLogOut, onCancel }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={sending ? undefined : onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.box} accessibilityRole="alert">
          <Feather name="upload-cloud" size={36} color={colors.orangeStrong} style={styles.icon} />
          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          {note ? <Text style={styles.note}>{note}</Text> : null}
          {offline && !note ? <Text style={styles.note}>No connection right now.</Text> : null}
          <View style={styles.buttons}>
            <Button label="Send now" tone="blue" onPress={onSendNow} busy={sending} disabled={offline} />
            <Button label="Log out anyway" tone="red" variant="outline" onPress={onLogOut} disabled={sending} />
          </View>
          <TouchableOpacity
            onPress={onCancel}
            disabled={sending}
            style={styles.cancel}
            accessibilityRole="button"
            accessibilityLabel="Stay signed in"
          >
            <Text style={[styles.cancelText, sending && styles.dim]}>Stay signed in</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((colors) => ({
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: "center", padding: spacing.xxl },
  box: { backgroundColor: colors.surface, borderRadius: radii.xl, padding: spacing.xxl },
  icon: { alignSelf: "center", marginBottom: spacing.md },
  title: { fontSize: fontSizes.xl, fontWeight: "700", color: colors.text, textAlign: "center", lineHeight: 26 },
  message: { fontSize: fontSizes.md, color: colors.subtext, textAlign: "center", marginTop: spacing.md, lineHeight: 21 },
  note: { fontSize: fontSizes.md, color: colors.redStrong, textAlign: "center", marginTop: spacing.md, lineHeight: 21 },
  buttons: { gap: spacing.md, marginTop: spacing.xxl },
  cancel: { alignSelf: "center", marginTop: spacing.lg, padding: spacing.sm },
  cancelText: { fontSize: fontSizes.md, fontWeight: "600", color: colors.accent },
  dim: { opacity: 0.5 },
}));

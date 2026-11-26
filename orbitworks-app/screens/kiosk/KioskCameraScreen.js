import { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../lib/ThemeContext";
import { useKiosk } from "../../lib/hooks/useKiosk";
import { useKioskIdle } from "../../lib/hooks/useKioskIdle";
import { startPunchFix } from "../../lib/punchLocation";
import PunchCamera from "../../components/employee/PunchCamera";
import { KIOSK_IDLE_CAMERA_MS } from "../../lib/kioskLayout";
import ClockCommentModal from "../../components/ClockCommentModal";

// Task 5 Kiosk mode - the clock in/out photo (same camera as the Employee
// App: front camera, Retake / Use photo). The photo goes with the punch; the
// Pro face check runs on the server like every other punch. Saved first,
// sent right after (never blocked by signal). Back to Home after 60 s idle
// (never the 15 s, and paused while the photo is being saved - cleanup 11/26).
// iPad round 1: the same optional Comment button as the supervisor app's
// camera (top right). The comment is saved on the punch (employeeComment)
// and shows in Session review like a supervisor-app comment.
export default function KioskCameraScreen({ navigation, route }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const kiosk = useKiosk();
  const { employeeId, pin, action } = route.params;
  const employee = kiosk.table?.employees.find((e) => e.id === employeeId) || null;
  const [error, setError] = useState("");
  const [comment, setComment] = useState("");
  const [commentOpen, setCommentOpen] = useState(false);
  const saving = useRef(false);
  const [busy, setBusy] = useState(false);
  const fix = useRef(null);
  const touch = useKioskIdle(navigation, KIOSK_IDLE_CAMERA_MS, busy);

  useEffect(() => {
    fix.current = startPunchFix();
  }, []);

  async function onUse(uri) {
    touch();
    if (saving.current || !employee) return;
    saving.current = true;
    setBusy(true);
    try {
      const location = fix.current ? fix.current.take(Date.now()) : null;
      const { atMs } = await kiosk.recordPunch({ employee, action, pin, photoUri: uri, location, comment });
      navigation.replace("KioskDone", { name: employee.name, action, atMs });
    } catch {
      saving.current = false;
      setBusy(false);
      setError("Couldn't save that punch. Try again.");
    }
  }

  return (
    <View style={styles.flex} onTouchStart={touch}>
      <PunchCamera onUse={onUse} onCancel={() => navigation.popToTop()} />

      <TouchableOpacity
        style={[styles.commentButton, { top: insets.top + 50 }]}
        onPress={() => {
          touch();
          setCommentOpen(true);
        }}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        accessibilityRole="button"
        accessibilityLabel={comment ? "Edit comment" : "Add a comment"}
      >
        <Ionicons name={comment ? "checkmark-circle" : "chatbubble-ellipses-outline"} size={18} color="#fff" />
        <Text style={styles.commentButtonText}>Comment</Text>
      </TouchableOpacity>

      {error ? (
        <View style={[styles.errorBar, { backgroundColor: colors.redStrong }]}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <ClockCommentModal
        visible={commentOpen}
        initialText={comment}
        nextType={action}
        onActivity={touch}
        onSave={(text) => {
          touch();
          setComment(text);
          setCommentOpen(false);
        }}
        onClose={() => {
          touch();
          setCommentOpen(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#000" },
  // Same as the supervisor ClockCameraScreen's Comment button.
  commentButton: {
    position: "absolute", right: 16, height: 44, paddingHorizontal: 16,
    borderRadius: 22, backgroundColor: "#3b6fe0",
    flexDirection: "row", alignItems: "center", gap: 6,
  },
  commentButtonText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  errorBar: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 16 },
  errorText: { color: "#fff", fontSize: 16, fontWeight: "600", textAlign: "center" },
});

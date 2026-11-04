import { useCallback, useState } from "react";
import { Text, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { spacing, fontSizes, radii } from "../../lib/theme";
import { useTheme } from "../../lib/ThemeContext";
import { makeStyles } from "../../lib/makeStyles";
import { useAuth } from "../../lib/AuthContext";
import { useEmployeeAppConfig } from "../../lib/hooks/useEmployeeAppConfig";
import { useEmployeeSelfView } from "../../lib/hooks/useEmployeeSelfView";
import { useShiftComments } from "../../lib/hooks/useShiftComments";
import { useCommentQueue } from "../../lib/hooks/useCommentQueue";
import { useNow } from "../../lib/hooks/useNow";
import { enqueueComment } from "../../lib/commentQueue";
import { commentsLoadNotice, shiftCommentRows } from "../../lib/commentQueueLogic";
import { formatWhen } from "../../lib/punchQueueLogic";
import { formatClockTime } from "../../lib/employeeHome";
import { SHIFT_NOTE_MAX_LENGTH } from "../../lib/validators/shiftComment";
import ScreenHeader from "../../components/ScreenHeader";
import CommentRow from "../../components/employee/CommentRow";

// Employee App Phase 5: comments on the current shift (opened from Home's
// Comments button while clocked in or on break). Many per shift, never
// edited. A new comment is saved on the phone first and shows at once, then
// syncs with the punches (lib/commentQueue.js) - it works offline. The list
// is this shift's comments on the server plus the ones still on the phone,
// newest first, with Will sync / Not synced pills (Remove is on the Sync tab).
// If the server read fails, a short notice says so (commentsLoadNotice).
// route.params: { clockEventId, shiftInMs }
export default function ShiftCommentsScreen({ route, navigation }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { userData, linkedEmployeeId } = useAuth();
  const companyId = userData?.companyId;
  const employeeId = linkedEmployeeId || userData?.employeeId;
  const clockEventId = route.params?.clockEventId || null;
  const shiftInMs = route.params?.shiftInMs ?? null;
  const { timezone } = useEmployeeAppConfig(companyId);
  const { view } = useEmployeeSelfView(companyId, employeeId);
  const createdByName = view?.name ?? "";
  const server = useShiftComments(companyId, employeeId, clockEventId);
  const queue = useCommentQueue(companyId, employeeId, timezone);
  const now = useNow(60000);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const rows = shiftCommentRows(server.notes, queue.all, clockEventId, companyId, employeeId);
  const loadNotice = commentsLoadNotice(server);

  const save = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      await enqueueComment({ companyId, employeeId, clockEventId, note, createdByName });
      setNote("");
    } catch (err) {
      setError(err && err.message ? err.message : "Couldn't save this comment. Try again.");
    } finally {
      setSaving(false);
    }
  }, [saving, companyId, employeeId, clockEventId, note, createdByName]);

  const canSave = note.trim().length > 0 && !saving && !!clockEventId;
  return (
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScreenHeader title="Comments" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {shiftInMs ? <Text style={styles.shift}>Shift started {formatClockTime(shiftInMs, timezone)}</Text> : null}
        <TextInput
          style={styles.input}
          placeholder="e.g. Gate was locked, waited 20 min"
          placeholderTextColor={colors.subtext}
          value={note}
          onChangeText={setNote}
          maxLength={SHIFT_NOTE_MAX_LENGTH}
          multiline
          textAlignVertical="top"
          accessibilityLabel="New comment"
        />
        <Text style={styles.count}>
          {note.length}/{SHIFT_NOTE_MAX_LENGTH}
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <TouchableOpacity style={[styles.button, !canSave && styles.disabled]} onPress={save} disabled={!canSave}>
          <Text style={styles.buttonText}>Add comment</Text>
        </TouchableOpacity>

        <Text style={styles.heading}>This shift</Text>
        {loadNotice ? <Text style={styles.notice}>{loadNotice}</Text> : null}
        {rows.length === 0 ? <Text style={styles.empty}>No comments yet for this shift.</Text> : null}
        {rows.map((r, i) => (
          <CommentRow key={r.id} note={r.note} whenLabel={r.ms ? formatWhen(r.ms, now, timezone) : "Saving"} tag={r.tag} divider={i < rows.length - 1} />
        ))}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((colors) => ({
  page: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.xl, paddingBottom: spacing.xxxl },
  shift: { fontSize: fontSizes.sm, color: colors.subtext, marginBottom: spacing.md },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.card,
    color: colors.text,
    padding: spacing.lg,
    fontSize: fontSizes.md,
    minHeight: 120,
  },
  count: { fontSize: fontSizes.xs, color: colors.subtext, alignSelf: "flex-end", marginTop: spacing.xs },
  error: { fontSize: fontSizes.sm, color: colors.red, marginTop: spacing.sm },
  button: { marginTop: spacing.md, borderRadius: radii.lg, paddingVertical: spacing.lg, alignItems: "center", backgroundColor: colors.accent },
  disabled: { opacity: 0.5 },
  buttonText: { color: colors.onColor, fontSize: fontSizes.md, fontWeight: "700" },
  heading: { fontSize: fontSizes.lg, fontWeight: "700", color: colors.text, marginTop: spacing.xxl, marginBottom: spacing.sm },
  empty: { fontSize: fontSizes.sm, color: colors.subtext },
  notice: { fontSize: fontSizes.sm, color: colors.orangeText, marginBottom: spacing.sm },
}));

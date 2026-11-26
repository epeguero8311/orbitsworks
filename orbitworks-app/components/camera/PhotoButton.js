import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, Image, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../../lib/ThemeContext";
import Avatar from "../Avatar";
import PhotoNoticeModal from "../supervisor/PhotoNoticeModal";
import FullScreenCamera from "./FullScreenCamera";

// Task 5 v2 (6): a photo button (like Edit Employee's Change photo) that
// turns the whole screen into the camera. The identity-verification notice
// (Terms Section 4.1) shows first, every time. onPhoto(uri, noticeShownAt).
// onOpenChange(open): the notice or the camera is showing (the kiosk pauses
// its 8 s timeout meanwhile).
export default function PhotoButton({ photoUri, currentPhotoUrl, name, onPhoto, onOpenChange, disabled = false }) {
  const { colors } = useTheme();
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [noticeAt, setNoticeAt] = useState(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const open = noticeOpen || cameraOpen;
  useEffect(() => {
    if (onOpenChange) onOpenChange(open);
  }, [open, onOpenChange]);
  const hasPhoto = !!photoUri || !!currentPhotoUrl;
  const label = photoUri ? "Retake" : currentPhotoUrl ? "Change photo" : "Take photo";

  return (
    <View style={styles.row}>
      {photoUri ? (
        <Image source={{ uri: photoUri }} style={styles.photo} />
      ) : currentPhotoUrl ? (
        <Avatar name={name || ""} photoUrl={currentPhotoUrl} size={88} />
      ) : (
        <View style={[styles.photo, styles.empty, { borderColor: colors.border }]}>
          <Feather name="user" size={34} color={colors.subtext} />
        </View>
      )}
      <TouchableOpacity
        style={[styles.button, hasPhoto ? { borderColor: colors.border, borderWidth: 1 } : { backgroundColor: colors.accent }]}
        onPress={() => setNoticeOpen(true)}
        disabled={disabled}
        accessibilityLabel={label}
      >
        <Feather name="camera" size={16} color={hasPhoto ? colors.accent : "#fff"} />
        <Text style={[styles.buttonText, { color: hasPhoto ? colors.accent : "#fff" }]}>{label}</Text>
      </TouchableOpacity>

      <PhotoNoticeModal
        visible={noticeOpen}
        onAcknowledge={(at) => {
          setNoticeAt(at);
          setNoticeOpen(false);
          setCameraOpen(true);
        }}
      />
      <FullScreenCamera
        visible={cameraOpen}
        onCancel={() => setCameraOpen(false)}
        onUse={(uri) => {
          setCameraOpen(false);
          onPhoto(uri, noticeAt);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 16 },
  photo: { width: 88, height: 88, borderRadius: 44 },
  empty: { borderWidth: 1, borderStyle: "dashed", justifyContent: "center", alignItems: "center" },
  button: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 22, paddingHorizontal: 18, paddingVertical: 11 },
  buttonText: { fontSize: 15, fontWeight: "700" },
});

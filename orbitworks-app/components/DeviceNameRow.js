import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import NetInfo from "@react-native-community/netinfo";
import { doc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../lib/AuthContext";
import { useTheme } from "../lib/ThemeContext";
import { useDeviceDoc } from "../lib/hooks/useDeviceDoc";
import EditDeviceNameModal from "./EditDeviceNameModal";

// Same label/value styling as the "Logged in as" row directly above it
// (see screens/SettingsScreen.js's sectionLabel/email styles) - this is
// deliberately a second stacked label+value pair, not one of the toggle
// `row` elements below it.
export default function DeviceNameRow({ companyId, isPro }) {
  const { currentUser } = useAuth();
  const { colors } = useTheme();
  const { deviceId, device, error } = useDeviceDoc(companyId);
  const [editing, setEditing] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);

  if (!isPro) return null;

  const unavailable = !deviceId || error;
  const locked = !!device?.locked;
  const displayName = unavailable ? "Not named" : device?.name || "Not named";
  const tappable = !unavailable && !locked;

  async function handleSave(trimmedName) {
    if (!companyId || !currentUser || !deviceId) return;

    const deviceRef = doc(db, "companies", companyId, "devices", deviceId);
    // locked is intentionally omitted on create - firestore.rules' create
    // rule only allows name/platform/model/createdByUid/createdAt as keys;
    // a missing locked field reads as falsy everywhere it's checked (both
    // client-side and via resource.data.get('locked', false) in rules).
    const writePromise = device
      ? updateDoc(deviceRef, {
          name: trimmedName,
          updatedAt: serverTimestamp(),
          updatedByUid: currentUser.uid,
        })
      : setDoc(deviceRef, {
          name: trimmedName,
          platform: Platform.OS === "ios" ? "ios" : "android",
          model: "",
          createdByUid: currentUser.uid,
          createdAt: serverTimestamp(),
        });

    const net = await NetInfo.fetch();
    if (!net.isConnected) {
      writePromise.catch((err) => console.log("Device name sync failed:", err));
      setEditing(false);
      setStatusMessage("Saved, will sync when online");
      setTimeout(() => setStatusMessage(null), 3000);
      return;
    }

    try {
      await writePromise;
      setEditing(false);
    } catch (err) {
      console.log("Failed to save device name:", err);
      // Quietly degrade - leave the modal open so the user can retry,
      // never crash the Settings screen over a device-naming failure.
    }
  }

  return (
    <View style={styles.container}>
      <Text style={[styles.sectionLabel, { color: colors.subtext }]}>Device name</Text>
      <TouchableOpacity
        activeOpacity={tappable ? 0.6 : 1}
        onPress={() => tappable && setEditing(true)}
        disabled={!tappable}
        style={styles.valueRow}
      >
        <Text style={[styles.value, { color: colors.text }]}>{displayName}</Text>
        {!unavailable &&
          (locked ? (
            <Feather name="lock" size={15} color={colors.subtext} />
          ) : (
            <Feather name="edit-2" size={15} color={colors.subtext} />
          ))}
      </TouchableOpacity>
      {locked && (
        <Text style={[styles.subtext, { color: colors.subtext }]}>Locked by admin</Text>
      )}
      {statusMessage && (
        <Text style={[styles.subtext, { color: colors.subtext }]}>{statusMessage}</Text>
      )}

      <EditDeviceNameModal
        visible={editing}
        initialName={device?.name ?? ""}
        onSave={handleSave}
        onCancel={() => setEditing(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 24 },
  sectionLabel: { fontSize: 13, marginBottom: 4 },
  valueRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  value: { fontSize: 16, fontWeight: "600" },
  subtext: { fontSize: 12, marginTop: 2 },
});

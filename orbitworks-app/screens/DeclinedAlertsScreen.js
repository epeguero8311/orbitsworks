import { useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../lib/ThemeContext";
import { getDeclinedClockIns, markAllDeclinedRead } from "../lib/declinedClockIns";
import ScreenHeader from "../components/ScreenHeader";

function timeAgo(ms) {
  const seconds = Math.floor((Date.now() - ms) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// Geofencing (Pro) auto site detection - the bell's destination. Lists
// every declined/failed clock-in recorded on this device (see
// lib/declinedClockIns.js) - local only, since a blocked attempt never
// reaches the server at all. Marks everything read on open, which clears
// the Dashboard's badge next time it reads the count.
export default function DeclinedAlertsScreen({ navigation }) {
  const { colors } = useTheme();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDeclinedClockIns()
      .then(setItems)
      .finally(() => setLoading(false));
    markAllDeclinedRead();
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Declined Clock-Ins" onBack={() => navigation.goBack()} />
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={[styles.row, { borderBottomColor: colors.border }]}>
            <View style={[styles.iconCircle, { backgroundColor: colors.red + "22" }]}>
              <Feather name="x" size={16} color={colors.red} />
            </View>
            <View style={styles.rowText}>
              <View style={styles.rowHeader}>
                <Text style={[styles.name, { color: colors.text }]}>{item.employeeName}</Text>
                <Text style={[styles.time, { color: colors.subtext }]}>{timeAgo(item.timestamp)}</Text>
              </View>
              <Text style={[styles.reason, { color: colors.subtext }]}>{item.reason}</Text>
            </View>
          </View>
        )}
        ListEmptyComponent={
          !loading && (
            <Text style={[styles.empty, { color: colors.subtext }]}>
              No declined clock-ins.
            </Text>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { paddingHorizontal: 20, paddingTop: 8 },
  row: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 14, borderBottomWidth: 1, gap: 12 },
  iconCircle: {
    width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", marginTop: 2,
  },
  rowText: { flex: 1 },
  rowHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  name: { fontSize: 15, fontWeight: "600" },
  time: { fontSize: 12 },
  reason: { fontSize: 13, marginTop: 3 },
  empty: { textAlign: "center", marginTop: 40 },
});

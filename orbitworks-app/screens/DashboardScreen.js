import { useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { signOut } from "firebase/auth";
import { auth } from "../lib/firebase";
import { useAuth } from "../lib/AuthContext";
import { useTodayShift } from "../lib/hooks/useTodayShift";

export default function DashboardScreen({ navigation }) {
  const { userData } = useAuth();
  const { employees, sites, loading } = useTodayShift(
    userData?.companyId,
    userData?.assignedSiteIds
  );

  const clockedInCount = employees.filter((e) => e.status === "in").length;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#3b6fe0" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.siteName}>
          {sites.length > 0 ? sites.map((s) => s.name).join(", ") : "No site assigned"}
        </Text>
        <Text style={styles.summary}>
          {clockedInCount} of {employees.length} clocked in
        </Text>
      </View>

      <TouchableOpacity
        style={styles.clockButton}
        onPress={() => navigation.navigate("PinEntry")}
      >
        <Text style={styles.clockButtonText}>Clock In / Out</Text>
      </TouchableOpacity>

      <FlatList
        data={employees}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View
              style={[
                styles.dot,
                { backgroundColor: item.status === "in" ? "#22c55e" : "#d1d5db" },
              ]}
            />
            <View style={styles.rowText}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.jobTitle}>{item.jobTitle}</Text>
            </View>
            <Text style={styles.statusLabel}>
              {item.status === "in" ? "Clocked In" : "Clocked Out"}
            </Text>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>No employees assigned to this site.</Text>
        }
      />

      <TouchableOpacity style={styles.logoutButton} onPress={() => signOut(auth)}>
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  siteName: { fontSize: 22, fontWeight: "700", color: "#111" },
  summary: { fontSize: 14, color: "#666", marginTop: 4 },
  clockButton: {
    backgroundColor: "#3b6fe0",
    marginHorizontal: 20,
    marginTop: 16,
    padding: 16,
    borderRadius: 10,
    alignItems: "center",
  },
  clockButtonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  list: { paddingHorizontal: 20, paddingTop: 16 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f1f1",
  },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  rowText: { flex: 1 },
  name: { fontSize: 16, fontWeight: "600", color: "#111" },
  jobTitle: { fontSize: 13, color: "#888", marginTop: 2 },
  statusLabel: { fontSize: 13, color: "#666" },
  empty: { textAlign: "center", color: "#999", marginTop: 40 },
  logoutButton: {
    padding: 16,
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#eee",
  },
  logoutText: { color: "#ef4444", fontWeight: "600" },
});

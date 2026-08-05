import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Image } from "react-native";
import { useAuth } from "../lib/AuthContext";
import { useTheme } from "../lib/ThemeContext";
import { useTodayShift } from "../lib/hooks/useTodayShift";

export default function DashboardScreen({ navigation }) {
  const { userData, currentUser } = useAuth();
  const { colors } = useTheme();
  const { employees, sites, loading } = useTodayShift(
    userData?.companyId,
    userData?.assignedSiteIds
  );

  const clockedInCount = employees.filter((e) => e.status === "in").length;
  const supervisor = employees.find((e) => e.id === currentUser?.uid);
  const siteLabel =
    sites.length > 0 ? sites.map((s) => s.name).join(", ") : "No site assigned";
  const displayName = supervisor?.name ?? currentUser?.email ?? "";

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.greeting, { color: colors.subtext }]}>
            Welcome back
          </Text>
          <Text style={[styles.name, { color: colors.text }]}>{displayName}</Text>
        </View>

        <TouchableOpacity onPress={() => navigation.navigate("Settings")}>
          {supervisor?.photoUrl ? (
            <Image source={{ uri: supervisor.photoUrl }} style={styles.avatar} />
          ) : (
            <View
              style={[
                styles.avatarPlaceholder,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <Text style={{ color: colors.subtext, fontWeight: "700" }}>
                {displayName.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <View
        style={[
          styles.countCard,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.countNumber, { color: colors.text }]}>
          {clockedInCount}
        </Text>
        <Text style={[styles.countLabel, { color: colors.subtext }]}>
          of {employees.length} clocked in at {siteLabel}
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.clockButton, { backgroundColor: colors.accent }]}
        onPress={() => navigation.navigate("PinEntry")}
      >
        <Text style={styles.clockButtonText}>Clock In / Out</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.findButton, { borderColor: colors.border }]}
        onPress={() => navigation.navigate("EmployeeList")}
      >
        <Text style={[styles.findButtonText, { color: colors.text }]}>
          Find Employee
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 60,
    marginBottom: 28,
  },
  greeting: { fontSize: 13 },
  name: { fontSize: 22, fontWeight: "700", marginTop: 2 },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  countCard: {
    borderRadius: 20,
    borderWidth: 1,
    paddingVertical: 36,
    alignItems: "center",
    marginBottom: 20,
  },
  countNumber: { fontSize: 56, fontWeight: "800" },
  countLabel: {
    fontSize: 14,
    marginTop: 6,
    textAlign: "center",
    paddingHorizontal: 20,
  },
  clockButton: {
    borderRadius: 14,
    paddingVertical: 20,
    alignItems: "center",
    marginBottom: 14,
  },
  clockButtonText: { color: "#fff", fontSize: 18, fontWeight: "700" },
  findButton: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    borderWidth: 1,
  },
  findButtonText: { fontSize: 15, fontWeight: "600" },
});

import { useState } from "react";
import { View, Text, TextInput, FlatList, StyleSheet } from "react-native";
import { useAuth } from "../lib/AuthContext";
import { useTheme } from "../lib/ThemeContext";
import { useTodayShift } from "../lib/hooks/useTodayShift";
import { useLocalStatusOverlay } from "../lib/hooks/useLocalStatusOverlay";
import ScreenHeader from "../components/ScreenHeader";
import Avatar from "../components/Avatar";
const STATUS_LABEL = { in: "In", break: "On Break", out: "Out" };
// Clocked in/on break sort before clocked out - matches
// OverrideEmployeeListScreen's ordering.
const STATUS_SORT_ORDER = { in: 0, break: 0, out: 1 };
export default function EmployeeListScreen({ navigation }) {
  const { userData } = useAuth();
  const { colors } = useTheme();
  const { employees: liveEmployees } = useTodayShift(userData?.companyId);
  const employees = useLocalStatusOverlay(liveEmployees);
  const [search, setSearch] = useState("");
  const filtered = employees
    .filter((e) => e.name?.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => STATUS_SORT_ORDER[a.status] - STATUS_SORT_ORDER[b.status]);
  const dotColor = (status, colors) => {
    if (status === "in") return colors.green;
    if (status === "break") return colors.accent;
    return colors.dotOff;
  };
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Employees" onBack={() => navigation.goBack()} />
      <View style={styles.searchWrap}>
        <TextInput
          style={[styles.search, { borderColor: colors.border, color: colors.text, backgroundColor: colors.card }]}
          placeholder="Search by name"
          placeholderTextColor={colors.subtext}
          value={search}
          onChangeText={setSearch}
        />
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={[styles.row, { borderBottomColor: colors.border }]}>
            <Avatar name={item.name} photoUrl={item.photoUrl} size={42} />
            <View style={styles.rowText}>
              <Text style={[styles.name, { color: colors.text }]}>{item.name}</Text>
              <Text style={[styles.jobTitle, { color: colors.subtext }]}>{item.jobTitle}</Text>
            </View>
            <View style={styles.statusWrap}>
              <View style={[styles.dot, { backgroundColor: dotColor(item.status, colors) }]} />
              <Text style={[styles.statusLabel, { color: colors.subtext }]}>
                {STATUS_LABEL[item.status] ?? "Out"}
              </Text>
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={[styles.empty, { color: colors.subtext }]}>No employees found.</Text>}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1 },
  searchWrap: { paddingHorizontal: 20, paddingTop: 16 },
  search: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15 },
  list: { paddingHorizontal: 20, paddingTop: 8 },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, gap: 12 },
  rowText: { flex: 1 },
  name: { fontSize: 16, fontWeight: "600" },
  jobTitle: { fontSize: 13, marginTop: 2 },
  statusWrap: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusLabel: { fontSize: 13 },
  empty: { textAlign: "center", marginTop: 40 },
});

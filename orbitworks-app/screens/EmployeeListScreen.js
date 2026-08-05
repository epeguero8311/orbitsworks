import { useState } from "react";
import { View, Text, TextInput, FlatList, StyleSheet } from "react-native";
import { useAuth } from "../lib/AuthContext";
import { useTheme } from "../lib/ThemeContext";
import { useTodayShift } from "../lib/hooks/useTodayShift";
import ScreenHeader from "../components/ScreenHeader";

export default function EmployeeListScreen({ navigation }) {
  const { userData } = useAuth();
  const { colors } = useTheme();
  const { employees } = useTodayShift(
    userData?.companyId,
    userData?.assignedSiteIds
  );
  const [search, setSearch] = useState("");

  const filtered = employees.filter((e) =>
    e.name?.toLowerCase().includes(search.trim().toLowerCase())
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Employees" onBack={() => navigation.goBack()} />

      <View style={styles.searchWrap}>
        <TextInput
          style={[
            styles.search,
            { borderColor: colors.border, color: colors.text, backgroundColor: colors.card },
          ]}
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
            <View
              style={[
                styles.dot,
                { backgroundColor: item.status === "in" ? colors.green : colors.dotOff },
              ]}
            />
            <View style={styles.rowText}>
              <Text style={[styles.name, { color: colors.text }]}>{item.name}</Text>
              <Text style={[styles.jobTitle, { color: colors.subtext }]}>
                {item.jobTitle}
              </Text>
            </View>
            <Text style={[styles.statusLabel, { color: colors.subtext }]}>
              {item.status === "in" ? "Clocked In" : "Clocked Out"}
            </Text>
          </View>
        )}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: colors.subtext }]}>
            No employees found.
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchWrap: { paddingHorizontal: 20, paddingTop: 16 },
  search: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
  },
  list: { paddingHorizontal: 20, paddingTop: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  rowText: { flex: 1 },
  name: { fontSize: 16, fontWeight: "600" },
  jobTitle: { fontSize: 13, marginTop: 2 },
  statusLabel: { fontSize: 13 },
  empty: { textAlign: "center", marginTop: 40 },
});

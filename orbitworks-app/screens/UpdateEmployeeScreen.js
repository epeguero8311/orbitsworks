import { useEffect, useState } from "react";
import { View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet } from "react-native";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../lib/AuthContext";
import { useTheme } from "../lib/ThemeContext";
import ScreenHeader from "../components/ScreenHeader";
import Avatar from "../components/Avatar";

// Update Employee (mobile) - lists ACTIVE employees only (same active==true
// scoping every other "pick an employee" list in this app uses - see
// EmployeeListScreen.js), with a search bar over a FlatList, same pattern.
// Employees with an open faceBadReference alert are pinned to the top with
// a "Needs photo" tag - a single query filtered to that one alert type
// (not a full alerts feed subscription) keeps this cheap and live.
export default function UpdateEmployeeScreen({ navigation }) {
  const { userData } = useAuth();
  const { colors } = useTheme();
  const [employees, setEmployees] = useState([]);
  const [badReferenceIds, setBadReferenceIds] = useState(new Set());
  const [search, setSearch] = useState("");

  useEffect(() => {
    const companyId = userData?.companyId;
    if (!companyId) return;

    const employeesRef = collection(db, "companies", companyId, "employees");
    const employeesQuery = query(employeesRef, where("active", "==", true));
    const unsubEmployees = onSnapshot(
      employeesQuery,
      (snap) => setEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (error) => console.log("[UpdateEmployeeScreen] employees listener error:", error.code, error.message)
    );

    const alertsRef = collection(db, "companies", companyId, "alerts");
    const badReferenceQuery = query(alertsRef, where("alertType", "==", "faceBadReference"));
    const unsubAlerts = onSnapshot(
      badReferenceQuery,
      (snap) => setBadReferenceIds(new Set(snap.docs.map((d) => d.data().employeeId).filter(Boolean))),
      (error) => console.log("[UpdateEmployeeScreen] alerts listener error:", error.code, error.message)
    );

    return () => {
      unsubEmployees();
      unsubAlerts();
    };
  }, [userData?.companyId]);

  const filtered = employees
    .filter((e) => e.name?.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => {
      const aNeedsPhoto = badReferenceIds.has(a.id) ? 0 : 1;
      const bNeedsPhoto = badReferenceIds.has(b.id) ? 0 : 1;
      if (aNeedsPhoto !== bNeedsPhoto) return aNeedsPhoto - bNeedsPhoto;
      return (a.name || "").localeCompare(b.name || "");
    });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Update Employee" onBack={() => navigation.goBack()} />
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
          <TouchableOpacity
            style={[styles.row, { borderBottomColor: colors.border }]}
            onPress={() => navigation.navigate("EditEmployee", { employee: item })}
          >
            <Avatar name={item.name} photoUrl={item.photoUrl} size={42} />
            <View style={styles.rowText}>
              <Text style={[styles.name, { color: colors.text }]}>{item.name}</Text>
              {item.jobTitle ? (
                <Text style={[styles.jobTitle, { color: colors.subtext }]}>{item.jobTitle}</Text>
              ) : null}
            </View>
            {badReferenceIds.has(item.id) && (
              <View style={[styles.tag, { backgroundColor: colors.red }]}>
                <Text style={styles.tagText}>Needs photo</Text>
              </View>
            )}
          </TouchableOpacity>
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
  tag: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  tagText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  empty: { textAlign: "center", marginTop: 40 },
});

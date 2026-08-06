import { View, Text, TouchableOpacity, StyleSheet, FlatList } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "../lib/AuthContext";
import { useTheme } from "../lib/ThemeContext";
import { useSiteSession } from "../lib/SiteSessionContext";
import { useTodayShift } from "../lib/hooks/useTodayShift";
import ScreenHeader from "../components/ScreenHeader";

export default function SiteSelectScreen({ navigation, route }) {
  const { userData } = useAuth();
  const { colors } = useTheme();
  const { selectedSite, setSelectedSite } = useSiteSession();
  const { sites } = useTodayShift(userData?.companyId);
  const afterSelect = route?.params?.afterSelect;

  const options = [
    { id: null, name: "All Sites" },
    ...sites,
    { id: "none", name: "No Site" },
  ];

  const handlePick = (site) => {
    setSelectedSite(site.id === null ? null : { id: site.id, name: site.name });
    if (afterSelect) {
      navigation.replace(afterSelect);
    } else {
      navigation.goBack();
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Select Job Site" onBack={() => navigation.goBack()} />
      <FlatList
        data={options}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const isActive =
            (item.id === null && !selectedSite) ||
            (item.id !== null && selectedSite?.id === item.id);
          return (
            <TouchableOpacity
              style={[styles.row, { backgroundColor: colors.card, borderColor: isActive ? colors.accent : colors.border }]}
              onPress={() => handlePick(item)}
            >
              <Text style={[styles.name, { color: colors.text }]}>{item.name}</Text>
              {isActive ? (
                <Feather name="check" size={20} color={colors.accent} />
              ) : (
                <Feather name="chevron-right" size={20} color={colors.subtext} />
              )}
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: 20 },
  row: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    padding: 18, borderRadius: 14, borderWidth: 1.5, marginBottom: 12,
  },
  name: { fontSize: 16, fontWeight: "600" },
});

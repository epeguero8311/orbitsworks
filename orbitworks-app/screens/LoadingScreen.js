import { View, ActivityIndicator, StyleSheet } from "react-native";
import Logo from "../components/Logo";

export default function LoadingScreen() {
  return (
    <View style={styles.container}>
      <Logo size={72} />
      <ActivityIndicator size="small" color="#ffffff" style={{ marginTop: 28 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#3b6fe0",
  },
});

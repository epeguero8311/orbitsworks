import { View, Text, StyleSheet } from "react-native";

// Shown instead of the whole app when lib/envGuard.js finds this build
// pointed at the wrong Firebase project. No Firebase, no Sentry, no
// navigation - nothing here talks to a server.
export default function WrongEnvironmentScreen({ reason }) {
  return (
    <View style={styles.root}>
      <Text style={styles.title}>Wrong environment</Text>
      <Text style={styles.body}>
        This build of OrbitsWorks is connected to the wrong server, so it has been stopped. Nothing was sent.
        Please contact the OrbitsWorks team.
      </Text>
      <Text style={styles.code}>Code: {reason}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, backgroundColor: "#b91c1c" },
  title: { color: "#ffffff", fontSize: 24, fontWeight: "700", marginBottom: 12 },
  body: { color: "#ffffff", fontSize: 16, textAlign: "center", lineHeight: 22 },
  code: { color: "#fecaca", fontSize: 13, marginTop: 20 },
});

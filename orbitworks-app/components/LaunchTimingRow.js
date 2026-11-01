import { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import * as Updates from "expo-updates";
import { useTheme } from "../lib/ThemeContext";
import { getLaunchSummary, subscribeLaunchSummary } from "../lib/launchTiming";

// This launch's timing (lib/launchTiming.js), so it can be read on a phone
// during testing. Only on TestFlight (channel "testflight") and dev builds -
// App Store builds never show it.
const SHOW = __DEV__ || Updates.channel === "testflight";

const sec = (ms) => (ms == null ? "-" : `${(ms / 1000).toFixed(1)}s`);

export default function LaunchTimingRow() {
  const { colors } = useTheme();
  const [summary, setSummary] = useState(getLaunchSummary());

  useEffect(() => {
    if (!SHOW) return undefined;
    return subscribeLaunchSummary(setSummary);
  }, []);

  if (!SHOW) return null;

  const lines = summary
    ? [
        `Splash gone: ${sec(summary.splashHidden)}  (sign-in ${sec(summary.authReady)})`,
        `Home data: ${sec(summary.homeData)}  alerts: ${sec(summary.alertsLoaded)}`,
        `Longest JS stall after splash: ${summary.maxJsBlockAfterSplashMs} ms (overall ${summary.maxJsBlockMs} ms)`,
        `Loaded: ${summary.windowEvents ?? "-"} events, ${summary.latestQueries ?? "-"} per-employee, ${summary.alerts ?? "-"} alerts`,
      ]
    : ["Measuring..."];

  return (
    <View style={[styles.box, { borderColor: colors.border }]}>
      <Text style={[styles.title, { color: colors.subtext }]}>Launch timing (TestFlight only)</Text>
      {lines.map((line) => (
        <Text key={line} style={[styles.line, { color: colors.text }]}>
          {line}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderTopWidth: 1, paddingVertical: 14 },
  title: { fontSize: 13, marginBottom: 6 },
  line: { fontSize: 13, marginTop: 2 },
});

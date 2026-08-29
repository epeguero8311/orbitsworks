import { useEffect, useState, useCallback } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { AuthProvider, useAuth } from "./lib/AuthContext";
import { ThemeProvider, useTheme } from "./lib/ThemeContext";
import { SiteSessionProvider } from "./lib/SiteSessionContext";
import { usePinTableSync } from "./lib/hooks/usePinTableSync";
import { useQueueSync } from "./lib/hooks/useQueueSync";
import LoginScreen from "./screens/LoginScreen";
import ForgotPasswordScreen from "./screens/ForgotPasswordScreen";
import AccountDisabledScreen from "./screens/AccountDisabledScreen";
import LoadingScreen from "./screens/LoadingScreen";
import DashboardScreen from "./screens/DashboardScreen";
import SettingsScreen from "./screens/SettingsScreen";
import EmployeeListScreen from "./screens/EmployeeListScreen";
import SiteSelectScreen from "./screens/SiteSelectScreen";
import NotesScreen from "./screens/NotesScreen";
import PinEntryScreen from "./screens/PinEntryScreen";
import ClockCameraScreen from "./screens/ClockCameraScreen";
import ClockConfirmScreen from "./screens/ClockConfirmScreen";
import BreaksPinEntryScreen from "./screens/BreaksPinEntryScreen";
import BreaksEmployeeListScreen from "./screens/BreaksEmployeeListScreen";
import OverridePinEntryScreen from "./screens/OverridePinEntryScreen";
import OverrideEmployeeListScreen from "./screens/OverrideEmployeeListScreen";

// Keep the native splash up until we explicitly hide it below - without
// this, Expo auto-hides it the instant JS mounts, which is why it was
// never visible before (LoadingScreen's identical blue took over so
// fast it read as one continuous screen).
SplashScreen.preventAutoHideAsync().catch(() => {});

const Stack = createNativeStackNavigator();

function RootNavigator() {
  const { currentUser, loading, accountDisabled } = useAuth();
  const { isDark } = useTheme();
  const [splashAnimationDone, setSplashAnimationDone] = useState(false);
  usePinTableSync();
  useQueueSync();

  const onNativeSplashHandoff = useCallback(() => {
    // Native splash and our JS splash are the same solid blue, so
    // hiding the native one right as our animated splash mounts is
    // invisible to the user - no flash, no gap.
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  useEffect(() => {
    onNativeSplashHandoff();
  }, [onNativeSplashHandoff]);

  if (!splashAnimationDone) {
    return <LoadingScreen ready={!loading} onFinish={() => setSplashAnimationDone(true)} />;
  }

  return (
    <NavigationContainer>
      <StatusBar style={isDark ? "light" : "dark"} />
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {currentUser && accountDisabled ? (
          <Stack.Screen name="AccountDisabled" component={AccountDisabledScreen} />
        ) : currentUser ? (
          <>
            <Stack.Screen name="Dashboard" component={DashboardScreen} options={{ freezeOnBlur: false }} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
            <Stack.Screen name="EmployeeList" component={EmployeeListScreen} />
            <Stack.Screen name="SiteSelect" component={SiteSelectScreen} />
            <Stack.Screen name="Notes" component={NotesScreen} />
            <Stack.Screen name="PinEntry" component={PinEntryScreen} />
            <Stack.Screen name="ClockCamera" component={ClockCameraScreen} />
            <Stack.Screen name="ClockConfirm" component={ClockConfirmScreen} />
            <Stack.Screen name="BreaksPinEntry" component={BreaksPinEntryScreen} />
            <Stack.Screen name="BreaksEmployeeList" component={BreaksEmployeeListScreen} />
            <Stack.Screen name="OverridePinEntry" component={OverridePinEntryScreen} />
            <Stack.Screen name="OverrideEmployeeList" component={OverrideEmployeeListScreen} />
          </>
        ) : (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <SiteSessionProvider>
          <RootNavigator />
        </SiteSessionProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
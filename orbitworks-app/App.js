import { useEffect, useState, useCallback } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { AuthProvider, useAuth } from "./lib/AuthContext";
import { ThemeProvider, useTheme } from "./lib/ThemeContext";
import { SiteSessionProvider } from "./lib/SiteSessionContext";
import { usePinTableSync } from "./lib/hooks/usePinTableSync";
import { useQueueSync } from "./lib/hooks/useQueueSync";
import { useEmployeeQueueSync } from "./lib/hooks/useEmployeeQueueSync";
import { useEmployeeUpdateQueueSync } from "./lib/hooks/useEmployeeUpdateQueueSync";
import { useQueuePendingCount } from "./lib/hooks/useQueuePendingCount";
import { usePushRegistration } from "./lib/hooks/usePushRegistration";
import { useAlertsFeed } from "./lib/hooks/useAlertsFeed";
import { navigationRef } from "./lib/navigationRef";
import FloatingTabBar from "./components/FloatingTabBar";
import LoginScreen from "./screens/LoginScreen";
import ForgotPasswordScreen from "./screens/ForgotPasswordScreen";
import AccountDisabledScreen from "./screens/AccountDisabledScreen";
import LoadingScreen from "./screens/LoadingScreen";
import DashboardScreen from "./screens/supervisor/DashboardScreen";
import AlertsScreen from "./screens/supervisor/AlertsScreen";
import SyncQueueScreen from "./screens/supervisor/SyncQueueScreen";
import SettingsScreen from "./screens/supervisor/SettingsScreen";
import EmployeeListScreen from "./screens/supervisor/EmployeeListScreen";
import SiteSelectScreen from "./screens/supervisor/SiteSelectScreen";
import NotesScreen from "./screens/supervisor/NotesScreen";
import PinEntryScreen from "./screens/supervisor/PinEntryScreen";
import ClockCameraScreen from "./screens/supervisor/ClockCameraScreen";
import ClockConfirmScreen from "./screens/supervisor/ClockConfirmScreen";
import ClockDeclinedScreen from "./screens/supervisor/ClockDeclinedScreen";
import DeclinedAlertsScreen from "./screens/supervisor/DeclinedAlertsScreen";
import BreaksPinEntryScreen from "./screens/supervisor/BreaksPinEntryScreen";
import BreaksEmployeeListScreen from "./screens/supervisor/BreaksEmployeeListScreen";
import OverridePinEntryScreen from "./screens/supervisor/OverridePinEntryScreen";
import OverrideEmployeeListScreen from "./screens/supervisor/OverrideEmployeeListScreen";
import OverrideReasonScreen from "./screens/supervisor/OverrideReasonScreen";
import CreateEmployeeScreen from "./screens/supervisor/CreateEmployeeScreen";
import UpdateEmployeeScreen from "./screens/supervisor/UpdateEmployeeScreen";
import EditEmployeeScreen from "./screens/supervisor/EditEmployeeScreen";
import EmployeeSyncAlertsScreen from "./screens/supervisor/EmployeeSyncAlertsScreen";
import EmployeeHomeScreen from "./screens/EmployeeHomeScreen";
import ClockPunchScreen from "./screens/ClockPunchScreen";
import EmployeeAlertsScreen from "./screens/employee/EmployeeAlertsScreen";
import EmployeeSyncScreen from "./screens/employee/EmployeeSyncScreen";
import EmployeeSettingsScreen from "./screens/employee/EmployeeSettingsScreen";
import EmployeeHistoryScreen from "./screens/employee/EmployeeHistoryScreen";
import EmployeeHistoryDayScreen from "./screens/employee/EmployeeHistoryDayScreen";
import JoinScanScreen from "./screens/JoinScanScreen";
import JoinStartScreen from "./screens/JoinStartScreen";
import { useJoinLink } from "./lib/hooks/useJoinLink";
import { redactJoinTokens } from "./lib/joinLink";
import { scrubSensitive } from "./lib/sentryScrub";
import { resolveFirebaseEnv } from "./config/envRules";
import * as Sentry from '@sentry/react-native';

// Sentry "environment": "production" only when this bundle talks to the
// real Firebase project; the dev app (and any dev-Firebase build) is "dev".
const SENTRY_ENVIRONMENT = resolveFirebaseEnv(process.env.EXPO_PUBLIC_FIREBASE_ENV) === "prod" ? "production" : "dev";

// Crew code tokens are secrets: blank any /j/{token} before anything
// reaches Sentry (breadcrumbs, URLs, messages, exceptions).
function scrubJoinTokens(item) {
  try {
    return JSON.parse(redactJoinTokens(JSON.stringify(item)));
  } catch {
    return item;
  }
}

Sentry.init({
  dsn: 'https://f796828c3aaf68527b01e471a0aa9404@o4512133013176320.ingest.us.sentry.io/4512133093261312',

  environment: SENTRY_ENVIRONMENT,

  // Join tokens always; the sign-up email/password/birthday and the new
  // PIN while the sign-up screen has them (lib/sentryScrub.js).
  beforeBreadcrumb: (breadcrumb) => scrubSensitive(scrubJoinTokens(breadcrumb)),
  beforeSend: (event) => scrubSensitive(scrubJoinTokens(event)),

  // Adds more context data to events (IP address, cookies, user, etc.)
  // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
  sendDefaultPii: true,

  // Enable Logs
  enableLogs: false,

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
});

// Keep the native splash up until we explicitly hide it below - without
// this, Expo auto-hides it the instant JS mounts, which is why it was
// never visible before (LoadingScreen's identical blue took over so
// fast it read as one continuous screen).
SplashScreen.preventAutoHideAsync().catch(() => {});

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function MainTabs() {
  const pendingCount = useQueuePendingCount();
  const { unreadCount } = useAlertsFeed();

  return (
    <Tab.Navigator
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Home" component={DashboardScreen} />
      <Tab.Screen
        name="Alerts"
        component={AlertsScreen}
        options={{ tabBarBadge: unreadCount > 0 ? unreadCount : undefined }}
      />
      <Tab.Screen
        name="SyncQueue"
        component={SyncQueueScreen}
        options={{ tabBarLabel: "Sync Queue", tabBarBadge: pendingCount > 0 ? pendingCount : undefined }}
      />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

// Employee App tabs: Home plus four "Coming soon" tabs (Settings also
// holds Log out). Clock in/out (ClockPunch) stays a full-screen stack
// step on top of these.
const EmployeeTab = createBottomTabNavigator();
const EMPLOYEE_TAB_ICONS = {
  EmployeeHome: "home",
  EmployeeHistory: "clock",
  EmployeeAlerts: "bell",
  EmployeeSync: "repeat",
  EmployeeSettings: "settings",
};

const EmployeeHistoryStack = createNativeStackNavigator();

// History tab: the list with each day's detail pushed on top, inside the
// tab, so the bottom nav stays up and back returns to the list.
function EmployeeHistoryTab() {
  const { colors } = useTheme();
  return (
    <EmployeeHistoryStack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <EmployeeHistoryStack.Screen name="EmployeeHistoryList" component={EmployeeHistoryScreen} />
      <EmployeeHistoryStack.Screen name="EmployeeHistoryDay" component={EmployeeHistoryDayScreen} />
    </EmployeeHistoryStack.Navigator>
  );
}

function EmployeeTabs() {
  const { colors } = useTheme();
  return (
    <EmployeeTab.Navigator
      tabBar={(props) => (
        <FloatingTabBar
          {...props}
          icons={EMPLOYEE_TAB_ICONS}
          barColor={colors.accent}
          activeColor="rgba(255,255,255,0.22)"
          inactiveIconColor="rgba(255,255,255,0.8)"
        />
      )}
      screenOptions={{ headerShown: false }}
    >
      <EmployeeTab.Screen name="EmployeeHome" component={EmployeeHomeScreen} options={{ tabBarLabel: "Home" }} />
      <EmployeeTab.Screen name="EmployeeHistory" component={EmployeeHistoryTab} options={{ tabBarLabel: "History" }} />
      <EmployeeTab.Screen name="EmployeeAlerts" component={EmployeeAlertsScreen} options={{ tabBarLabel: "Alerts" }} />
      <EmployeeTab.Screen name="EmployeeSync" component={EmployeeSyncScreen} options={{ tabBarLabel: "Sync" }} />
      <EmployeeTab.Screen name="EmployeeSettings" component={EmployeeSettingsScreen} options={{ tabBarLabel: "Settings" }} />
    </EmployeeTab.Navigator>
  );
}

// Supervisor/admin background work (PIN table, offline clock/employee
// queues, push registration). Never mounted for an Employee App login -
// those calls are supervisor-only server-side and would just fail, and an
// employee must never register a push token for company-wide alerts. Each
// hook already no-ops until userData.companyId is known, same as when it
// lived directly in RootNavigator.
function SupervisorBackgroundSync() {
  usePinTableSync();
  useQueueSync();
  useEmployeeQueueSync();
  useEmployeeUpdateQueueSync();
  usePushRegistration();
  return null;
}

function RootNavigator() {
  const { currentUser, userData, loading, accountDisabled } = useAuth();
  const { isDark } = useTheme();
  const [splashAnimationDone, setSplashAnimationDone] = useState(false);
  const [navReady, setNavReady] = useState(false);
  // AuthContext sets currentUser and userData in the same render, so an
  // Employee App login never mounts a supervisor screen even for one frame.
  const isEmployeeLogin = userData?.role === "employee";
  const backgroundSync = isEmployeeLogin ? null : <SupervisorBackgroundSync />;
  useJoinLink({ loggedIn: !!currentUser, navReady: navReady && splashAnimationDone });

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
    return (
      <>
        {backgroundSync}
        <LoadingScreen ready={!loading} onFinish={() => setSplashAnimationDone(true)} />
      </>
    );
  }

  return (
    <NavigationContainer ref={navigationRef} onReady={() => setNavReady(true)}>
      {backgroundSync}
      <StatusBar style={isDark ? "light" : "dark"} />
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {currentUser && accountDisabled ? (
          <Stack.Screen name="AccountDisabled" component={AccountDisabledScreen} />
        ) : currentUser && isEmployeeLogin ? (
          // Employee App: Home + clock in/out only, no supervisor screens.
          <>
            <Stack.Screen name="EmployeeTabs" component={EmployeeTabs} />
            <Stack.Screen name="ClockPunch" component={ClockPunchScreen} options={{ gestureEnabled: false }} />
          </>
        ) : currentUser ? (
          <>
            <Stack.Screen name="MainTabs" component={MainTabs} options={{ freezeOnBlur: false }} />
            <Stack.Screen name="EmployeeList" component={EmployeeListScreen} />
            <Stack.Screen name="SiteSelect" component={SiteSelectScreen} />
            <Stack.Screen name="Notes" component={NotesScreen} />
            <Stack.Screen name="PinEntry" component={PinEntryScreen} />
            <Stack.Screen name="ClockCamera" component={ClockCameraScreen} />
            <Stack.Screen name="ClockConfirm" component={ClockConfirmScreen} />
            <Stack.Screen name="ClockDeclined" component={ClockDeclinedScreen} />
            <Stack.Screen name="DeclinedAlerts" component={DeclinedAlertsScreen} />
            <Stack.Screen name="BreaksPinEntry" component={BreaksPinEntryScreen} />
            <Stack.Screen name="BreaksEmployeeList" component={BreaksEmployeeListScreen} />
            <Stack.Screen name="OverridePinEntry" component={OverridePinEntryScreen} />
            <Stack.Screen name="OverrideEmployeeList" component={OverrideEmployeeListScreen} />
            <Stack.Screen name="OverrideReason" component={OverrideReasonScreen} />
            <Stack.Screen name="CreateEmployee" component={CreateEmployeeScreen} />
            <Stack.Screen name="UpdateEmployee" component={UpdateEmployeeScreen} />
            <Stack.Screen name="EditEmployee" component={EditEmployeeScreen} />
            <Stack.Screen name="EmployeeSyncAlerts" component={EmployeeSyncAlertsScreen} />
          </>
        ) : (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
            <Stack.Screen name="JoinScan" component={JoinScanScreen} />
            <Stack.Screen name="JoinStart" component={JoinStartScreen} options={{ gestureEnabled: false }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default Sentry.wrap(function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <SiteSessionProvider>
            <RootNavigator />
          </SiteSessionProvider>
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
});
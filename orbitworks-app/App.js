// First import on purpose: its load time is "JS start" for launch timing.
import { markLaunch } from "./lib/launchTiming";
import { useEffect, useState, useCallback } from "react";
import { BackHandler } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import * as ScreenOrientation from "expo-screen-orientation";
import * as Device from "expo-device";
import { shouldLockPortrait } from "./lib/tabletLayout";
import { withMaxWidth } from "./components/MaxWidth";
import UpdateBanner from "./components/UpdateBanner";
import { useReportAppVersion } from "./lib/hooks/useReportAppVersion";
import { AuthProvider, useAuth } from "./lib/AuthContext";
import { ThemeProvider, useTheme } from "./lib/ThemeContext";
import { SiteSessionProvider } from "./lib/SiteSessionContext";
import { TodayShiftProvider } from "./lib/hooks/useTodayShift";
import { usePinTableSync } from "./lib/hooks/usePinTableSync";
import { useQueueSync } from "./lib/hooks/useQueueSync";
import { useEmployeeQueueSync } from "./lib/hooks/useEmployeeQueueSync";
import { useEmployeeUpdateQueueSync } from "./lib/hooks/useEmployeeUpdateQueueSync";
import { useQueuePendingCount } from "./lib/hooks/useQueuePendingCount";
import { usePushRegistration } from "./lib/hooks/usePushRegistration";
import { useAlertsFeed } from "./lib/hooks/useAlertsFeed";
import { usePunchQueue } from "./lib/hooks/usePunchQueue";
import { useCommentQueue } from "./lib/hooks/useCommentQueue";
import { usePunchQueueSync } from "./lib/hooks/usePunchQueueSync";
import { usePinVerifierSync } from "./lib/hooks/usePinVerifierSync";
import { useEmployeePush } from "./lib/hooks/useEmployeePush";
import { navigationRef } from "./lib/navigationRef";
import FloatingTabBar from "./components/FloatingTabBar";
import LoginScreen from "./screens/LoginScreen";
import ForgotPasswordScreen from "./screens/ForgotPasswordScreen";
import AccountDisabledScreen from "./screens/AccountDisabledScreen";
import WebsiteOnlyScreen from "./screens/WebsiteOnlyScreen";
import LoadingScreen from "./screens/LoadingScreen";
import RoleUpdating from "./components/RoleUpdating";
import ConfirmModal from "./components/ui/ConfirmModal";
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
import ShiftCommentsScreen from "./screens/employee/ShiftCommentsScreen";
import AlwaysLocationScreen from "./screens/employee/AlwaysLocationScreen";
import JoinScanScreen from "./screens/JoinScanScreen";
import KioskHomeScreen from "./screens/kiosk/KioskHomeScreen";
import KioskActionScreen from "./screens/kiosk/KioskActionScreen";
import KioskCameraScreen from "./screens/kiosk/KioskCameraScreen";
import KioskBreakScreen from "./screens/kiosk/KioskBreakScreen";
import KioskDoneScreen from "./screens/kiosk/KioskDoneScreen";
import KioskUnlockScreen from "./screens/kiosk/KioskUnlockScreen";
import KioskSettingsScreen from "./screens/kiosk/KioskSettingsScreen";
import { KioskProvider } from "./lib/hooks/useKiosk";
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

// Task 7 (L1): phones stay portrait; tablets (iPad, Split View) may rotate.
// app.json orientation is "default", so this lock is what keeps a phone
// upright - done at start, before the first screen.
if (shouldLockPortrait(Device.deviceType, Device.DeviceType)) {
  ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
}

// Task 7: these screens keep a centered max width on a tablet (no effect
// on a phone). Not the cameras or the full-color confirmation screens.
const W = {
  Alerts: withMaxWidth(AlertsScreen),
  SyncQueue: withMaxWidth(SyncQueueScreen),
  Settings: withMaxWidth(SettingsScreen),
  EmployeeList: withMaxWidth(EmployeeListScreen),
  SiteSelect: withMaxWidth(SiteSelectScreen),
  Notes: withMaxWidth(NotesScreen),
  PinEntry: withMaxWidth(PinEntryScreen),
  DeclinedAlerts: withMaxWidth(DeclinedAlertsScreen),
  BreaksPinEntry: withMaxWidth(BreaksPinEntryScreen),
  BreaksEmployeeList: withMaxWidth(BreaksEmployeeListScreen),
  OverridePinEntry: withMaxWidth(OverridePinEntryScreen),
  OverrideEmployeeList: withMaxWidth(OverrideEmployeeListScreen),
  OverrideReason: withMaxWidth(OverrideReasonScreen),
  CreateEmployee: withMaxWidth(CreateEmployeeScreen),
  UpdateEmployee: withMaxWidth(UpdateEmployeeScreen),
  EditEmployee: withMaxWidth(EditEmployeeScreen),
  EmployeeSyncAlerts: withMaxWidth(EmployeeSyncAlertsScreen),
  KioskAction: withMaxWidth(KioskActionScreen),
  KioskBreak: withMaxWidth(KioskBreakScreen),
  KioskUnlock: withMaxWidth(KioskUnlockScreen),
};

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
        component={W.Alerts}
        options={{ tabBarBadge: unreadCount > 0 ? unreadCount : undefined }}
      />
      <Tab.Screen
        name="SyncQueue"
        component={W.SyncQueue}
        options={{ tabBarLabel: "Sync Queue", tabBarBadge: pendingCount > 0 ? pendingCount : undefined }}
      />
      <Tab.Screen name="Settings" component={W.Settings} />
    </Tab.Navigator>
  );
}

// Employee App tabs: Home, History, Alerts, Sync and Settings (which also
// holds Log out). Clock in/out (ClockPunch) stays a full-screen stack
// step on top of these. Phase 4: these tabs stay mounted for the whole
// employee login, so this is where the phone keeps sending saved punches
// (usePunchQueueSync) and the Sync tab badge counts Waiting + Syncing +
// Failed.
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
  const { userData, linkedEmployeeId } = useAuth();
  const companyId = userData?.companyId;
  const employeeId = linkedEmployeeId || userData?.employeeId;
  usePunchQueueSync(companyId, employeeId);
  usePinVerifierSync(companyId, employeeId);
  // Phase 7: this phone's push token for the employee + tap opens Alerts.
  useEmployeePush(employeeId);
  const { badge: punchBadge } = usePunchQueue(companyId, employeeId);
  // Phase 5: Not synced / waiting comments count on the Sync tab too.
  const { badge: commentBadge } = useCommentQueue(companyId, employeeId);
  const badge = punchBadge + commentBadge;
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
      <EmployeeTab.Screen
        name="EmployeeSync"
        component={EmployeeSyncScreen}
        options={{ tabBarLabel: "Sync", tabBarBadge: badge > 0 ? badge : undefined }}
      />
      <EmployeeTab.Screen name="EmployeeSettings" component={EmployeeSettingsScreen} options={{ tabBarLabel: "Settings" }} />
    </EmployeeTab.Navigator>
  );
}

// Task 5 Kiosk mode (shared wall iPad): its own small stack - Home (PIN
// pad), the punch steps, and Kiosk Settings behind an admin PIN / exit key.
// No supervisor or employee screens, no Log out. KioskProvider keeps the
// PIN table and the kiosk's saved punches going the whole time.
const KioskStack = createNativeStackNavigator();

function KioskRoot() {
  const { colors } = useTheme();
  // Android hardware back does nothing anywhere in Kiosk mode: not out of the
  // app from Home, not back past a punch step. Every screen has its own Back /
  // Done button, and the only way out is Kiosk Settings (admin PIN or exit
  // key). Added after NavigationContainer's own listener, so it runs first
  // and stops it. Dialogs (RN Modal) still close on back via onRequestClose -
  // that's a Cancel, never an exit. gestureEnabled: false is the iOS half.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => sub.remove();
  }, []);
  return (
    <KioskProvider>
      <KioskStack.Navigator screenOptions={{ headerShown: false, gestureEnabled: false, contentStyle: { backgroundColor: colors.background } }}>
        <KioskStack.Screen name="KioskHome" component={KioskHomeScreen} />
        <KioskStack.Screen name="KioskAction" component={W.KioskAction} />
        <KioskStack.Screen name="KioskCamera" component={KioskCameraScreen} />
        <KioskStack.Screen name="KioskBreak" component={W.KioskBreak} />
        <KioskStack.Screen name="KioskDone" component={KioskDoneScreen} options={{ animation: "fade" }} />
        <KioskStack.Screen name="KioskUnlock" component={W.KioskUnlock} />
        <KioskStack.Screen name="KioskSettings" component={KioskSettingsScreen} />
        {/* Task 5 v2 (5): Create account = the supervisor Create Employee screen in kiosk mode. */}
        <KioskStack.Screen name="KioskCreateAccount" component={W.CreateEmployee} />
      </KioskStack.Navigator>
    </KioskProvider>
  );
}

// Supervisor/admin background work (PIN table, offline clock/employee
// queues, push registration). Never mounted for an Employee App login -
// those calls are supervisor-only server-side and would just fail, and an
// employee must never register a push token for company-wide alerts. Each
// hook already no-ops until userData.companyId is known, same as when it
// lived directly in RootNavigator.
function SupervisorBackgroundSync() {
  const { userData, linkedEmployeeId } = useAuth();
  usePinTableSync();
  useQueueSync();
  useEmployeeQueueSync();
  useEmployeeUpdateQueueSync();
  usePushRegistration();
  // RC1 C: own Employee App punches saved before a promotion keep sending
  // (punches only; a no-op when there are none).
  usePunchQueueSync(userData?.companyId, linkedEmployeeId || userData?.employeeId);
  return null;
}

function RootNavigator() {
  const { currentUser, userData, loading, accountDisabled, accountChecked, roleUpdate, dismissRoleNotice } = useAuth();
  const { isDark } = useTheme();
  const [splashAnimationDone, setSplashAnimationDone] = useState(false);
  const [navReady, setNavReady] = useState(false);
  // AuthContext sets currentUser and userData in the same render, so an
  // Employee App login never mounts a supervisor screen even for one frame.
  const isEmployeeLogin = userData?.role === "employee";
  // Task 5: a kiosk login never runs the supervisor background work either
  // (every one of those calls is staff-only on the server).
  const isKioskLogin = userData?.role === "kiosk";
  // Task 5 v2 (B a): an admin with no app type (website only).
  const isWebsiteOnly = userData?.role === "websiteOnly";
  const backgroundSync = isEmployeeLogin || isKioskLogin || isWebsiteOnly ? null : <SupervisorBackgroundSync />;
  useJoinLink({ loggedIn: !!currentUser, navReady: navReady && splashAnimationDone });
  // Task 6: shared devices (supervisor / admin / owner / kiosk) report their
  // app version once per run for the website Devices list.
  useReportAppVersion(currentUser?.uid, userData?.role);

  const onNativeSplashHandoff = useCallback(() => {
    // Native splash and our JS splash are the same solid blue, so
    // hiding the native one right as our animated splash mounts is
    // invisible to the user - no flash, no gap.
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  useEffect(() => {
    onNativeSplashHandoff();
  }, [onNativeSplashHandoff]);

  useEffect(() => {
    if (!loading) markLaunch("authReady");
  }, [loading]);

  if (!splashAnimationDone) {
    // Hide once sign-in is known and the server has said whether the
    // account is still active - see accountChecked.
    const splashReady = !loading && (!currentUser || accountChecked);
    return (
      <>
        {backgroundSync}
        <LoadingScreen
          ready={splashReady}
          onFinish={() => {
            markLaunch("splashHidden");
            setSplashAnimationDone(true);
          }}
        />
      </>
    );
  }

  // RC1: a role change from the website is being applied - nothing else
  // shows (no punch can start) until the token has the new role.
  if (currentUser && roleUpdate && roleUpdate.step !== "notice") {
    return (
      <>
        <StatusBar style={isDark ? "light" : "dark"} />
        <RoleUpdating kind={roleUpdate.kind} step={roleUpdate.step} />
      </>
    );
  }

  // RC1: a new role = a fresh screen tree, so every listener and sync
  // starts again with the new token (none is left dead on a denied read).
  const roleTreeKey = currentUser ? `${currentUser.uid}:${userData?.role ?? "none"}` : "signedOut";

  return (
    <NavigationContainer ref={navigationRef} onReady={() => setNavReady(true)}>
      {backgroundSync}
      <StatusBar style={isDark ? "light" : "dark"} />
      <ConfirmModal
        visible={!!(currentUser && roleUpdate && roleUpdate.step === "notice")}
        title="Your role changed"
        message={roleUpdate?.notice}
        confirmLabel="OK"
        cancelLabel={null}
        onConfirm={dismissRoleNotice}
        onCancel={dismissRoleNotice}
      />
      <Stack.Navigator key={roleTreeKey} screenOptions={{ headerShown: false }}>
        {currentUser && accountDisabled ? (
          <Stack.Screen name="AccountDisabled" component={AccountDisabledScreen} />
        ) : currentUser && isWebsiteOnly ? (
          <Stack.Screen name="WebsiteOnly" component={WebsiteOnlyScreen} />
        ) : currentUser && isKioskLogin ? (
          <Stack.Screen name="KioskRoot" component={KioskRoot} />
        ) : currentUser && isEmployeeLogin ? (
          // Employee App: Home + clock in/out only, no supervisor screens.
          <>
            <Stack.Screen name="EmployeeTabs" component={EmployeeTabs} />
            <Stack.Screen name="ClockPunch" component={ClockPunchScreen} options={{ gestureEnabled: false }} />
            <Stack.Screen name="ShiftComments" component={ShiftCommentsScreen} />
            {/* Phase 8: location consent + Always location (job site alerts). */}
            <Stack.Screen name="AlwaysLocation" component={AlwaysLocationScreen} />
          </>
        ) : currentUser ? (
          <>
            <Stack.Screen name="MainTabs" component={MainTabs} options={{ freezeOnBlur: false }} />
            <Stack.Screen name="EmployeeList" component={W.EmployeeList} />
            <Stack.Screen name="SiteSelect" component={W.SiteSelect} />
            <Stack.Screen name="Notes" component={W.Notes} />
            <Stack.Screen name="PinEntry" component={W.PinEntry} />
            <Stack.Screen name="ClockCamera" component={ClockCameraScreen} />
            <Stack.Screen name="ClockConfirm" component={ClockConfirmScreen} />
            <Stack.Screen name="ClockDeclined" component={ClockDeclinedScreen} />
            <Stack.Screen name="DeclinedAlerts" component={W.DeclinedAlerts} />
            <Stack.Screen name="BreaksPinEntry" component={W.BreaksPinEntry} />
            <Stack.Screen name="BreaksEmployeeList" component={W.BreaksEmployeeList} />
            <Stack.Screen name="OverridePinEntry" component={W.OverridePinEntry} />
            <Stack.Screen name="OverrideEmployeeList" component={W.OverrideEmployeeList} />
            <Stack.Screen name="OverrideReason" component={W.OverrideReason} />
            <Stack.Screen name="CreateEmployee" component={W.CreateEmployee} />
            <Stack.Screen name="UpdateEmployee" component={W.UpdateEmployee} />
            <Stack.Screen name="EditEmployee" component={W.EditEmployee} />
            <Stack.Screen name="EmployeeSyncAlerts" component={W.EmployeeSyncAlerts} />
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
      {/* Task 6: update banner / "Update to continue" over every mode. */}
      {currentUser && !accountDisabled ? <UpdateBanner signedIn /> : null}
    </NavigationContainer>
  );
}

export default Sentry.wrap(function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <SiteSessionProvider>
            <TodayShiftProvider>
              <RootNavigator />
            </TodayShiftProvider>
          </SiteSessionProvider>
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
});
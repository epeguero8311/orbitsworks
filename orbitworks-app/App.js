import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { AuthProvider, useAuth } from "./lib/AuthContext";
import { ThemeProvider, useTheme } from "./lib/ThemeContext";
import { SiteSessionProvider } from "./lib/SiteSessionContext";
import LoginScreen from "./screens/LoginScreen";
import DashboardScreen from "./screens/DashboardScreen";
import SettingsScreen from "./screens/SettingsScreen";
import EmployeeListScreen from "./screens/EmployeeListScreen";
import SiteSelectScreen from "./screens/SiteSelectScreen";
import NotesScreen from "./screens/NotesScreen";
import PinEntryScreen from "./screens/PinEntryScreen";
import ClockCameraScreen from "./screens/ClockCameraScreen";
import ClockConfirmScreen from "./screens/ClockConfirmScreen";
import { View, ActivityIndicator } from "react-native";

const Stack = createNativeStackNavigator();

function RootNavigator() {
  const { currentUser, loading } = useAuth();
  const { isDark } = useTheme();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#3b6fe0" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <StatusBar style={isDark ? "light" : "dark"} />
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {currentUser ? (
          <>
            <Stack.Screen name="Dashboard" component={DashboardScreen} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
            <Stack.Screen name="EmployeeList" component={EmployeeListScreen} />
            <Stack.Screen name="SiteSelect" component={SiteSelectScreen} />
            <Stack.Screen name="Notes" component={NotesScreen} />
            <Stack.Screen name="PinEntry" component={PinEntryScreen} />
            <Stack.Screen name="ClockCamera" component={ClockCameraScreen} />
            <Stack.Screen name="ClockConfirm" component={ClockConfirmScreen} />
          </>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
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

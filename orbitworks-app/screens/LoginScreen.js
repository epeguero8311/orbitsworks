import { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../lib/firebase";
import Logo from "../components/Logo";
import Spinner from "../components/Spinner";
import JoinCodeButton from "../components/JoinCodeButton";
import { peekLoginPrefill, takeLoginPrefill } from "../lib/joinSignIn";

export default function LoginScreen({ navigation }) {
  // After a crew code sign-up whose auto sign-in didn't finish: the email to
  // fill in and a plain message (memory only, read once).
  const [prefill] = useState(peekLoginPrefill);
  useEffect(() => {
    takeLoginPrefill();
  }, []);
  const [email, setEmail] = useState(prefill ? prefill.email : "");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert("Missing info", "Please enter both email and password.");
      return;
    }

    setSubmitting(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      // AuthContext's onAuthStateChanged listener picks this up automatically
    } catch (error) {
      if (error?.code === "auth/user-disabled") {
        Alert.alert(
          "Account deactivated",
          "Your account has been deactivated by your company. Contact your administrator for help."
        );
      } else {
        Alert.alert("Login failed", error.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.container}>
        <View style={{ alignItems: "center", marginTop: 120, marginBottom: 40 }}>
          <Logo size={40} />
        </View>

        <Text style={styles.heading}>Login to your Account</Text>

        {prefill && prefill.message ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>{prefill.message}</Text>
          </View>
        ) : null}

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="you@company.com"
            placeholderTextColor="#9ca3af"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="********"
            placeholderTextColor="#9ca3af"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
        </View>

        <TouchableOpacity
          style={styles.button}
          onPress={handleLogin}
          disabled={submitting}
        >
          {submitting ? (
            <Spinner size={20} color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Sign In</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.linkButton}
          onPress={() => navigation.navigate("ForgotPassword")}
        >
          <Text style={styles.linkText}>Forgot password?</Text>
        </TouchableOpacity>

        <JoinCodeButton onPress={() => navigation.navigate("JoinScan")} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  notice: { backgroundColor: "#eff6ff", borderColor: "#bfdbfe", borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 16 },
  noticeText: { color: "#1e3a8a", fontSize: 14, lineHeight: 20 },
  container: {
    flex: 1,
    paddingHorizontal: 28,
    backgroundColor: "#fff",
  },
  heading: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111",
    marginBottom: 28,
  },
  fieldGroup: {
    marginBottom: 18,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 6,
  },
  input: {
    backgroundColor: "#f3f4f6",
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 20,
    fontSize: 15,
    color: "#111",
  },
  button: {
    backgroundColor: "#3b6fe0",
    borderRadius: 999,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 12,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  linkButton: {
    marginTop: 18,
    alignItems: "center",
  },
  linkText: {
    color: "#3b6fe0",
    fontSize: 14,
    fontWeight: "500",
  },
});

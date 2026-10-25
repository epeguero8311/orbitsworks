import { StyleSheet } from "react-native";

// Shared look for the sign-up steps (same plain white style as the
// Login / JoinScan screens).
export const BLUE = "#3b6fe0";

export const joinStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff" },
  scroll: { paddingHorizontal: 24, paddingBottom: 40 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28, backgroundColor: "#fff" },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 8 },
  back: { flexDirection: "row", alignItems: "center", paddingVertical: 8, paddingRight: 12 },
  backText: { color: BLUE, fontSize: 16, fontWeight: "500", marginLeft: 2 },
  stepText: { color: "#6b7280", fontSize: 14 },
  company: { fontSize: 14, color: "#6b7280", marginTop: 8 },
  title: { fontSize: 24, fontWeight: "700", color: "#111", marginTop: 2, marginBottom: 20 },
  centerTitle: { fontSize: 20, fontWeight: "700", color: "#111", marginTop: 24, marginBottom: 8, textAlign: "center" },
  body: { fontSize: 15, color: "#374151", textAlign: "center", marginBottom: 24, lineHeight: 21 },
  label: { fontSize: 14, fontWeight: "600", color: "#374151", marginBottom: 6, marginTop: 14 },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
    color: "#111",
    backgroundColor: "#fff",
  },
  inputError: { borderColor: "#dc2626" },
  fieldError: { color: "#dc2626", fontSize: 13, marginTop: 6 },
  hint: { color: "#6b7280", fontSize: 13, marginTop: 6 },
  notice: { backgroundColor: "#eff6ff", borderColor: "#bfdbfe", borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 8 },
  noticeText: { color: "#1e3a8a", fontSize: 14, lineHeight: 20 },
  errorBox: { backgroundColor: "#fef2f2", borderColor: "#fecaca", borderWidth: 1, borderRadius: 10, padding: 12, marginTop: 16 },
  errorBoxText: { color: "#991b1b", fontSize: 14, lineHeight: 20 },
  consentBox: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 10, padding: 14, backgroundColor: "#f9fafb", marginTop: 18 },
  consentHeading: { fontSize: 15, fontWeight: "700", color: "#111", marginBottom: 6 },
  consentBody: { fontSize: 14, color: "#374151", lineHeight: 20 },
  link: { color: BLUE, fontWeight: "600" },
  primary: { backgroundColor: BLUE, borderRadius: 999, paddingVertical: 15, alignItems: "center", marginTop: 24 },
  primaryDisabled: { opacity: 0.45 },
  primaryText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  secondary: { borderWidth: 1.5, borderColor: BLUE, borderRadius: 999, paddingVertical: 13, paddingHorizontal: 32, alignItems: "center" },
  secondaryText: { color: BLUE, fontSize: 16, fontWeight: "600" },
  textLink: { color: BLUE, fontSize: 15, fontWeight: "500", marginTop: 18 },
});

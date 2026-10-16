import { Modal, View, Text, TouchableOpacity, StyleSheet, Linking, ScrollView } from "react-native";
import { useTheme } from "../lib/ThemeContext";

const POLICY_URL = "https://orbitsworks.com/biometric-policy";

// Shown before the camera opens in CreateEmployeeScreen.js and
// EditEmployeeScreen.js (Terms Section 4.1) - a short, bilingual,
// tap-to-acknowledge notice that this photo verifies identity at
// clock-in/clock-out. onAcknowledge receives Date.now() at the moment of
// the tap, which both screens thread through to the server (createEmployee/
// updateEmployeeProfile) as photoNoticeAck on the employee record - see
// employeeQueue.js/employeeUpdateQueue.js. This only logs that the notice
// was shown and acknowledged on-device; it is not a substitute for the
// employer's own written employee notice/consent (Biometric Data Policy
// Section 3, Terms Section 4.1).
export default function PhotoNoticeModal({ visible, onAcknowledge }) {
  const { colors } = useTheme();

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <ScrollView>
            <Text style={[styles.title, { color: colors.text }]}>
              Before this photo is taken
            </Text>
            <Text style={[styles.body, { color: colors.text }]}>
              This photo is used to verify your identity when you clock in
              and out. It will be compared against this photo each time
              you clock in or out.
            </Text>
            <TouchableOpacity onPress={() => Linking.openURL(POLICY_URL)}>
              <Text style={[styles.link, { color: colors.accent }]}>
                View our Biometric Data Policy
              </Text>
            </TouchableOpacity>

            <View style={[styles.divider, { borderColor: colors.border }]} />

            <Text style={[styles.title, { color: colors.text }]}>
              Antes de tomar esta foto
            </Text>
            <Text style={[styles.body, { color: colors.text }]}>
              Esta foto se usa para verificar su identidad cuando entra y
              sale del trabajo. Se comparara con esta foto cada vez que
              usted entre o salga.
            </Text>
            <TouchableOpacity onPress={() => Linking.openURL(POLICY_URL)}>
              <Text style={[styles.link, { color: colors.accent }]}>
                Ver nuestra Politica de Datos Biometricos
              </Text>
            </TouchableOpacity>

            <Text style={[styles.caption, { color: colors.subtext }]}>
              Your employer is responsible for separately giving you any
              written notice and getting any consent required by law. /
              Su empleador es responsable de darle por separado cualquier
              aviso escrito y obtener el consentimiento que exija la ley.
            </Text>
          </ScrollView>

          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.accent }]}
            onPress={() => onAcknowledge(Date.now())}
          >
            <Text style={styles.buttonText}>
              I understand, continue / Entiendo, continuar
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    maxHeight: "85%",
    borderRadius: 16,
    padding: 20,
  },
  title: { fontSize: 16, fontWeight: "700", marginBottom: 8 },
  body: { fontSize: 14, lineHeight: 20, marginBottom: 10 },
  link: { fontSize: 13, fontWeight: "600", marginBottom: 4 },
  divider: { borderTopWidth: 1, marginVertical: 16 },
  caption: { fontSize: 11, lineHeight: 16, marginTop: 16 },
  button: {
    marginTop: 16,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  buttonText: { color: "#fff", fontSize: 14, fontWeight: "700", textAlign: "center" },
});

import { View, Text, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Logo from "../../components/Logo";
import JoinTopBarButton, { JoinTopBar } from "../../components/join/JoinTopBarButton";
import Spinner from "../../components/Spinner";
import { INVITE_NO_LONGER_ACTIVE, NO_LONGER_ACTIVE } from "../../lib/validators/joinSignup";
import { joinStyles as s, BLUE } from "./joinStyles";

// Loading / dead code / network problem. Every state has Cancel (top
// right, back to Login), the loading one too so nobody is stuck waiting.
// A network problem also offers Retry.
// source: "qr" (crew code) or "invite" (email invite) - only the wording changes.
const WORDS = {
  qr: { thing: "crew code", deadTitle: "Code no longer active", dead: NO_LONGER_ACTIVE },
  invite: { thing: "invite", deadTitle: "Invite no longer active", dead: INVITE_NO_LONGER_ACTIVE },
};

export default function JoinStatusView({ phase, onRetry, onExit, source = "qr" }) {
  const w = source === "invite" ? WORDS.invite : WORDS.qr;
  const insets = useSafeAreaInsets();
  const frame = (children) => (
    <View style={s.root}>
      <JoinTopBar
        style={{ paddingTop: insets.top + 8 }}
        right={<JoinTopBarButton label="Cancel" onPress={onExit} accessibilityLabel="Cancel and go back to login" />}
      />
      <View style={s.center}>{children}</View>
    </View>
  );

  if (phase === "loading") {
    return frame(
      <>
        <Spinner size={24} color={BLUE} />
        <Text style={[s.body, { marginTop: 16 }]}>Checking your {w.thing}...</Text>
      </>
    );
  }

  if (phase === "error") {
    return frame(
      <>
        <Logo size={40} />
        <Text style={s.centerTitle}>{"Can't connect"}</Text>
        <Text style={s.body}>{`We couldn't check your ${w.thing}. Check your connection and try again.`}</Text>
        <TouchableOpacity style={[s.primary, { paddingHorizontal: 48, marginTop: 0 }]} onPress={onRetry}>
          <Text style={s.primaryText}>Retry</Text>
        </TouchableOpacity>
      </>
    );
  }

  return frame(
    <>
      <Logo size={40} />
      <Text style={s.centerTitle}>{w.deadTitle}</Text>
      <Text style={s.body}>{w.dead}</Text>
    </>
  );
}

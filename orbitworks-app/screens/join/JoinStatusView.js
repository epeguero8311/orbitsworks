import { View, Text, TouchableOpacity } from "react-native";
import Logo from "../../components/Logo";
import Spinner from "../../components/Spinner";
import { INVITE_NO_LONGER_ACTIVE, NO_LONGER_ACTIVE } from "../../lib/validators/joinSignup";
import { joinStyles as s, BLUE } from "./joinStyles";

// Loading / dead code / network problem. The dead-end has no form, only a
// way back to Login. A network problem offers Retry instead.
// source: "qr" (crew code) or "invite" (email invite) - only the wording changes.
const WORDS = {
  qr: { thing: "crew code", deadTitle: "Code no longer active", dead: NO_LONGER_ACTIVE },
  invite: { thing: "invite", deadTitle: "Invite no longer active", dead: INVITE_NO_LONGER_ACTIVE },
};

export default function JoinStatusView({ phase, onRetry, onExit, source = "qr" }) {
  const w = source === "invite" ? WORDS.invite : WORDS.qr;
  if (phase === "loading") {
    return (
      <View style={s.center}>
        <Spinner size={24} color={BLUE} />
        <Text style={[s.body, { marginTop: 16 }]}>Checking your {w.thing}...</Text>
      </View>
    );
  }

  if (phase === "error") {
    return (
      <View style={s.center}>
        <Logo size={40} />
        <Text style={s.centerTitle}>{"Can't connect"}</Text>
        <Text style={s.body}>{`We couldn't check your ${w.thing}. Check your connection and try again.`}</Text>
        <TouchableOpacity style={[s.primary, { paddingHorizontal: 48, marginTop: 0 }]} onPress={onRetry}>
          <Text style={s.primaryText}>Retry</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onExit}>
          <Text style={s.textLink}>Back to login</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={s.center}>
      <Logo size={40} />
      <Text style={s.centerTitle}>{w.deadTitle}</Text>
      <Text style={s.body}>{w.dead}</Text>
      <TouchableOpacity style={s.secondary} onPress={onExit}>
        <Text style={s.secondaryText}>Back to login</Text>
      </TouchableOpacity>
    </View>
  );
}

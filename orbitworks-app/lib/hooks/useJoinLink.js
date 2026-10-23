import { useEffect, useState } from "react";
import { Linking } from "react-native";
import { parseJoinUrl } from "../joinLink";
import {
  clearPendingJoinToken,
  getJoinLinks,
  getPendingJoinToken,
  setPendingJoinToken,
  subscribePendingJoin,
} from "../pendingJoin";
import { navigationRef } from "../navigationRef";

// Opens the sign-up flow when the app is launched (or brought back) by a
// crew code link: the QR's https link (universal link) or the
// orbitsworks-dev:// button on the /j page.
// - Logged out: go to JoinStart once navigation is ready.
// - Logged in: ignore the link (signing up is for new people only).
// The URL and token are never logged.
export function useJoinLink({ loggedIn, navReady }) {
  const [token, setToken] = useState(getPendingJoinToken());

  useEffect(() => subscribePendingJoin(setToken), []);

  useEffect(() => {
    const joinLinks = getJoinLinks();
    if (!joinLinks) return undefined;
    const handle = (url) => {
      const parsed = parseJoinUrl(url, joinLinks);
      if (parsed) setPendingJoinToken(parsed);
    };
    Linking.getInitialURL()
      .then(handle)
      .catch(() => {});
    const sub = Linking.addEventListener("url", (event) => handle(event.url));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!token) return;
    if (loggedIn) {
      clearPendingJoinToken();
      return;
    }
    if (!navReady || !navigationRef.isReady()) return;
    const current = navigationRef.getCurrentRoute()?.name;
    if (current !== "JoinStart") navigationRef.navigate("JoinStart");
  }, [token, loggedIn, navReady]);
}

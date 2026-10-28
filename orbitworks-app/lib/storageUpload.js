import * as FileSystem from "expo-file-system/legacy";
import { auth } from "./firebase";

// Uploads a local file straight to Firebase Storage's REST endpoint via
// expo-file-system's native uploadAsync, bypassing the Firebase JS SDK's
// own upload path entirely. Confirmed via device logs that BOTH of the
// SDK's upload mechanisms are broken on this React Native/Android setup:
// uploadBytes (one-shot) needs a native Blob, which RN's BlobManager
// refuses to build from an ArrayBuffer/Uint8Array ("Creating blobs from
// 'ArrayBuffer' ... are not supported"); uploadBytesResumable (chunked)
// never throws, but sits at bytesTransferred: 0 for the entire timeout on
// every single attempt - RN's networking layer doesn't surface the
// upload-progress events the resumable protocol needs to ever detect
// completion. uploadAsync reads straight off disk through native code
// and does one real HTTP POST, with no Blob/ArrayBuffer step at all.
//
// options.foreground (iOS): send through the normal foreground URL session
// instead of uploadAsync's default background session. Background
// transfers go through an iOS system service that can hold them back and
// keeps retrying instead of failing - fine for the supervisor's offline
// queue, but an Employee App punch is waiting on screen for this upload
// (found 2026-10-28: ~20-80 s for a 480 KB photo on home wifi). A
// foreground upload fails if the app leaves the screen; the punch then
// shows Try again. Android ignores this setting.
export async function uploadLocalFileToStorage(photoRef, localUri, contentType, options = {}) {
  const token = await auth.currentUser.getIdToken();
  const url = `https://firebasestorage.googleapis.com/v0/b/${photoRef.bucket}/o?uploadType=media&name=${encodeURIComponent(photoRef.fullPath)}`;

  const result = await FileSystem.uploadAsync(url, localUri, {
    httpMethod: "POST",
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    ...(options.foreground ? { sessionType: FileSystem.FileSystemSessionType.FOREGROUND } : {}),
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": contentType,
    },
  });

  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Photo upload failed with status ${result.status}`);
  }
}

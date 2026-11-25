// READ-ONLY: every distinct role in users/{uid}.role and in Auth custom
// claims (claims.role), with counts. Prints counts and role names only - no
// uid, email or name. Run before a rules change that relies on the role list
// (Task 5 Kiosk: notEmployee() -> isStaff()).
//
//   node scripts/listRoles.js --project <orbitworks-dev-ew|orbitworks-7ef59>
//
// Never writes (--apply is refused).

const guard = require("./lib/projectGuard");

const args = guard.parseArgs(process.argv.slice(2), "listRoles.js");
if (args.apply) guard.fail("listRoles.js is read-only - --apply is not allowed.");
guard.lockProject(args.project);

const KNOWN = new Set(["owner", "admin", "supervisor", "employee"]);

function bump(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

async function main() {
  const admin = require("firebase-admin");
  admin.initializeApp();
  guard.assertResolvedProject(admin, args.project);
  console.log(`[listRoles] project=${args.project} READ-ONLY`);

  const docRoles = new Map();
  const users = await admin.firestore().collection("users").get();
  for (const u of users.docs) {
    const role = u.get("role");
    bump(docRoles, typeof role === "string" ? role : `<${role === undefined ? "missing" : typeof role}>`);
  }

  const claimRoles = new Map();
  let authUsers = 0;
  let pageToken;
  do {
    const page = await admin.auth().listUsers(1000, pageToken);
    for (const u of page.users) {
      authUsers++;
      const role = u.customClaims ? u.customClaims.role : undefined;
      bump(claimRoles, typeof role === "string" ? role : `<${role === undefined ? "no role claim" : typeof role}>`);
    }
    pageToken = page.pageToken;
  } while (pageToken);

  const show = (title, map, total) => {
    console.log(`\n${title} (${total})`);
    for (const [role, n] of [...map.entries()].sort()) {
      const flag = role.startsWith("<") || KNOWN.has(role) ? "" : "   <-- UNKNOWN ROLE";
      console.log(`  ${role.padEnd(20)} ${n}${flag}`);
    }
  };
  show("users/{uid}.role", docRoles, users.size);
  show("Auth custom claims role", claimRoles, authUsers);

  const unknown = [...docRoles.keys(), ...claimRoles.keys()].filter((r) => !r.startsWith("<") && !KNOWN.has(r));
  console.log(unknown.length ? `\nUNKNOWN ROLES FOUND: ${[...new Set(unknown)].join(", ")}` : "\nOnly owner/admin/supervisor/employee found.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

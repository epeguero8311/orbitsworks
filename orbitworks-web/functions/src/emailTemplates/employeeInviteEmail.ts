// Employee App email invite (Phase 3B). Same look as inviteEmail.ts.
// Company name and logo URL come from the company doc (admin-typed), so
// they are HTML-escaped here.

const ACCENT_COLOR = "#3b6fe0";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildEmployeeInviteEmail(params: {
  companyName: string;
  inviteLink: string;
  appName: string;
  installFrom: string;
  expiryDays: number;
  companyLogoUrl?: string;
}): { subject: string; html: string } {
  const company = escapeHtml(params.companyName);
  const appName = escapeHtml(params.appName);
  const installFrom = escapeHtml(params.installFrom);
  const link = escapeHtml(params.inviteLink);
  const logo = params.companyLogoUrl && /^https:\/\//.test(params.companyLogoUrl) ? escapeHtml(params.companyLogoUrl) : null;

  // Subject is plain text, not HTML - no escaping, but no line breaks.
  const subject = `${params.companyName.replace(/[\r\n]+/g, " ")} invited you to clock in with OrbitsWorks`;

  const logoOrName = logo
    ? `<img src="${logo}" alt="${company}" style="max-height: 48px; max-width: 240px; border: 0; display: block; margin: 0 auto;" />`
    : `<div style="font-size: 18px; font-weight: 700; color: #111827; text-align: center;">${company}</div>`;

  const step = (n: number, text: string) => `
                  <tr>
                    <td style="padding: 4px 0; font-size: 14px; line-height: 1.6; color: #374151; vertical-align: top; width: 24px;">${n}.</td>
                    <td style="padding: 4px 0; font-size: 14px; line-height: 1.6; color: #374151;">${text}</td>
                  </tr>`;

  const html = `<!doctype html>
<html>
  <body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 12px; overflow: hidden;">
            <tr>
              <td style="padding: 32px 40px 0 40px;">
                ${logoOrName}
              </td>
            </tr>
            <tr>
              <td style="padding: 24px 40px 0 40px;">
                <h1 style="margin: 0; font-size: 22px; line-height: 1.3; color: ${ACCENT_COLOR}; font-weight: 700;">
                  You're invited to join ${company}
                </h1>
              </td>
            </tr>
            <tr>
              <td style="padding: 16px 40px 0 40px;">
                <p style="margin: 0; font-size: 15px; line-height: 1.6; color: #374151;">
                  ${company} uses OrbitsWorks for clocking in and out. Set up your account in the
                  <strong>${appName}</strong> app to clock in from your phone.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding: 24px 40px 0 40px;">
                <p style="margin: 0 0 12px 0; font-size: 15px; font-weight: 700; color: #111827;">
                  What to do
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%;">${step(1, `Open this email on your phone.`)}${step(2, `Install ${appName} from ${installFrom}, if you don't have it yet.`)}${step(3, `Tap the button below. If the app doesn't open, install it first, then come back and tap the button again.`)}${step(4, `Create your account with <strong>this email address</strong>.`)}
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding: 32px 40px 0 40px;">
                <a href="${link}" style="display: inline-block; background-color: ${ACCENT_COLOR}; color: #ffffff; font-size: 15px; font-weight: 700; text-decoration: none; padding: 14px 32px; border-radius: 8px;">
                  Set up my account
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding: 16px 40px 0 40px;">
                <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #9ca3af; text-align: center; word-break: break-all;">
                  This invite works once and expires in ${params.expiryDays} days.<br />
                  If the button doesn't work, open this link on your phone:<br />
                  ${link}
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding: 32px 40px 32px 40px;">
                <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 0 0 16px 0;" />
                <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #9ca3af; text-align: center;">
                  This invite was sent by ${company} via OrbitsWorks.<br />
                  If you weren't expecting this, you can ignore this email.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, html };
}

const ACCENT_COLOR = "#3b6fe0";

export function buildInviteEmail(params: {
  companyName: string;
  role: "supervisor" | "admin";
  joinLink: string;
  companyLogoUrl?: string;
}): { subject: string; html: string } {
  const { companyName, role, joinLink, companyLogoUrl } = params;

  const roleLabel = role === "admin" ? "Admin" : "Supervisor";
  const roleArticle = role === "admin" ? "an" : "a";
  const roleDescription =
    role === "admin"
      ? "As an admin, you'll get your own login with full access to the web dashboard - manage employees, sites, timesheets, and everything else except billing."
      : "As a supervisor, you'll get your own login, can clock yourself in and out, and can clock other employees in and out on job sites.";

  const subject = `You're invited to join ${companyName} on OrbitsWorks`;

  const logoOrName = companyLogoUrl
    ? `<img src="${companyLogoUrl}" alt="${companyName}" style="max-height: 48px; max-width: 240px; border: 0; display: block; margin: 0 auto;" />`
    : `<div style="font-size: 18px; font-weight: 700; color: #111827; text-align: center;">${companyName}</div>`;

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
                  You've been invited to join ${companyName}
                </h1>
              </td>
            </tr>
            <tr>
              <td style="padding: 16px 40px 0 40px;">
                <p style="margin: 0; font-size: 15px; line-height: 1.6; color: #374151;">
                  You've been invited to join <strong>${companyName}</strong> on OrbitsWorks as ${roleArticle}
                  <strong>${roleLabel}</strong>. ${roleDescription}
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding: 24px 40px 0 40px;">
                <p style="margin: 0 0 12px 0; font-size: 15px; font-weight: 700; color: #111827;">
                  What happens next
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%;">
                  <tr>
                    <td style="padding: 4px 0; font-size: 14px; line-height: 1.6; color: #374151; vertical-align: top; width: 24px;">1.</td>
                    <td style="padding: 4px 0; font-size: 14px; line-height: 1.6; color: #374151;">Click the button below to accept your invite</td>
                  </tr>
                  <tr>
                    <td style="padding: 4px 0; font-size: 14px; line-height: 1.6; color: #374151; vertical-align: top; width: 24px;">2.</td>
                    <td style="padding: 4px 0; font-size: 14px; line-height: 1.6; color: #374151;">Set up your login</td>
                  </tr>
                  <tr>
                    <td style="padding: 4px 0; font-size: 14px; line-height: 1.6; color: #374151; vertical-align: top; width: 24px;">3.</td>
                    <td style="padding: 4px 0; font-size: 14px; line-height: 1.6; color: #374151;">Download the OrbitsWorks app (or use the web dashboard) to get started</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding: 32px 40px 0 40px;">
                <a href="${joinLink}" style="display: inline-block; background-color: ${ACCENT_COLOR}; color: #ffffff; font-size: 15px; font-weight: 700; text-decoration: none; padding: 14px 32px; border-radius: 8px;">
                  Accept your invite
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding: 16px 40px 0 40px;">
                <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #9ca3af; text-align: center; word-break: break-all;">
                  If the button doesn't work, copy and paste this link into your browser:<br />
                  ${joinLink}
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding: 32px 40px 32px 40px;">
                <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 0 0 16px 0;" />
                <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #9ca3af; text-align: center;">
                  This invite was sent by ${companyName} via OrbitsWorks.<br />
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

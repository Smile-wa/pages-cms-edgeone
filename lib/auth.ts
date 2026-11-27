import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { emailOTP } from "better-auth/plugins";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { getBaseUrl } from "@/lib/base-url";
import { repairLegacyGithubStubOnLogin } from "@/lib/github-legacy-stub-repair";
import { sendEmail } from "@/lib/mailer";
import { syncGithubProfileOnLogin } from "@/lib/github-account";
import { bindCollaboratorInvitesToUser } from "@/lib/collaborator-access";
import { LoginEmailTemplate } from "@/components/email/login";
import { render } from "@react-email/render";

export const auth = betterAuth({
  baseURL: getBaseUrl(),
  // Explicitly trust the canonical URL so EdgeOne's forwarded headers do not
  // make Better Auth reject same-origin sign-in requests.
  trustedOrigins: [getBaseUrl()],
  secret: (process.env.AUTH_SECRET || process.env.BETTER_AUTH_SECRET) as string,
  user: {
    additionalFields: {
      githubUsername: {
        type: "string",
        required: false,
        input: false,
      },
    },
  },
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["github"],
      disableImplicitLinking: false,
      updateUserInfoOnLink: true,
      allowUnlinkingAll: false,
    },
  },
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_APP_CLIENT_ID as string,
      clientSecret: process.env.GITHUB_APP_CLIENT_SECRET as string,
      overrideUserInfoOnSignIn: false,
      mapProfileToUser: (profile) => ({
        name: profile.name ?? profile.login,
        image: profile.avatar_url ?? null,
        githubUsername: profile.login,
      }),
      scope: ["repo", "user:email"],
      getUserInfo: async (token) => {
        const profileResponse = await fetch("https://api.github.com/user", {
          headers: {
            "User-Agent": "better-auth",
            Authorization: `Bearer ${token.accessToken}`,
          },
        });

        if (!profileResponse.ok) {
          console.warn("[auth] github getUserInfo failed", {
            status: profileResponse.status,
            githubRequestId: profileResponse.headers.get("x-github-request-id"),
            rateLimitRemaining: profileResponse.headers.get("x-ratelimit-remaining"),
          });
          return null;
        }

        const profile = await profileResponse.json();

        let emails:
          | Array<{ email: string; primary: boolean; verified: boolean; visibility: "public" | "private" }>
          = [];
        const emailHeaders = {
          Authorization: `Bearer ${token.accessToken}`,
          "User-Agent": "better-auth",
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        };

        try {
          const emailsResponse = await fetch("https://api.github.com/user/emails", {
            headers: emailHeaders,
          });
          if (emailsResponse.ok) {
            emails = await emailsResponse.json();
          } else {
            console.warn("[auth] github /user/emails failed", {
              status: emailsResponse.status,
              githubRequestId: emailsResponse.headers.get("x-github-request-id"),
              hint: "GitHub App needs Account permissions > Email addresses: Read only",
            });
          }
        } catch (error) {
          console.warn("[auth] github /user/emails threw", {
            error: error instanceof Error ? error.message : String(error),
          });
        }

        const email =
          profile.email ||
          emails.find((entry) => entry.primary && entry.verified)?.email ||
          emails.find((entry) => entry.primary)?.email ||
          emails.find((entry) => entry.verified)?.email ||
          emails[0]?.email ||
          // GitHub Apps without the email permission still expose id/login.
          // Use GitHub's own noreply pattern so sign-in does not hard-fail.
          (profile.id && profile.login
            ? `${profile.id}+${profile.login}@users.noreply.github.com`
            : null);

        if (!profile.email && emails.length === 0) {
          console.warn("[auth] using GitHub noreply email fallback", {
            githubId: profile.id,
            login: profile.login,
          });
        }

        const emailVerified = emails.some((entry) => entry.email === email && entry.verified);
        profile.email = email;

        const userMap = {
          name: profile.name ?? profile.login,
          image: profile.avatar_url ?? null,
          githubUsername: profile.login,
        };

        return {
          user: {
            id: profile.id,
            email,
            emailVerified,
            ...userMap,
          },
          data: profile,
        };
      },
    },
  },
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.userTable,
      session: schema.sessionTable,
      account: schema.accountTable,
      verification: schema.verificationTable,
    },
  }),
  databaseHooks: {
    session: {
      create: {
        after: async (session) => {
          try {
            await repairLegacyGithubStubOnLogin(session.id, session.userId);
          } catch (error) {
            console.warn("[auth] legacy github stub repair failed", {
              sessionId: session.id,
              userId: session.userId,
              error: error instanceof Error ? error.message : String(error),
            });
          }

          try {
            await syncGithubProfileOnLogin(session.userId);
          } catch (error) {
            console.warn("[auth] github profile sync failed", {
              sessionId: session.id,
              userId: session.userId,
              error: error instanceof Error ? error.message : String(error),
            });
          }

          try {
            const user = await db.query.userTable.findFirst({
              where: (table, { eq }) => eq(table.id, session.userId),
            });
            if (user) {
              await bindCollaboratorInvitesToUser(user);
            }
          } catch (error) {
            console.warn("[auth] collaborator invite binding failed", {
              sessionId: session.id,
              userId: session.userId,
              error: error instanceof Error ? error.message : String(error),
            });
          }

        },
      },
    },
  },
  plugins: [
    nextCookies(),
    emailOTP({
      expiresIn: 300,
      otpLength: 6,
      allowedAttempts: 5,
      storeOTP: "encrypted",
      resendStrategy: "reuse",
      sendVerificationOTP: async ({ email, otp, type }) => {
        if (type !== "sign-in") return;

        const subject = `Your Pages CMS temporary code is ${otp}`;
        const html = await render(
          LoginEmailTemplate({
            email,
            otp,
            preview: subject,
          }),
        );

        await sendEmail({
          to: email,
          subject,
          html,
        });
      },
    }),
  ],
});

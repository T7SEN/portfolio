import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Discord from "next-auth/providers/discord";
import Google from "next-auth/providers/google";

const adminEmails = process.env.ADMIN_EMAILS?.split(",") || [];

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [GitHub, Discord, Google],
  pages: {
    signIn: "/guestbook",
  },
  callbacks: {
    async session({ session, token }) {
      if (session.user) {
        // 1. Pass User ID
        if (token.sub) {
          session.user.id = token.sub;
        }

        // 2. RBAC Logic: Check if email is in the admin whitelist
        const userEmail = session.user.email?.toLowerCase() || "";
        const isAdmin = adminEmails.some(
          (admin) => admin.trim().toLowerCase() === userEmail,
        );

        session.user.isAdmin = isAdmin;
      }
      return session;
    },
  },
});

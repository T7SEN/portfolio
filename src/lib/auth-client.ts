import { createAuthClient } from "better-auth/react";
import { customSessionClient } from "better-auth/client/plugins";
import type { auth } from "@/lib/auth";

// Browser-side client. The customSessionClient<typeof auth>() generic
// propagates the server's customSession shape (incl. isAdmin) to client
// type inference, so useSession() returns the augmented user.
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL,
  plugins: [customSessionClient<typeof auth>()],
});

export const { signIn, signOut, useSession, getSession } = authClient;

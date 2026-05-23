"use client";

import React, { createContext, useContext } from "react";
import { useSession } from "@/lib/auth-client";

interface AdminContextType {
  isAdmin: boolean;
}

const AdminContext = createContext<AdminContextType | undefined>(undefined);

// Better Auth's useSession is self-contained — no <SessionProvider /> wrapper
// needed (unlike NextAuth's client). The customSession plugin in the auth
// factory (src/lib/auth.ts) injects `isAdmin` based on the ADMIN_EMAILS
// whitelist; the client picks it up via `customSessionClient<typeof auth>()`
// in src/lib/auth-client.ts.
export function AdminProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const isAdmin = !!session?.user?.isAdmin;
  return (
    <AdminContext.Provider value={{ isAdmin }}>
      {children}
    </AdminContext.Provider>
  );
}

export function useAdmin() {
  const context = useContext(AdminContext);
  if (context === undefined) {
    throw new Error("useAdmin must be used within an AdminProvider");
  }
  return context;
}

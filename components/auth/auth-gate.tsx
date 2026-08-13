"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { LogOut } from "lucide-react";
import { emailForUsername, isSupabaseConfigured, supabase, usernameForEmail } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EDITABLE_CLASSES } from "@/components/pricing/inputs";
import { cn } from "@/lib/utils";

/**
 * Sign-in gate. Nothing below it renders — and no workspace data is fetched —
 * until there is a session, so the data providers never run for a stranger.
 *
 * There is no signup link and no email field: signup is switched off in the
 * project, the two accounts are created in the dashboard, and a username maps
 * to a fixed internal address (`Akif123` → akif123@akif-cpg.app).
 *
 * A user created by an admin carries `must_change_password` in their metadata.
 * While that flag is set the gate shows the change-password step instead of
 * the app, so a password one person typed for another cannot stay in use.
 */

interface AuthContextValue {
  session: Session;
  /** "Yahya123" — for display in the header. */
  username: string;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const MIN_PASSWORD_LENGTH = 8;

export function AuthGate({ children }: { children: React.ReactNode }) {
  // `isSupabaseConfigured` is a build-time constant, so an unconfigured build
  // is ready immediately rather than after an effect.
  const [ready, setReady] = useState(!isSupabaseConfigured);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const client = supabase();
    let cancelled = false;
    void client.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      setReady(true);
    });
    const { data: subscription } = client.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  if (!isSupabaseConfigured) return <ConfigurationNeeded />;
  if (!ready) return null;
  if (!session) return <SignInScreen />;

  if (session.user.user_metadata?.must_change_password === true) {
    return <ChoosePasswordScreen username={usernameForEmail(session.user.email)} />;
  }

  const value: AuthContextValue = {
    session,
    username: usernameForEmail(session.user.email),
    signOut: async () => {
      await supabase().auth.signOut();
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Available to anything below the gate; null above it. */
export function useAuth(): AuthContextValue | null {
  return useContext(AuthContext);
}

export function SignOutButton() {
  const auth = useAuth();
  if (!auth) return null;
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] text-muted-foreground">{auth.username}</span>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 gap-1.5 text-xs"
        onClick={() => void auth.signOut()}
      >
        <LogOut aria-hidden />
        Sign out
      </Button>
    </div>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm gap-4 py-5">
        <CardHeader className="px-5">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Akif CPG · Pricing Architect
          </p>
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent className="px-5">{children}</CardContent>
      </Card>
    </div>
  );
}

function ConfigurationNeeded() {
  return (
    <Shell title="Not connected to a workspace">
      <p className="text-sm text-muted-foreground">
        This build has no Supabase configuration, so there is nothing to sign in to. Copy
        <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">.env.example</code>
        to <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">.env.local</code> and fill
        it in — see <code className="text-xs">supabase/README.md</code>.
      </p>
    </Shell>
  );
}

function SignInScreen() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (username.trim() === "" || password === "") return;
    setBusy(true);
    setError(null);
    const { error: signInError } = await supabase().auth.signInWithPassword({
      email: emailForUsername(username),
      password,
    });
    setBusy(false);
    if (signInError) {
      // Deliberately vague: saying which half was wrong tells an attacker
      // which usernames exist.
      setError("That username and password don't match.");
      setPassword("");
    }
  };

  return (
    <Shell title="Sign in">
      <form className="space-y-3" onSubmit={submit}>
        <div className="space-y-1">
          <Label htmlFor="auth-username" className="text-xs text-muted-foreground">
            Username
          </Label>
          <Input
            id="auth-username"
            value={username}
            autoComplete="username"
            autoFocus
            className={cn(EDITABLE_CLASSES, "h-9")}
            onChange={(event) => setUsername(event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="auth-password" className="text-xs text-muted-foreground">
            Password
          </Label>
          <Input
            id="auth-password"
            type="password"
            value={password}
            autoComplete="current-password"
            className={cn(EDITABLE_CLASSES, "h-9")}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        {error !== null && <p className="text-xs text-negative">{error}</p>}
        <Button type="submit" size="sm" className="w-full" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>
        <p className="text-[11px] text-muted-foreground">
          Accounts are created by the workspace owner; there is no self-signup.
        </p>
      </form>
    </Shell>
  );
}

function ChoosePasswordScreen({ username }: { username: string }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirmation) {
      setError("The two passwords don't match.");
      return;
    }
    setBusy(true);
    setError(null);
    // Clearing the flag in the same call means a half-finished change can
    // never leave someone stuck on this screen with a password already set.
    const { error: updateError } = await supabase().auth.updateUser({
      password,
      data: { must_change_password: false },
    });
    setBusy(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    // The session's metadata is stale until it refreshes; reloading is the
    // simplest way to re-enter the gate with the flag cleared.
    window.location.reload();
  };

  return (
    <Shell title={`Choose your password, ${username}`}>
      <form className="space-y-3" onSubmit={submit}>
        <p className="text-xs text-muted-foreground">
          You signed in with a temporary password someone else chose. Pick your own before
          continuing — nobody else will know it.
        </p>
        <div className="space-y-1">
          <Label htmlFor="new-password" className="text-xs text-muted-foreground">
            New password
          </Label>
          <Input
            id="new-password"
            type="password"
            value={password}
            autoComplete="new-password"
            autoFocus
            className={cn(EDITABLE_CLASSES, "h-9")}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="confirm-password" className="text-xs text-muted-foreground">
            Repeat it
          </Label>
          <Input
            id="confirm-password"
            type="password"
            value={confirmation}
            autoComplete="new-password"
            className={cn(EDITABLE_CLASSES, "h-9")}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </div>
        {error !== null && <p className="text-xs text-negative">{error}</p>}
        <Button type="submit" size="sm" className="w-full" disabled={busy}>
          {busy ? "Saving…" : "Save and continue"}
        </Button>
      </form>
    </Shell>
  );
}

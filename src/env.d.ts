declare namespace App {
  interface Locals {
    user: import("@supabase/supabase-js").User | null;
    /** True when the session could not be resolved at all (Supabase unreachable
     * or erroring), as opposed to resolving cleanly to "nobody is signed in".
     * `user` is null in both cases; only this tells them apart, so a transient
     * is not reported to the caller as an expired session. */
    sessionUnresolved: boolean;
    theme: import("./lib/theme").Theme;
  }
}

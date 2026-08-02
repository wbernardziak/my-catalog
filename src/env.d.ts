declare namespace App {
  interface Locals {
    user: import("@supabase/supabase-js").User | null;
    theme: import("./lib/theme").Theme;
  }
}

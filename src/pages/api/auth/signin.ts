import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  let form: FormData;
  try {
    form = await context.request.formData();
  } catch (err) {
    // eslint-disable-next-line no-console -- deliberate; see the matching note in catalog.astro
    console.error("[auth/signin] could not parse the submitted form", err);
    // An unparseable body must not escape as a framework 500; the house
    // convention is a friendly `?error=` redirect.
    return context.redirect(
      `/auth/signin?error=${encodeURIComponent("Could not read the submitted form. Please try again.")}`,
    );
  }
  const email = form.get("email") as string;
  const password = form.get("password") as string;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    // eslint-disable-next-line no-console -- deliberate; see the matching note in catalog.astro
    console.error("[auth/signin] refused: Supabase is not configured");
    return context.redirect(`/auth/signin?error=${encodeURIComponent("Supabase is not configured")}`);
  }
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // The provider's message only. A rejected sign-in is usually just a wrong
    // password, but an outage lands here too and would otherwise be invisible.
    // Never the submitted email or password: credentials do not belong in logs.
    // eslint-disable-next-line no-console -- deliberate; see the matching note in catalog.astro
    console.error("[auth/signin] the provider refused the sign-in", error.message);
    return context.redirect(`/auth/signin?error=${encodeURIComponent(error.message)}`);
  }

  return context.redirect("/");
};

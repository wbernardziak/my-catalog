import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  let form: FormData;
  try {
    form = await context.request.formData();
  } catch (err) {
    // eslint-disable-next-line no-console -- deliberate; see the matching note in catalog.astro
    console.error("[auth/signup] could not parse the submitted form", err);
    // An unparseable body must not escape as a framework 500; the house
    // convention is a friendly `?error=` redirect.
    return context.redirect(
      `/auth/signup?error=${encodeURIComponent("Could not read the submitted form. Please try again.")}`,
    );
  }
  const email = form.get("email") as string;
  const password = form.get("password") as string;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    // eslint-disable-next-line no-console -- deliberate; see the matching note in catalog.astro
    console.error("[auth/signup] refused: Supabase is not configured");
    return context.redirect(`/auth/signup?error=${encodeURIComponent("Supabase is not configured")}`);
  }
  const { error } = await supabase.auth.signUp({ email, password });

  if (error) {
    // The provider's message only — never the submitted email or password.
    // See the matching note in `signin.ts`.
    // eslint-disable-next-line no-console -- deliberate; see the matching note in catalog.astro
    console.error("[auth/signup] the provider refused the sign-up", error.message);
    return context.redirect(`/auth/signup?error=${encodeURIComponent(error.message)}`);
  }

  return context.redirect("/auth/confirm-email");
};

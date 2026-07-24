import { redirect } from "next/navigation";
import { auth, signIn } from "@/lib/auth";

export const metadata = { title: "Sign in - HIQM" };

export default async function LoginPage(props: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (session) redirect("/dashboard");
  const { error } = await props.searchParams;

  async function login(formData: FormData) {
    "use server";
    try {
      await signIn("credentials", {
        email: formData.get("email"),
        password: formData.get("password"),
        redirectTo: "/dashboard",
      });
    } catch (e) {
      // next-auth throws a redirect on success; rethrow those
      if ((e as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw e;
      redirect("/login?error=1");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-ink-900 via-ink-900 to-brand-900 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="text-4xl font-extrabold tracking-tight text-white">
            HI<span className="text-brand-500">Q</span>M
          </div>
          <p className="mt-2 text-sm text-ink-400">
            HESEOS Intelligent Quotation Maker
          </p>
        </div>

        <form action={login} className="card space-y-4 p-6">
          <div>
            <label className="label">Email</label>
            <input name="email" type="email" required className="input" placeholder="you@company.in" />
          </div>
          <div>
            <label className="label">Password</label>
            <input name="password" type="password" required className="input" placeholder="••••••••" />
          </div>
          {error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
              Invalid email or password.
            </p>
          )}
          <button className="btn-primary w-full">Sign in</button>
          <div className="rounded-lg bg-ink-50 p-3 text-xs leading-5 text-ink-500">
            <p className="mb-1 font-semibold text-ink-700">Demo logins (pwd: demo1234)</p>
            <p>CEO - ceo@heseos.in</p>
            <p>Dealer - admin@acme.in</p>
            <p>SI - admin@voltedge.in</p>
          </div>
        </form>

        <p className="mt-6 text-center text-xs text-ink-500">
          Powered by HESEOS · Multi-tenant · DPDP-ready
        </p>
      </div>
    </main>
  );
}

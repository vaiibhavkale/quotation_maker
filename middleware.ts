export { auth as middleware } from "@/lib/auth";

export const config = {
  // Everything except: login, public quote pages, auth API, static assets
  matcher: ["/((?!login|q/|api/auth|_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
};

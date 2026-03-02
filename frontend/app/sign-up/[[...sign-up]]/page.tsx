import { redirect } from "next/navigation"

export default function SignUpFallbackPage() {
  redirect("/sign-in")
}

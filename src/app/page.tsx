import { redirect } from "next/navigation";

// Low-friction entry: opening the app drops you straight into the panel.
export default function Home() {
  redirect("/dashboard");
}

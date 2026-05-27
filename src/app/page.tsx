import Dashboard from "@/components/Dashboard";
import { requireCurrentUser } from "@/lib/auth";

export default async function Home() {
  const user = await requireCurrentUser();

  return <Dashboard user={user} />;
}

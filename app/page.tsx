import initialMessages from "@/data/messages.json";
import { Dashboard } from "@/components/dashboard";

export default function Home() {
  return <Dashboard initialMessages={initialMessages} />;
}

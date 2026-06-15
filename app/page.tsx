import initialMessages from "@/data/messages.json";
import { Dashboard } from "@/components/dashboard";
import { Suspense } from "react";

export default function Home() {
  return (
    <Suspense fallback={null}>
      <Dashboard initialMessages={initialMessages} />
    </Suspense>
  );
}

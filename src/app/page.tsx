import { connection } from "next/server";
import { TodayView } from "@/components/TodayView";

export default async function Home() {
  await connection(); // opt out of static rendering: a nonce only exists per request
  return <TodayView />;
}

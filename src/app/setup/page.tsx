import { connection } from "next/server";
import { SetupForm } from "@/components/SetupForm";

export default async function SetupPage() {
  await connection();
  return <SetupForm />;
}

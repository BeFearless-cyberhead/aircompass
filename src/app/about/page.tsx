import { connection } from "next/server";
import { AboutView } from "@/components/AboutView";

export default async function About() {
  await connection(); // the nonce is per request, so this page must not be a static shell
  return <AboutView />;
}

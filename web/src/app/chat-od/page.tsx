import type { Metadata } from "next";
import OdChatPage from "@/components/od-chat/od-chat-page";
export const metadata: Metadata = { title: "OnDemand chat (port)", description: "Ported OnDemand streaming chat — event parsing and bot message UI, side by side with /chat." };
export default function Page() {
  return <OdChatPage />;
}

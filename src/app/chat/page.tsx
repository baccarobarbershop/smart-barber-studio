import { ChatView } from "@/components/chat/ChatView";
import { Suspense } from "react";

export const metadata = {
  title: "Chat Virtual Assistant | Smart Barber Studio",
  description: "Prenota il tuo appuntamento parlando direttamente con l'assistente virtuale.",
};

export default function ChatPage() {
  return (
    <main className="h-dvh max-h-dvh overflow-hidden p-0 sm:py-4 sm:px-4 flex flex-col justify-start sm:justify-center items-center">
      <Suspense fallback={<div className="text-zinc-400 text-xs">Caricamento chat...</div>}>
        <ChatView />
      </Suspense>
    </main>
  );
}


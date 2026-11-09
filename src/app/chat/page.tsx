import { ChatView } from "@/components/chat/ChatView";
import { Suspense } from "react";

export const metadata = {
  title: "Chat Virtual Assistant | Smart Barber Studio",
  description: "Prenota il tuo appuntamento parlando direttamente con l'assistente virtuale.",
};

export default function ChatPage() {
  return (
    <main className="min-h-screen py-4 px-2 sm:px-4 flex flex-col justify-center items-center">
      <Suspense fallback={<div className="text-zinc-400 text-xs">Caricamento chat...</div>}>
        <ChatView />
      </Suspense>
    </main>
  );
}


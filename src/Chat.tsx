import { useState } from "react";

export interface Message {
  id: string;
  role: string | "system" | "user";
  content: string;
}

function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);

  return <div>Chat</div>;
}

export default Chat;

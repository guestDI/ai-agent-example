import { useState } from "react";

export default function App() {
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState("");

  async function askAgent() {
    const res = await fetch("http://localhost:3001/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: query })
    });
    const data = await res.json();
    setAnswer(data.answer);
  }

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold">AI Agent + Weather Tool</h1>
      <textarea
        id="prompt-input"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="text-gray w-full border border-gray-300 rounded-lg p-3 mb-4 bg-white 
    text-black"
        placeholder="Ask: What is the weather in Wroclaw?"
      />
      <button 
        onClick={askAgent} 
        className="bg-blue-500 text-white px-4 py-2 mt-2 rounded"
      >
        Ask
      </button>

      {answer && (
        <div className="mt-4">
          <strong>Answer:</strong>
          <p>{answer}</p>
        </div>
      )}
    </div>
  );
}

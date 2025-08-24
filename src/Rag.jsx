import { useState } from "react";

const Rag = () => {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);

  const askAgent = async () => {
    if (!question.trim()) return;
    setLoading(true);
    setAnswer("");

    try {
      const res = await fetch("http://localhost:3001/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: question }),
      });

      const data = await res.json();
      setAnswer(data.answer || "No answer received.");
    } catch (err) {
      console.error(err);
      setAnswer("⚠️ Error: Could not reach the agent.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen min-w-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="w-full max-w-2xl bg-white shadow-lg rounded-2xl p-8">
        <h1 className="text-2xl font-bold mb-4 text-gray-800">
          🚀 RAG Agent Demo
        </h1>
        <textarea
          id="input-prompt"
          rows={4}
          className="text-gray w-full border border-gray-300 rounded-lg p-3 mb-4 bg-white 
    text-black"
          placeholder="Ask me something about Docker & React..."
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <button
          onClick={askAgent}
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Thinking..." : "Ask Agent"}
        </button>

        {answer && (
          <div className="mt-6 p-4 bg-gray-100 rounded-lg border border-gray-300">
            <h2 className="font-semibold text-gray-700 mb-2">Answer:</h2>
            <p className="text-gray-800 whitespace-pre-line">{answer}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default Rag

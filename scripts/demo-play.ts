import readline from "node:readline";

const BASE = process.env.BASE_URL ?? "http://localhost:8787";
const PLAYER_ID = process.env.PLAYER_ID ?? "demo";

async function act(input: string) {
  const res = await fetch(`${BASE}/api/session/${PLAYER_ID}/act`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input }),
  });
  if (!res.ok) {
    console.error("Server error", res.status, await res.text());
    return;
  }
  const json = await res.json();
  console.log("Plan:", JSON.stringify(json.plan, null, 2));
  console.log("Result:", JSON.stringify(json.result, null, 2));
}

function main() {
  console.log(`Axiom Frontier demo. Server=${BASE}, player=${PLAYER_ID}`);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const prompt = () => rl.question("> ", async (line) => {
    if (!line.trim()) return prompt();
    if (line.trim().toLowerCase() === "exit") {
      rl.close();
      return;
    }
    try {
      await act(line.trim());
    } catch (e) {
      console.error("Request failed", (e as Error).message);
    }
    prompt();
  });
  prompt();
}

main();

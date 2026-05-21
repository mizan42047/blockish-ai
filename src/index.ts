import { config } from "config.js";
import { registerAssistantWebSocketServer } from "agent/callbacks/assistant.websocket.js";
import { createServer } from "./server.js";
import { createTables } from "setup.js";

const app = createServer();

async function main() {
  await createTables();

  const server = app.listen(config.port, () => {
    console.log(`Server listening on http://localhost:${config.port}`);
    console.log(
      `Assistant WebSocket listening on ws://localhost:${config.port}/assistant/ws`
    );
  });

  registerAssistantWebSocketServer(server);
}

main();

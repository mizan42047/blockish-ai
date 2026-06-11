import { setGlobalDispatcher, Agent } from "undici";
import { config } from "config.js";
import { createServer } from "./server.js";
import { createTables } from "setup.js";
import http from "http";
import { Server } from 'socket.io';

// Cloud Ollama models can take longer than the default 5-minute undici timeout
setGlobalDispatcher(new Agent({
    headersTimeout: 15 * 60 * 1000, // 15 minutes
    bodyTimeout: 20 * 60 * 1000,    // 20 minutes
}));

const app = createServer();
const server = http.createServer(app);
const io = new Server(server);

async function main() {
  await createTables();

  app.listen(config.port, () => {
    console.log(`Server listening on http://localhost:${config.port}`);
  });
}

main();

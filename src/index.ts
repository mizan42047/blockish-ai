import { config } from "config.js";
import { createServer } from "./server.js";
import { createTables } from "setup.js";
import http from "http";
import { Server } from 'socket.io';

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

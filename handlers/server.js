import { spawn } from "child_process";
import * as listener from "./listener.js";
import Logger from "./consoleHandler.js";

export default class Server {
  constructor(serverNum) {
    this.serverNum = serverNum;
    console.log("server: " + serverNum);
    this.#logger = new Logger(["serverHandler", `server ${serverNum}`]);
  }
  #logger;
  status = "offline";
  consoleLog = "";
  server = null;

  start() {
    return new Promise((resolve, reject) => {
      if (this.server) {
        return;
      }

      this.consoleLog = "";
      this.server = spawn(
        `${process.cwd()}/data/servers/${this.serverNum}/start.bat`
      );
      this.setServerStatus("starting");

      this.server.stdout.on("data", (data) => {
        data = data.toString();
        this.consoleLog += data;

        listener.emit("_consoleUpdate" + this.serverNum, data);

        this.#logger.info(data, "spawnLog");
        if (data.includes("Timings Reset")) {
          this.setServerStatus("online");
          resolve();
        }
        if (data.includes("UUID of player ")) {
          const dataArr = data.split(" ");
          listener.emit(
            "playerConnected",
            {
              name: dataArr[5],
              uuid: dataArr[7],
            },
            this.serverNum
          );
        }
        if (data.includes(" lost connection: ")) {
          const name = data.split(" ")[2];
          listener.emit("playerDisconnected", { name }, this.serverNum);
        }
      });
      this.server.on("close", (code) => {
        if (this.status != "online") reject();
        this.setServerStatus("offline");
        this.server = null;
      });
      this.server.stderr.on("data", (data) => {
        data = data.toString();
        this.#logger.error(data);
        listener.emit("_consoleUpdate" + this.serverNum, data);
      });
    });
  }
  async stop() {
    this.setServerStatus("stopping");
    this.server.stdin.write("stop\n");
    while (true) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (this.status == "offline") return;
    }
  }
  setServerStatus(newStatus) {
    if (this.status == "downloading" && newStatus != "offline") return;

    this.status = newStatus;
    listener.emit("_statusUpdate" + this.serverNum, newStatus);
    this.#logger.info("Server status is " + newStatus);
  }
}

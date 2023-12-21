import fs from "fs";
import https from "https";
import Logger from "./consoleHandler.js";
import Server from "./server.js";
import * as listener from "./listener.js";
import javaHandler from "./javaHandler.js";
import versionHandler from "./versionHandler.js";
const logger = new Logger(["serverHandler"]);
const servers = [];
let serverData;
export let ip;
export function totalServers() {
  return servers.length;
}
export async function init() {
  logger.info("Initializing...");
  initServerData();

  ip = await getIp();
  logger.info("Server ip: " + ip);

  const path = `${process.cwd()}/data`;

  if (!fs.existsSync(path + "/servers")) {
    fs.mkdirSync(path + "/servers");
    logger.info("Created server folder");
  }
  if (!fs.existsSync(path + "/backups")) {
    fs.mkdirSync(path + "/backups");
    logger.info("Created backup folder");
  }

  for (let i = 0; i < serverData.length; i++) {
    servers.push(new Server(i, serverData[i]));
    saveOnExit(servers[i]);
  }

  setTimeout(() => saveServerData(), 6e5); //every ten minutes
  logger.info("Initialized successfully");
}

function initServerData() {
  if (fs.existsSync("./data/serverData.json")) {
    try {
      serverData = JSON.parse(fs.readFileSync("./data/serverData.json"));
    } catch (err) {
      logger.error("Failed to load serverData...");
      logger.error(`-> ${err}`);
      process.exit(1);
    }
    logger.info("Successfully loaded serverData");
  } else {
    fs.writeFileSync("./data/serverData.json", "[]");
    serverData = [];
    logger.info(`Created serverData.json and filled it with []`);
  }
}

export function get(serverNum) {
  return servers[serverNum];
}

/**
 * Creates a new Minecraft server.
 * @param {serverHandler.data} data
 * @param {() => void} callbackOnFirstStart
 * @returns {Promise<void>}
 */

export function newServer(data, callbackOnFirstStart = null) {
  return new Promise(async (resolve, reject) => {
    const path = `${process.cwd()}/data/servers/${serverData.length}`;
    fs.mkdirSync(path);
    const currentServer = addServerObject(data);

    if (callbackOnFirstStart) callbackOnFirstStart();

    const javaVersion = javaHandler.getVersion(data.type, data.version);
    await javaHandler.downloadIfMissing(javaVersion);

    writeServerProperties(data, path);
    const url = versionHandler.getVersionData(data.type, data.version).url;
    await downloadServerJar(path, url);

    await currentServer.start().catch((e) => {
      logger.error("Failed to create server...");
      logger.error(e);
      reject();
      return;
    });

    await currentServer.shutdownHandler.stopServer();
    await currentServer.updateDirSize();
    saveServerData();
    saveOnExit(currentServer);
  });
}

/**
 *
 * @param {serverHandler.data} data
 */
function addServerObject(data) {
  const serverNum = serverData.length;
  serverData.push({
    ...data,
    creationDate: Date.now(),
    dirSize: 0,
  });
  const server = new Server(serverNum, serverData[serverNum], "downloading");
  servers.push(server);
  return server;
}

function downloadServerJar(path, url) {
  return new Promise((resolve) => {
    fs.writeFileSync(path + "/eula.txt", "eula=true");

    https.get(url, (res) => {
      const filePath = fs.createWriteStream(path + "/server.jar");
      res.pipe(filePath);
      filePath.on("finish", async () => {
        filePath.close();
        logger.info("Downloaded server jar");
        resolve();
      });
    });
  });
}

/**
 *
 * @param {Object} server
 * @param {serverHandler.data} data
 */
function writeServerProperties(data, serverPath) {
  let propertiesData = `motd=${data.name}\nquery.port=${data.port}\nserver-port=${data.port}\nspawn-protection=0\nview-distance=20\nsimulation-distance=20`;
  if (data.settings.difficulty)
    propertiesData += `difficulty=${data.settings.difficulty}\n`;
  if (data.settings.seed != "") {
    propertiesData += "\nlevel-seed=" + data.settings.seed;
  }
  if (data.settings.gamemode == "hardcore") {
    propertiesData += "\ngamemode=survival\nhardcore=true";
  } else {
    propertiesData += "\ngamemode=" + data.settings.gamemode;
  }
  fs.writeFileSync(serverPath + "/server.properties", propertiesData);
}

function saveOnExit(server) {
  server.on("statusUpdate", (newStatus) => {
    if (newStatus == "offline") saveServerData();
  });
}

export function deleteServer(serverNum) {
  return new Promise(async (resolve) => {
    const server = get(serverNum);
    if (!server)
      logger.exitWithError("Tried to delete server that doesn't exist...");
    await server.deleteFiles();
    delete serverData[serverNum];
    saveServerData();
    delete servers[serverNum];
    logger.info(`Deleted server ${serverNum}`);
    resolve();
  });
}

listener.on("saveServerData", () => saveServerData());

export async function saveServerData() {
  fs.writeFileSync(
    "./data/serverData.json",
    JSON.stringify(serverData, null, 2),
    (err) => {
      if (err) throw err;
    }
  );
}

function getIp() {
  return new Promise((resolve) => {
    https.get("https://ipv4.icanhazip.com/", (res) => {
      let body = "";

      res.on("data", (chunk) => {
        body += chunk;
      });

      res.on("end", () => {
        resolve(body.trim());
      });
    });
  });
}

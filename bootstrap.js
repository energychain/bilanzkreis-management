// bootstrap.js
"use strict";

const path = require("path");
const { existsSync } = require("fs");

// Bestimme den Pfad zur .env Datei
const envPath = path.resolve(process.cwd(), ".env");

// Prüfe ob .env existiert und lade sie
if (existsSync(envPath)) {
    require("dotenv").config({ path: envPath });
} else {
    console.warn("No .env file found in root directory");
    // Optional: Lade Default-Konfiguration
    require("dotenv").config({ path: path.resolve(process.cwd(), ".env.example") });
}

// Exportiere eine Funktion zur Validierung der erforderlichen Umgebungsvariablen
module.exports.validateEnv = () => {
    const required = [
        "NODE_ENV",
        "MONGODB_URI",
        "NATS_URL",
        "MOLECULER_NAMESPACE"
    ];

    const missing = required.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
        throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
    }
};

// Exportiere häufig verwendete Konfigurationswerte
module.exports.config = {
    env: process.env.NODE_ENV || "development",
    serviceName: process.env.SERVICE_NAME || "bilanzkreis-management",
    mongodb: {
        uri: process.env.MONGODB_URI,
        options: {
            user: process.env.MONGODB_USER,
            pass: process.env.MONGODB_PASSWORD,
            authSource: process.env.MONGODB_AUTH_SOURCE,
            replicaSet: process.env.MONGODB_REPLICA_SET,
            ssl: process.env.MONGODB_SSL === "true",
        }
    },
    nats: {
        url: process.env.NATS_URL,
        user: process.env.NATS_USER,
        pass: process.env.NATS_PASSWORD,
        token: process.env.NATS_TOKEN,
        clusterId: process.env.NATS_CLUSTER_ID
    },
    jwt: {
        secret: process.env.JWT_SECRET,
        expiresIn: process.env.JWT_EXPIRATION
    },
    logging: {
        level: process.env.LOG_LEVEL || "info",
        format: process.env.LOG_FORMAT || "json",
        timestamp: process.env.LOGGER_TIMESTAMP === "true"
    }
};
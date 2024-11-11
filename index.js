// index.js
"use strict";

const { ServiceBroker } = require("moleculer");
const { validateEnv, config } = require("./bootstrap");

// Validiere Umgebungsvariablen bevor die Anwendung startet
validateEnv();

// Erstelle den ServiceBroker
const broker = new ServiceBroker({
    namespace: config.serviceName,
    transporter: config.nats.url,
    logger: config.logging,
    // Weitere Moleculer-Konfiguration...
});

// Lade alle Services
broker.loadServices("./services", "**/*.service.js");

// Starte den Broker
broker.start()
    .then(() => {
        broker.logger.info("All services started successfully");
    })
    .catch(err => {
        broker.logger.error("Error starting services:", err);
        process.exit(1);
    });

// Handle process termination
process.on("SIGTERM", () => {
    broker.stop()
        .then(() => {
            process.exit(0);
        });
});
// services/transaction/transaction.service.js
"use strict";

const DbService = require("moleculer-db");
const MongoDBAdapter = require("moleculer-db-adapter-mongo");
const { config } = require("../../bootstrap");
const { MoleculerError } = require("moleculer").Errors;

module.exports = {
    name: "transaction",
    mixins: [DbService],

    adapter: new MongoDBAdapter(config.mongodb.uri),
    collection: "transactions",

    settings: {
        fields: [
            "_id",
            "name",
            "tenantId",
            "sourceId",
            "destinationId",
            "startTime",
            "endTime",
            "energyAmount",
            "status",
            "createdAt",
            "updatedAt"
        ]
    },

    actions: {
        create: {
            // Parameter-Definition entsprechend der tatsächlichen Eingabedaten
            params: {
                name: "string",
                sourceId: "string",
                destinationId: "string",
                startTime: { 
                    type: "any", 
                    convert: true,
                    custom: (value) => value instanceof Date || new Date(value)
                },
                endTime: { 
                    type: "any",
                    convert: true,
                    custom: (value) => value instanceof Date || new Date(value)
                },
                energyAmount: "number",
                tenantId: "string"
            },
            async handler(ctx) {
                const { sourceId, destinationId, tenantId, startTime, endTime, energyAmount } = ctx.params;

                // Validiere Zeitbereich
                if (startTime >= endTime) {
                    throw new MoleculerError(
                        "Start time must be before end time",
                        400,
                        "VALIDATION_ERROR"
                    );
                }

                // Validiere Energiemenge
                if (energyAmount <= 0) {
                    throw new MoleculerError(
                        "Energy amount must be positive",
                        400,
                        "VALIDATION_ERROR"
                    );
                }

                // Hole und validiere die Balance Groups
                const [source, destination] = await Promise.all([
                    ctx.call("balance-group.findById", { 
                        id: sourceId,
                        tenantId: tenantId 
                    }),
                    ctx.call("balance-group.findById", { 
                        id: destinationId,
                        tenantId: tenantId 
                    })
                ]);

                if (!source || !destination) {
                    throw new MoleculerError(
                        "Balance group not found",
                        404,
                        "NOT_FOUND"
                    );
                }

                if (source.tenantId !== tenantId || destination.tenantId !== tenantId) {
                    throw new MoleculerError(
                        "Invalid balance groups",
                        400,
                        "VALIDATION_ERROR"
                    );
                }

                // Prüfe ob Bilanzkreise finalisiert sind
                if (source.status === "final" || destination.status === "final") {
                    throw new MoleculerError(
                        "Cannot create transaction for finalized balance group",
                        400,
                        "VALIDATION_ERROR"
                    );
                }

                const doc = {
                    ...ctx.params,
                    status: "provisional",
                    createdAt: new Date(),
                    updatedAt: new Date()
                };

                const result = await this.adapter.insert(doc);
                return result;
            }
        },

        get: {
            params: {
                id: "string",
                tenantId: "string"
            },
            async handler(ctx) {
                const doc = await this.adapter.findOne({
                    _id: this.adapter.stringToObjectID(ctx.params.id),
                    tenantId: ctx.params.tenantId
                });

                if (!doc) {
                    // Wenn tenantId nicht stimmt, geben wir Invalid Tenant zurück
                    const exists = await this.adapter.findById(ctx.params.id);
                    if (exists && exists.tenantId !== ctx.params.tenantId) {
                        throw new MoleculerError(
                            "Invalid tenant",
                            403,
                            "INVALID_TENANT"
                        );
                    }
                    throw new MoleculerError(
                        "Transaction not found",
                        404,
                        "NOT_FOUND"
                    );
                }

                return doc;
            }
        },

        list: {
            params: {
                query: { type: "object", optional: true },
                tenantId: "string"
            },
            async handler(ctx) {
                const query = {
                    ...ctx.params.query,
                    tenantId: ctx.params.tenantId
                };
                return this.adapter.find({ query });
            }
        },

        finalize: {
            params: {
                id: "string",
                tenantId: "string"
            },
            async handler(ctx) {                
                
                const result = await this.adapter.updateById(ctx.params.id, {
                    $set: {
                        status: "final",
                        updatedAt: new Date()
                    }
                });

                // Event mit vollständigen Parametern emittieren
                this.broker.broadcast("transaction.finalized", {
                    id: ctx.params.id,
                    tenantId: ctx.params.tenantId
                });

                console.log("Transaction finalized, event broadcasted");
                return result;
            }
        },

        getIntervals: {
            params: {
                id: { type: "string" },
                tenantId: { type: "string" }
            },
            async handler(ctx) {
                const doc = await this.adapter.findOne({
                    _id: this.adapter.stringToObjectID(ctx.params.id),
                    tenantId: ctx.params.tenantId
                });

                if (!doc) {
                    throw new MoleculerError(
                        "Transaction not found",
                        404,
                        "NOT_FOUND"
                    );
                }

                return this.splitIntoIntervals(doc.startTime, doc.endTime, doc.energyAmount);
            }
        }
    },

    methods: {
        splitIntoIntervals(startTime, endTime, totalEnergy) {
            const intervals = [];
            const intervalMs = 15 * 60 * 1000; // 15 Minuten in Millisekunden
            const durationMs = endTime.getTime() - startTime.getTime();
            const numberOfIntervals = Math.ceil(durationMs / intervalMs);
            const energyPerInterval = totalEnergy / numberOfIntervals;

            let currentTime = new Date(startTime);

            while (currentTime < endTime) {
                const intervalEnd = new Date(Math.min(
                    currentTime.getTime() + intervalMs,
                    endTime.getTime()
                ));

                intervals.push({
                    startTime: new Date(currentTime),
                    endTime: intervalEnd,
                    energyAmount: energyPerInterval
                });

                currentTime = new Date(intervalEnd);
            }

            return intervals;
        }
    }
};
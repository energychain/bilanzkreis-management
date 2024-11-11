// services/settlement/settlement.service.js
"use strict";

const DbService = require("moleculer-db");
const MongoDBAdapter = require("moleculer-db-adapter-mongo");
const { config } = require("../../bootstrap");
const { MoleculerError } = require("moleculer").Errors;

module.exports = {
    name: "settlement",
    mixins: [DbService],

    adapter: new MongoDBAdapter(config.mongodb.uri),
    collection: "settlements",

    settings: {
        fields: [
            "_id",
            "transactionId",
            "balanceGroupId",
            "targetGroupId",
            "tenantId",
            "energyAmount",
            "status",
            "interval",
            "createdAt",
            "updatedAt"
        ]
    },

    actions: {
        findByTransaction: {
            params: {
                transactionId: "string",
                tenantId: "string"
            },
            async handler(ctx) {                
                return this.adapter.find({
                    query: {
                        transactionId: ctx.params.transactionId,
                        tenantId: ctx.params.tenantId
                    }
                });
            }
        },
        calculateSettlement: {
            params: {
                transactionId: "string",
                tenantId: "string"
            },
            async handler(ctx) {
                try {
                    // 1. Prüfe und hole die Transaktion
                    const transaction = await ctx.call("transaction.get", {
                        id: ctx.params.transactionId,
                        tenantId: ctx.params.tenantId
                    });

                    if (!transaction) {
                        throw new MoleculerError(
                            "Invalid tenant",
                            403,
                            "INVALID_TENANT"
                        );
                    }

                    if (transaction.status === "final") {
                        throw new MoleculerError(
                            "Transaction is already finalized",
                            400,
                            "VALIDATION_ERROR"
                        );
                    }

                    // 2. Prüfe auf bereits existierende Settlements
                    const existingSettlements = await this.adapter.find({
                        query: {
                            transactionId: ctx.params.transactionId,
                            tenantId: ctx.params.tenantId
                        }
                    });

                    if (existingSettlements.length > 0) {
                        return existingSettlements;
                    }

                    // 3. Hole die beteiligten Bilanzkreise
                    const [source, destination] = await Promise.all([
                        ctx.call("balance-group.findById", {
                            id: transaction.sourceId,
                            tenantId: ctx.params.tenantId
                        }),
                        ctx.call("balance-group.findById", {
                            id: transaction.destinationId,
                            tenantId: ctx.params.tenantId
                        })
                    ]);

                    if (!source || !destination) {
                        throw new MoleculerError(
                            "Balance groups not found",
                            404,
                            "NOT_FOUND"
                        );
                    }

                    // 4. Prüfe ob die Bilanzkreise zum selben Mandanten gehören
                    if (source.tenantId !== ctx.params.tenantId || 
                        destination.tenantId !== ctx.params.tenantId) {
                        throw new MoleculerError(
                            "Invalid tenant",
                            403,
                            "INVALID_TENANT"
                        );
                    }

                    // 5. Berechne die 15-Minuten-Intervalle
                    const intervals = this.splitIntoIntervals(
                        transaction.startTime,
                        transaction.endTime,
                        transaction.energyAmount
                    );

                    const settlementsToCreate = [];

                    // 6. Erstelle Settlements für jedes Intervall
                    for (const interval of intervals) {
                        // Source Settlement (wenn eine Settlement Rule existiert)
                        if (source.settlementRule) {
                            settlementsToCreate.push({
                                transactionId: transaction._id.toString(),
                                balanceGroupId: source._id.toString(),
                                targetGroupId: source.settlementRule,
                                tenantId: ctx.params.tenantId,
                                energyAmount: interval.energyAmount,
                                status: "provisional",
                                interval: {
                                    startTime: interval.startTime,
                                    endTime: interval.endTime
                                },
                                createdAt: new Date(),
                                updatedAt: new Date()
                            });
                        }

                        // Destination Settlement (wenn eine Settlement Rule existiert)
                        if (destination.settlementRule) {
                            settlementsToCreate.push({
                                transactionId: transaction._id.toString(),
                                balanceGroupId: destination._id.toString(),
                                targetGroupId: destination.settlementRule,
                                tenantId: ctx.params.tenantId,
                                energyAmount: -interval.energyAmount, // Negativ für den Ziel-Bilanzkreis
                                status: "provisional",
                                interval: {
                                    startTime: interval.startTime,
                                    endTime: interval.endTime
                                },
                                createdAt: new Date(),
                                updatedAt: new Date()
                            });
                        }
                    }

                    // 7. Speichere die Settlements in der Datenbank
                    if (settlementsToCreate.length > 0) {
                        await this.adapter.insertMany(settlementsToCreate);
                        // Hole die tatsächlich gespeicherten Settlements
                        return this.adapter.find({
                            query: {
                                transactionId: ctx.params.transactionId,
                                tenantId: ctx.params.tenantId
                            }
                        });
                    }

                    // 8. Gebe die erstellten Settlements zurück
                    return settlementsToCreate;

                } catch (err) {
                    // 9. Fehlerbehandlung
                    if (err.type === "NOT_FOUND" || err.code === 404) {
                        throw new MoleculerError(
                            "Invalid tenant",
                            403,
                            "INVALID_TENANT"
                        );
                    }
                    // Werfe andere Fehler weiter
                    throw err;
                }
            },
        },

        finalizeSettlement: {
            params: {
                id: "string",
                tenantId: "string"
            },
            async handler(ctx) {
                console.log("Executing finalizeSettlement", ctx.params);
                // Konvertiere id zu transactionId für die interne Verwendung
                const transactionId = ctx.params.id;

                // Update alle zugehörigen Settlements
                await this.adapter.updateMany(
                    {
                        transactionId: transactionId,
                        tenantId: ctx.params.tenantId,
                        status: "provisional"
                    },
                    {
                        $set: {
                            status: "final",
                            updatedAt: new Date()
                        }
                    }
                );

                // Verifiziere das Update
                const updatedSettlements = await this.adapter.find({
                    query: {
                        transactionId: transactionId,
                        tenantId: ctx.params.tenantId
                    }
                });

                console.log("Updated settlements:", updatedSettlements);
                return updatedSettlements;
            }       
        },
        getBalance: {
            params: {
                balanceGroupId: "string",
                startTime: "date",
                endTime: "date",
                tenantId: "string"
            },
            async handler(ctx) {
                const { balanceGroupId, startTime, endTime, tenantId } = ctx.params;

                // 1. Hole und verarbeite alle Transaktionen
                const transactions = await ctx.call("transaction.list", {
                    tenantId,
                    query: {
                        $or: [
                            { sourceId: balanceGroupId },
                            { destinationId: balanceGroupId }
                        ],
                        startTime: { $gte: startTime },
                        endTime: { $lte: endTime }
                    }
                });

                // 2. Berechne Settlements für jede Transaktion
                for (const tx of transactions) {
                    await this.actions.calculateSettlement({
                        transactionId: tx._id.toString(),
                        tenantId
                    });
                }

                // 3. Hole aktuelle Settlements
                const settlements = await this.adapter.find({
                    query: {
                        balanceGroupId,
                        tenantId,
                        "interval.startTime": { $gte: startTime },
                        "interval.endTime": { $lte: endTime }
                    }
                });

                const intervals = {};
                let totalAmount = 0;

                // 4. Summiere die Beträge mit korrekten Vorzeichen
                settlements.forEach(s => {
                    const key = s.interval.startTime.toISOString();
                    if (!intervals[key]) {
                        intervals[key] = {
                            startTime: s.interval.startTime,
                            endTime: s.interval.endTime,
                            amount: 0
                        };
                    }
                    // Für source-settlements das Vorzeichen umkehren
                    const effectiveAmount = -s.energyAmount; // Umkehrung des Vorzeichens
                    intervals[key].amount += effectiveAmount;
                    totalAmount += effectiveAmount;
                });

                return {
                    balanceGroupId,
                    totalAmount,
                    intervals: Object.values(intervals)
                        .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
                };
            }
        }
    },
    methods: {
        splitIntoIntervals(startTime, endTime, totalEnergy) {
            const intervals = [];
            const intervalMs = 15 * 60 * 1000;
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

                currentTime = intervalEnd;
            }

            return intervals;
        }
    },
    events: {
        "transaction.finalized": {
            async handler(ctx) {
                console.log("Received transaction.finalized event", ctx.params);
                await this.actions.finalizeSettlement(ctx.params);
            }
        }
    }
};
// services/validation/validation.service.js
"use strict";

const { MoleculerError } = require("moleculer").Errors;

module.exports = {
    name: "validation",

    settings: {
        // Zeitintervall-Einstellungen
        intervalSettings: {
            duration: 15 * 60 * 1000, // 15 Minuten in Millisekunden
            validateAlignment: true    // Prüfe ob Zeitintervalle korrekt ausgerichtet sind
        }
    },

    actions: {
        /**
         * Validiere eine neue Bilanzgruppe
         */
        validateBalanceGroup: {
            params: {
                name: "string",
                startTime: "date",
                endTime: "date",
                settlementRule: { type: "string", optional: true },
                tenantId: "string"
            },
            async handler(ctx) {
                const { startTime, endTime, settlementRule, tenantId } = ctx.params;

                // Prüfe Zeitraum
                if (startTime >= endTime) {
                    throw new MoleculerError(
                        "Start time must be before end time",
                        400,
                        "INVALID_TIMEFRAME"
                    );
                }

                // Prüfe ob Start- und Endzeit auf 15-Minuten-Intervalle ausgerichtet sind
                if (this.settings.intervalSettings.validateAlignment) {
                    if (!this.isTimeAlignedToInterval(startTime) || 
                        !this.isTimeAlignedToInterval(endTime)) {
                        throw new MoleculerError(
                            "Time must be aligned to 15-minute intervals",
                            400,
                            "INVALID_TIME_ALIGNMENT"
                        );
                    }
                }

                // Prüfe Settlement Rule, falls angegeben
                if (settlementRule) {
                    const rule = await ctx.call("balance-group.get", {
                        id: settlementRule,
                        tenantId
                    });

                    if (!rule) {
                        throw new MoleculerError(
                            "Settlement rule refers to non-existent balance group",
                            400,
                            "INVALID_SETTLEMENT_RULE"
                        );
                    }

                    // Prüfe ob die Settlement Rule zum selben Mandanten gehört
                    if (rule.tenantId !== tenantId) {
                        throw new MoleculerError(
                            "Settlement rule must belong to the same tenant",
                            400,
                            "INVALID_TENANT_REFERENCE"
                        );
                    }
                }

                return { valid: true };
            }
        },

        /**
         * Validiere eine neue Transaktion
         */
        validateTransaction: {
            params: {
                sourceId: "string",
                destinationId: "string",
                startTime: "date",
                endTime: "date",
                energyAmount: "number",
                tenantId: "string"
            },
            async handler(ctx) {
                const { sourceId, destinationId, startTime, endTime, energyAmount, tenantId } = ctx.params;

                // Prüfe Zeitraum
                if (startTime >= endTime) {
                    throw new MoleculerError(
                        "Start time must be before end time",
                        400,
                        "INVALID_TIMEFRAME"
                    );
                }

                // Prüfe Energiemenge
                if (energyAmount <= 0) {
                    throw new MoleculerError(
                        "Energy amount must be positive",
                        400,
                        "INVALID_ENERGY_AMOUNT"
                    );
                }

                // Prüfe Zeitintervall-Ausrichtung
                if (this.settings.intervalSettings.validateAlignment) {
                    if (!this.isTimeAlignedToInterval(startTime) || 
                        !this.isTimeAlignedToInterval(endTime)) {
                        throw new MoleculerError(
                            "Time must be aligned to 15-minute intervals",
                            400,
                            "INVALID_TIME_ALIGNMENT"
                        );
                    }
                }

                // Hole Bilanzkreise
                const [source, destination] = await Promise.all([
                    ctx.call("balance-group.get", { id: sourceId }),
                    ctx.call("balance-group.get", { id: destinationId })
                ]);

                // Prüfe ob Bilanzkreise existieren
                if (!source || !destination) {
                    throw new MoleculerError(
                        "Source or destination balance group not found",
                        400,
                        "INVALID_BALANCE_GROUP"
                    );
                }

                // Prüfe Mandantenzugehörigkeit
                if (source.tenantId !== tenantId || destination.tenantId !== tenantId) {
                    throw new MoleculerError(
                        "Balance groups must belong to the same tenant",
                        400,
                        "INVALID_TENANT_REFERENCE"
                    );
                }

                // Prüfe Zeitraum gegen Bilanzkreis-Gültigkeit
                if (startTime < source.startTime || endTime > source.endTime ||
                    startTime < destination.startTime || endTime > destination.endTime) {
                    throw new MoleculerError(
                        "Transaction timeframe must be within balance group validity",
                        400,
                        "INVALID_TIMEFRAME"
                    );
                }

                // Prüfe Status der Bilanzkreise
                if (source.status === "final" || destination.status === "final") {
                    throw new MoleculerError(
                        "Cannot create transaction for finalized balance groups",
                        400,
                        "INVALID_BALANCE_GROUP_STATUS"
                    );
                }

                return { valid: true };
            }
        },

        /**
         * Validiere Settlement-Berechnungen
         */
        validateSettlement: {
            params: {
                balanceGroupId: "string",
                targetGroupId: "string",
                energyAmount: "number",
                interval: {
                    type: "object",
                    props: {
                        startTime: "date",
                        endTime: "date"
                    }
                },
                tenantId: "string"
            },
            async handler(ctx) {
                const { balanceGroupId, targetGroupId, energyAmount, interval, tenantId } = ctx.params;

                // Prüfe ob alle beteiligten Bilanzkreise existieren und zum selben Mandanten gehören
                const [source, target] = await Promise.all([
                    ctx.call("balance-group.get", { id: balanceGroupId }),
                    ctx.call("balance-group.get", { id: targetGroupId })
                ]);

                if (!source || !target) {
                    throw new MoleculerError(
                        "Balance groups not found",
                        400,
                        "INVALID_BALANCE_GROUP"
                    );
                }

                if (source.tenantId !== tenantId || target.tenantId !== tenantId) {
                    throw new MoleculerError(
                        "Settlement must be within the same tenant",
                        400,
                        "INVALID_TENANT_REFERENCE"
                    );
                }

                // Prüfe Zeitintervall
                if (!this.isTimeAlignedToInterval(interval.startTime) ||
                    !this.isTimeAlignedToInterval(interval.endTime)) {
                    throw new MoleculerError(
                        "Settlement intervals must be aligned to 15-minute intervals",
                        400,
                        "INVALID_TIME_ALIGNMENT"
                    );
                }

                return { valid: true };
            }
        }
    },

    methods: {
        /**
         * Prüft ob ein Zeitpunkt auf ein 15-Minuten-Intervall ausgerichtet ist
         */
        isTimeAlignedToInterval(time) {
            const date = new Date(time);
            const minutes = date.getUTCMinutes();
            return minutes % 15 === 0 && date.getUTCSeconds() === 0 && date.getUTCMilliseconds() === 0;
        },

        /**
         * Berechnet den Start des nächsten 15-Minuten-Intervalls
         */
        getNextIntervalStart(time) {
            const date = new Date(time);
            const minutes = date.getUTCMinutes();
            const remainingMinutes = 15 - (minutes % 15);
            date.setUTCMinutes(minutes + remainingMinutes, 0, 0);
            return date;
        },

        /**
         * Prüft ob ein Zeitraum vollständige 15-Minuten-Intervalle enthält
         */
        validateTimeframeIntervals(startTime, endTime) {
            const duration = endTime.getTime() - startTime.getTime();
            return duration % (15 * 60 * 1000) === 0;
        }
    },

    events: {
        // Ereignisbehandlung für verschiedene Validierungsereignisse
        "validation.failed"(ctx) {
            this.broker.logger.warn("Validation failed:", ctx.params);
        }
    },

    created() {
        this.logger.info("Validation service created");
    },

    started() {
        this.logger.info("Validation service started");
    }
};
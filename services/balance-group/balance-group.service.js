// services/balance-group/balance-group.service.js
"use strict";

const DbService = require("moleculer-db");
const MongoDBAdapter = require("moleculer-db-adapter-mongo");
const { config } = require("../../bootstrap");
const { MoleculerError } = require("moleculer").Errors;

module.exports = {
    name: "balance-group",
    mixins: [DbService],

    adapter: new MongoDBAdapter(config.mongodb.uri),
    collection: "balance_groups",

    settings: {
        fields: [
            "_id", 
            "name", 
            "tenantId",
            "startTime", 
            "endTime", 
            "status", 
            "settlementRule",
            "createdAt",
            "updatedAt"
        ]
    },

    actions: {
        create: {
            params: {
                name: { type: "string", min: 2 },
                tenantId: { type: "string" },
                startTime: { type: "date" },
                endTime: { type: "date" },
                settlementRule: { type: "string", optional: true }
            },
            async handler(ctx) {
                if (ctx.params.startTime >= ctx.params.endTime) {
                    throw new MoleculerError(
                        "Start time must be before end time",
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

        // Umbenennen von 'get' zu 'findById'
        findById: {
            async handler(ctx) {
                const doc = await this.adapter.findById(ctx.params.id);
                
                if (!doc || doc.tenantId !== ctx.params.tenantId) {
                    throw new MoleculerError(
                        "Balance group not found",
                        404,
                        "NOT_FOUND"
                    );
                }

                return doc;
            }
        },

        listByTenant: {
            params: {
                tenantId: { type: "string" }
            },
            async handler(ctx) {
                return this.adapter.find({
                    query: {
                        tenantId: ctx.params.tenantId
                    }
                });
            }
        },

        // Umbenennen von 'close' zu 'setFinal'
        setFinal: {
            async handler(ctx) {
                const doc = await this.adapter.findById(ctx.params.id);

                if (!doc || doc.tenantId !== ctx.params.tenantId) {
                    throw new MoleculerError(
                        "Balance group not found",
                        404,
                        "NOT_FOUND"
                    );
                }

                if (doc.status === "final") {
                    throw new MoleculerError(
                        "Balance group is already closed",
                        400,
                        "VALIDATION_ERROR"
                    );
                }

                const result = await this.adapter.updateById(ctx.params.id, {
                    $set: {
                        status: "final",
                        updatedAt: new Date()
                    }
                });

                return result;
            }
        }
    }
};
// services/tenant/tenant.service.js
"use strict";

const DbService = require("moleculer-db");
const MongoDBAdapter = require("moleculer-db-adapter-mongo");
const { config } = require("../../bootstrap");

module.exports = {
    name: "tenant",
    mixins: [DbService],

    adapter: new MongoDBAdapter(config.mongodb.uri),
    collection: "tenants",

    settings: {
        fields: ["_id", "name", "identifier", "status", "settings", "createdAt", "updatedAt"],
        entityValidator: {
            name: "string",
            identifier: "string",
            status: { type: "enum", values: ["active", "inactive"] },
            settings: { type: "object", optional: true }
        }
    },

    actions: {
        create: {
            params: {
                name: "string",
                identifier: "string",
                settings: { type: "object", optional: true }
            },
            async handler(ctx) {
                const tenant = await this.adapter.insert({
                    ...ctx.params,
                    status: "active",
                    createdAt: new Date(),
                    updatedAt: new Date()
                });
                this.broker.emit("tenant.created", { tenant });
                return tenant;
            }
        },

        update: {
            params: {
                id: "string",
                name: { type: "string", optional: true },
                settings: { type: "object", optional: true }
            },
            async handler(ctx) {
                const tenant = await this.adapter.updateById(ctx.params.id, {
                    $set: {
                        ...ctx.params,
                        updatedAt: new Date()
                    }
                });
                this.broker.emit("tenant.updated", { tenant });
                return tenant;
            }
        },

        setStatus: {
            params: {
                id: "string",
                status: { type: "enum", values: ["active", "inactive"] }
            },
            async handler(ctx) {
                const tenant = await this.adapter.updateById(ctx.params.id, {
                    $set: {
                        status: ctx.params.status,
                        updatedAt: new Date()
                    }
                });
                this.broker.emit("tenant.status.changed", { tenant });
                return tenant;
            }
        }
    },

    methods: {
        async validateTenant(id) {
            const tenant = await this.adapter.findById(id);
            if (!tenant) throw new Error("Tenant not found");
            if (tenant.status !== "active") throw new Error("Tenant is not active");
            return tenant;
        }
    },

    events: {
        "tenant.created"(ctx) {
            this.broker.logger.info("New tenant created:", ctx.params.tenant);
        },
        "tenant.updated"(ctx) {
            this.broker.logger.info("Tenant updated:", ctx.params.tenant);
        },
        "tenant.status.changed"(ctx) {
            this.broker.logger.info("Tenant status changed:", ctx.params.tenant);
        }
    }
};
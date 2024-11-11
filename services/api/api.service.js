// services/api/api.service.js
"use strict";

const ApiGateway = require("moleculer-web");
const { UnAuthorizedError } = ApiGateway.Errors;
const jwt = require("jsonwebtoken");
const { config } = require("../../bootstrap");

module.exports = {
    name: "api",
    mixins: [ApiGateway],

    settings: {
        port: process.env.API_PORT || 3000,
        
        // Global CORS settings
        cors: {
            origin: "*",
            methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
            credentials: true,
            maxAge: 3600
        },

        // Global rate limit
        rateLimit: {
            window: 60 * 1000, // 1 minute
            limit: 60,
            headers: true
        },

        // Request body parsing
        bodyParsers: {
            json: { limit: "1MB" },
            urlencoded: { extended: true, limit: "1MB" }
        },

        // Routes
        routes: [
            {
                path: "/api",
                whitelist: [
                    // Access to any actions in all services under "/api" URL
                    "**"
                ],
                authentication: true,
                authorization: true,

                // Route-level CORS settings
                cors: {
                    origin: "*",
                    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
                },

                aliases: {
                    // Tenant endpoints
                    "POST /tenants": "tenant.create",
                    "GET /tenants": "tenant.list",
                    "GET /tenants/:id": "tenant.get",
                    "PUT /tenants/:id": "tenant.update",
                    "PUT /tenants/:id/status": "tenant.setStatus",

                    // Balance Group endpoints
                    "POST /balance-groups": "balance-group.create",
                    "GET /balance-groups": "balance-group.list",
                    "GET /balance-groups/:id": "balance-group.get",
                    "PUT /balance-groups/:id": "balance-group.update",
                    "PUT /balance-groups/:id/close": "balance-group.close",
                    "GET /balance-groups/:id/summary": "balance-group.getSummary",

                    // Transaction endpoints
                    "POST /transactions": "transaction.create",
                    "GET /transactions": "transaction.list",
                    "GET /transactions/:id": "transaction.get",
                    "PUT /transactions/:id": "transaction.update",
                    "PUT /transactions/:id/finalize": "transaction.finalize",

                    // Settlement endpoints
                    "GET /settlements": "settlement.list",
                    "GET /settlements/:id": "settlement.get",
                    "GET /balance-groups/:id/settlement-balance": {
                        action: "settlement.getSettlementBalance",
                        params: {
                            balanceGroupId: "params.id",
                            startTime: "query.startTime",
                            endTime: "query.endTime"
                        }
                    }
                },

                // Parameter validation
                param: {
                    id: "string"
                },

                // Call options
                callOptions: {
                    timeout: 3000,
                    retries: 3
                },

                // Error handling
                onError(req, res, err) {
                    this.logger.error("API Gateway error:", err);
                    
                    // Handle different error types
                    if (err instanceof UnAuthorizedError) {
                        res.setHeader("Content-Type", "application/json");
                        res.writeHead(401);
                        res.end(JSON.stringify({
                            code: 401,
                            message: "Unauthorized",
                            type: "AUTH_ERROR"
                        }));
                        return;
                    }

                    // Default error handling
                    res.setHeader("Content-Type", "application/json");
                    res.writeHead(err.code || 500);
                    res.end(JSON.stringify({
                        code: err.code || 500,
                        message: err.message,
                        type: err.type || "UNKNOWN_ERROR"
                    }));
                }
            },

            // Swagger UI route
            {
                path: "/api/documentation",
                authorization: false,
                authentication: false,
                
                aliases: {
                    "GET /": "api.swagger"
                }
            }
        ]
    },

    methods: {
        /**
         * Authentication middleware
         */
        async authenticate(ctx, route, req) {
            const auth = req.headers["authorization"];
            
            if (!auth || !auth.startsWith("Bearer ")) {
                throw new UnAuthorizedError("Missing or invalid token");
            }

            const token = auth.slice(7);
            
            try {
                // Verify JWT token
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                
                // Add user info to context meta
                ctx.meta.user = decoded;
                
                // Extract and validate tenant ID
                const tenantId = req.headers["x-tenant-id"];
                if (!tenantId) {
                    throw new UnAuthorizedError("Missing tenant ID");
                }

                // Validate tenant ID belongs to user
                if (!decoded.tenants.includes(tenantId)) {
                    throw new UnAuthorizedError("Invalid tenant ID");
                }

                ctx.meta.tenantId = tenantId;
                
                return decoded;
            } catch (err) {
                throw new UnAuthorizedError("Invalid token");
            }
        },

        /**
         * Authorization middleware
         */
        async authorize(ctx, route, req) {
            const user = ctx.meta.user;

            // Check if user has required role/permission
            if (!user || !user.roles) {
                throw new UnAuthorizedError("Unauthorized");
            }

            // Add your authorization logic here
            // Example: Check if user has admin role for tenant management
            if (req.url.startsWith("/api/tenants") && !user.roles.includes("admin")) {
                throw new UnAuthorizedError("Insufficient permissions");
            }

            return true;
        },

        /**
         * Generate Swagger documentation
         */
        swagger() {
            return {
                openapi: "3.0.0",
                info: {
                    title: "Bilanzkreis Management API",
                    version: "1.0.0",
                    description: "API for managing balance groups and energy transactions"
                },
                servers: [
                    {
                        url: `http://localhost:${this.settings.port}/api`,
                        description: "Development server"
                    }
                ],
                components: {
                    securitySchemes: {
                        bearerAuth: {
                            type: "http",
                            scheme: "bearer",
                            bearerFormat: "JWT"
                        },
                        tenantHeader: {
                            type: "apiKey",
                            in: "header",
                            name: "x-tenant-id"
                        }
                    }
                },
                // Add your API documentation here
                paths: {
                    "/balance-groups": {
                        get: {
                            summary: "List all balance groups",
                            security: [
                                { bearerAuth: [], tenantHeader: [] }
                            ],
                            responses: {
                                "200": {
                                    description: "List of balance groups"
                                }
                            }
                        },
                        post: {
                            summary: "Create a new balance group",
                            security: [
                                { bearerAuth: [], tenantHeader: [] }
                            ],
                            requestBody: {
                                required: true,
                                content: {
                                    "application/json": {
                                        schema: {
                                            type: "object",
                                            required: ["name", "startTime", "endTime"],
                                            properties: {
                                                name: { type: "string" },
                                                startTime: { type: "string", format: "date-time" },
                                                endTime: { type: "string", format: "date-time" },
                                                settlementRule: { type: "string" }
                                            }
                                        }
                                    }
                                }
                            },
                            responses: {
                                "201": {
                                    description: "Balance group created successfully"
                                }
                            }
                        }
                    }
                    // Add more API documentation paths here
                }
            };
        }
    },

    created() {
        // Service created lifecycle event
        this.logger.info("API Gateway service created");
    },

    started() {
        // Service started lifecycle event
        this.logger.info(`API Gateway listening on port ${this.settings.port}`);
    },

    stopped() {
        // Service stopped lifecycle event
        this.logger.info("API Gateway stopped");
    }
};
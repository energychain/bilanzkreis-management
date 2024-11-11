// services/auth/auth.service.js
"use strict";

const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { MoleculerError } = require("moleculer").Errors;
const DbService = require("moleculer-db");
const MongoDBAdapter = require("moleculer-db-adapter-mongo");
const { config } = require("../../bootstrap");

module.exports = {
    name: "auth",
    mixins: [DbService],

    adapter: new MongoDBAdapter(config.mongodb.uri),
    collection: "users",

    settings: {
        JWT_SECRET: process.env.JWT_SECRET || "your-secret-key",
        JWT_EXPIRATION: process.env.JWT_EXPIRATION || "24h",

        fields: [
            "_id",
            "username",
            "email",
            "password",
            "firstName",
            "lastName",
            "roles",         // ['admin', 'user', etc.]
            "tenants",       // Array von Tenant-IDs, zu denen der User Zugriff hat
            "permissions",   // Spezifische Berechtigungen
            "status",       // 'active', 'inactive', 'blocked'
            "lastLogin",
            "createdAt",
            "updatedAt"
        ],

        entityValidator: {
            username: { type: "string", min: 3 },
            email: { type: "email" },
            password: { type: "string", min: 6 },
            firstName: { type: "string", optional: true },
            lastName: { type: "string", optional: true },
            roles: { type: "array", items: "string", default: ["user"] },
            tenants: { type: "array", items: "string", default: [] },
            permissions: { type: "array", items: "string", default: [] },
            status: { type: "enum", values: ["active", "inactive", "blocked"], default: "active" }
        }
    },

    actions: {
        /**
         * Benutzerregistrierung
         */
        register: {
            params: {
                username: { type: "string", min: 3 },
                email: { type: "email" },
                password: { type: "string", min: 6 },
                firstName: { type: "string", optional: true },
                lastName: { type: "string", optional: true },
                tenantId: { type: "string" }  // Initial tenant for the user
            },
            async handler(ctx) {
                const { username, email, password } = ctx.params;

                // Prüfe ob Benutzer bereits existiert
                const exists = await this.adapter.findOne({
                    $or: [{ username }, { email }]
                });

                if (exists) {
                    throw new MoleculerError(
                        "Username or email already exists",
                        409,
                        "USER_EXISTS"
                    );
                }

                // Validiere Tenant
                const tenant = await ctx.call("tenant.get", { id: ctx.params.tenantId });
                if (!tenant) {
                    throw new MoleculerError("Invalid tenant", 400, "INVALID_TENANT");
                }

                // Hash password
                const hashedPassword = await bcrypt.hash(password, 10);

                // Erstelle neuen Benutzer
                const user = await this.adapter.insert({
                    ...ctx.params,
                    password: hashedPassword,
                    roles: ["user"],
                    tenants: [ctx.params.tenantId],
                    permissions: [],
                    status: "active",
                    createdAt: new Date(),
                    updatedAt: new Date()
                });

                delete user.password;
                
                return user;
            }
        },

        /**
         * Benutzer-Login
         */
        login: {
            params: {
                username: { type: "string" },
                password: { type: "string" },
                tenantId: { type: "string" }
            },
            async handler(ctx) {
                const { username, password, tenantId } = ctx.params;

                // Finde Benutzer
                const user = await this.adapter.findOne({
                    $or: [
                        { username },
                        { email: username }
                    ]
                });

                if (!user) {
                    throw new MoleculerError("Invalid credentials", 401, "INVALID_CREDENTIALS");
                }

                // Prüfe Status
                if (user.status !== "active") {
                    throw new MoleculerError("Account is not active", 403, "INACTIVE_ACCOUNT");
                }

                // Prüfe Tenant-Zugriff
                if (!user.tenants.includes(tenantId)) {
                    throw new MoleculerError("No access to this tenant", 403, "INVALID_TENANT_ACCESS");
                }

                // Prüfe Passwort
                const passwordValid = await bcrypt.compare(password, user.password);
                if (!passwordValid) {
                    throw new MoleculerError("Invalid credentials", 401, "INVALID_CREDENTIALS");
                }

                // Update lastLogin
                await this.adapter.updateById(user._id, {
                    $set: {
                        lastLogin: new Date(),
                        updatedAt: new Date()
                    }
                });

                // Erstelle JWT Token
                const token = this.generateJWT(user);

                return {
                    token,
                    user: this.sanitizeUser(user)
                };
            }
        },

        /**
         * Token validieren
         */
        validateToken: {
            params: {
                token: "string"
            },
            handler(ctx) {
                try {
                    const decoded = jwt.verify(ctx.params.token, this.settings.JWT_SECRET);
                    return { valid: true, user: decoded };
                } catch(err) {
                    return { valid: false, error: err.message };
                }
            }
        },

        /**
         * Benutzerberechtigungen prüfen
         */
        hasPermission: {
            params: {
                userId: "string",
                permission: "string",
                tenantId: "string"
            },
            async handler(ctx) {
                const user = await this.getById(ctx.params.userId);
                
                if (!user) {
                    return false;
                }

                // Prüfe Tenant-Zugriff
                if (!user.tenants.includes(ctx.params.tenantId)) {
                    return false;
                }

                // Admin hat alle Rechte
                if (user.roles.includes("admin")) {
                    return true;
                }

                return user.permissions.includes(ctx.params.permission);
            }
        },

        /**
         * Tenant zu Benutzer hinzufügen
         */
        addTenant: {
            params: {
                userId: "string",
                tenantId: "string"
            },
            async handler(ctx) {
                const user = await this.getById(ctx.params.userId);
                
                if (!user) {
                    throw new MoleculerError("User not found", 404, "USER_NOT_FOUND");
                }

                // Prüfe ob Tenant existiert
                const tenant = await ctx.call("tenant.get", { id: ctx.params.tenantId });
                if (!tenant) {
                    throw new MoleculerError("Tenant not found", 404, "TENANT_NOT_FOUND");
                }

                // Füge Tenant hinzu, wenn noch nicht vorhanden
                if (!user.tenants.includes(ctx.params.tenantId)) {
                    await this.adapter.updateById(user._id, {
                        $push: { tenants: ctx.params.tenantId },
                        $set: { updatedAt: new Date() }
                    });
                }

                return this.getById(user._id);
            }
        },

        /**
         * Passwort ändern
         */
        changePassword: {
            params: {
                userId: "string",
                oldPassword: "string",
                newPassword: { type: "string", min: 6 }
            },
            async handler(ctx) {
                const user = await this.getById(ctx.params.userId);
                
                if (!user) {
                    throw new MoleculerError("User not found", 404, "USER_NOT_FOUND");
                }

                // Prüfe altes Passwort
                const passwordValid = await bcrypt.compare(ctx.params.oldPassword, user.password);
                if (!passwordValid) {
                    throw new MoleculerError("Invalid old password", 400, "INVALID_PASSWORD");
                }

                // Hash neues Passwort
                const hashedPassword = await bcrypt.hash(ctx.params.newPassword, 10);

                // Update Passwort
                await this.adapter.updateById(user._id, {
                    $set: {
                        password: hashedPassword,
                        updatedAt: new Date()
                    }
                });

                return { success: true };
            }
        }
    },

    methods: {
        /**
         * JWT Token generieren
         */
        generateJWT(user) {
            return jwt.sign(
                {
                    id: user._id,
                    username: user.username,
                    email: user.email,
                    roles: user.roles,
                    tenants: user.tenants,
                    permissions: user.permissions
                },
                this.settings.JWT_SECRET,
                {
                    expiresIn: this.settings.JWT_EXPIRATION
                }
            );
        },

        /**
         * Sensitive Benutzerdaten entfernen
         */
        sanitizeUser(user) {
            const sanitized = { ...user };
            delete sanitized.password;
            return sanitized;
        }
    },

    hooks: {
        before: {
            // Verhindere direkten Zugriff auf Benutzerpasswörter
            "*": function(ctx) {
                if (ctx.params.populate && ctx.params.populate.includes("password")) {
                    throw new MoleculerError("Password field cannot be populated", 403);
                }
            }
        }
    },

    events: {
        "user.registered"(user) {
            this.broker.logger.info("New user registered:", user.username);
        },
        
        "user.login"(user) {
            this.broker.logger.info("User logged in:", user.username);
        },

        "user.password-changed"(userId) {
            this.broker.logger.info("Password changed for user:", userId);
        }
    },

    async started() {
        // Erstelle Admin-Benutzer beim Start, falls noch nicht vorhanden
        const adminExists = await this.adapter.findOne({ username: "admin" });
        
        if (!adminExists) {
            const hashedPassword = await bcrypt.hash(process.env.ADMIN_INITIAL_PASSWORD || "admin", 10);
            
            await this.adapter.insert({
                username: "admin",
                email: process.env.ADMIN_EMAIL || "admin@system.local",
                password: hashedPassword,
                roles: ["admin"],
                tenants: [],  // Admin hat zunächst Zugriff auf keine Tenants
                permissions: ["*"],
                status: "active",
                createdAt: new Date(),
                updatedAt: new Date()
            });

            this.logger.info("Admin user created");
        }
    }
};
// tests/helpers/testHelper.js
const { ServiceBroker } = require("moleculer");
const { MongoMemoryServer } = require("mongodb-memory-server");

/**
 * Creates a test environment with in-memory MongoDB and Service Broker
 */
async function setupTestEnvironment() {
    // Start MongoDB Memory Server
    const mongod = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongod.getUri();

    // Create Service Broker
    const broker = new ServiceBroker({
        logger: false,
        validator: true,
        metrics: false,
        tracing: false
    });

    return { broker, mongod };
}

/**
 * Cleans up the test environment
 */
async function cleanupTestEnvironment(broker, mongod) {
    if (broker) {
        await broker.stop();
    }
    if (mongod) {
        await mongod.stop();
    }
}

/**
 * Creates test data for a tenant
 */
async function createTestTenant(broker, tenantId = "test-tenant-id") {
    return await broker.call("tenant.create", {
        name: "Test Tenant",
        identifier: tenantId,
        settings: {}
    });
}

/**
 * Creates a test balance group
 */
async function createTestBalanceGroup(broker, { 
    name = "Test Group",
    tenantId = "test-tenant-id",
    startTime = new Date("2024-01-01T00:00:00Z"),
    endTime = new Date("2024-12-31T23:59:59Z"),
    settlementRule = null
} = {}) {
    return await broker.call("balance-group.create", {
        name,
        tenantId,
        startTime,
        endTime,
        settlementRule
    });
}

module.exports = {
    setupTestEnvironment,
    cleanupTestEnvironment,
    createTestTenant,
    createTestBalanceGroup
};
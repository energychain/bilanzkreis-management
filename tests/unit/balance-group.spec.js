// tests/unit/balance-group.spec.js
const { ServiceBroker } = require("moleculer");
const ValidationService = require("../../services/validation/validation.service");
const BalanceGroupService = require("../../services/balance-group/balance-group.service");
const TransactionService = require("../../services/transaction/transaction.service");

describe("Balance Group Service Tests", () => {
    let broker;
    let testTenantId;

    beforeAll(async () => {
        // Create broker
        broker = new ServiceBroker({
            logger: false,
            validator: true
        });

        // Load required services
        broker.createService(BalanceGroupService);
        broker.createService(ValidationService);
        broker.createService(TransactionService);

        await broker.start();
        testTenantId = "test-tenant-id";
    });

    afterAll(async () => {
        await broker.stop();
    });

    describe("CRUD Operations", () => {
        let balanceGroupId;

        it("should create a balance group successfully", async () => {
            const testData = {
                name: "Test Balance Group",
                startTime: new Date("2024-01-01T00:00:00Z"),
                endTime: new Date("2024-12-31T23:59:59Z"),
                tenantId: testTenantId
            };

            const result = await broker.call("balance-group.create", testData);

            expect(result).toBeDefined();
            expect(result._id).toBeDefined();
            expect(result.name).toBe(testData.name);
            expect(result.status).toBe("provisional");
            expect(result.tenantId).toBe(testTenantId);

            balanceGroupId = result._id.toString();
        });

        it("should retrieve a balance group by id", async () => {
            const result = await broker.call("balance-group.findById", {
                id: balanceGroupId,
                tenantId: testTenantId
            });

            expect(result).toBeDefined();
            expect(result._id.toString()).toBe(balanceGroupId);
            expect(result.tenantId).toBe(testTenantId);
        });

        it("should list all balance groups for a tenant", async () => {
            const result = await broker.call("balance-group.listByTenant", {
                tenantId: testTenantId
            });

            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBeGreaterThan(0);
            expect(result[0].tenantId).toBe(testTenantId);
        });

        it("should close a balance group", async () => {
            const result = await broker.call("balance-group.setFinal", {
                id: balanceGroupId,
                tenantId: testTenantId
            });

            expect(result.status).toBe("final");
        });
    });

    describe("Validation Cases", () => {
        it("should fail when end time is before start time", async () => {
            const testData = {
                name: "Invalid Time Group",
                startTime: new Date("2024-12-31T23:59:59Z"),
                endTime: new Date("2024-01-01T00:00:00Z"),
                tenantId: testTenantId
            };

            await expect(broker.call("balance-group.create", testData))
                .rejects.toThrow("Start time must be before end time");
        });

        it("should fail with missing tenant id", async () => {
            const testData = {
                name: "Test Group",
                startTime: new Date("2024-01-01T00:00:00Z"),
                endTime: new Date("2024-12-31T23:59:59Z")
            };

            await expect(broker.call("balance-group.create", testData))
                .rejects.toThrow();
        });
    });
    describe("Error Handling", () => {
        it("should handle non-existent balance group for findById", async () => {
            await expect(broker.call("balance-group.findById", {
                id: "non-existent-id",
                tenantId: testTenantId
            })).rejects.toThrow("Balance group not found");
        });

        it("should handle non-existent balance group for setFinal", async () => {
            await expect(broker.call("balance-group.setFinal", {
                id: "non-existent-id",
                tenantId: testTenantId
            })).rejects.toThrow("Balance group not found");
        });

        it("should prevent finalizing an already final balance group", async () => {
            // Erstelle einen neuen Bilanzkreis
            const testData = {
                name: "Test Final Group",
                startTime: new Date("2024-01-01T00:00:00Z"),
                endTime: new Date("2024-12-31T23:59:59Z"),
                tenantId: testTenantId
            };
            
            const group = await broker.call("balance-group.create", testData);
            
            // Setze ihn auf final
            await broker.call("balance-group.setFinal", {
                id: group._id.toString(),
                tenantId: testTenantId
            });

            // Versuche erneut auf final zu setzen
            await expect(broker.call("balance-group.setFinal", {
                id: group._id.toString(),
                tenantId: testTenantId
            })).rejects.toThrow("Balance group is already closed");
        });
    });
});
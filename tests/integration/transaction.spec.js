// tests/integration/transaction.spec.js
const { ServiceBroker } = require("moleculer");
const TransactionService = require("../../services/transaction/transaction.service");
const BalanceGroupService = require("../../services/balance-group/balance-group.service");
const ValidationService = require("../../services/validation/validation.service");

describe("Transaction Integration Tests", () => {
    let broker;
    const testTenantId = "test-tenant-id";

    beforeAll(async () => {
        broker = new ServiceBroker({
            logger: false,
            validator: true
        });

        // Load services
        broker.createService(TransactionService);
        broker.createService(BalanceGroupService);
        broker.createService(ValidationService);

        await broker.start();
    });

    afterAll(async () => {
        await broker.stop();
    });

    describe("Transaction Flow", () => {
        it("should create a transaction between two balance groups", async () => {
            // Create source balance group
            const source = await broker.call("balance-group.create", {
                name: "Source Group",
                startTime: new Date("2024-01-01T00:00:00Z"),
                endTime: new Date("2024-12-31T23:59:59Z"),
                tenantId: testTenantId
            });
            
            // Ensure sourceId is a string
            const sourceId = source._id.toString();

            // Create destination balance group
            const destination = await broker.call("balance-group.create", {
                name: "Destination Group",
                startTime: new Date("2024-01-01T00:00:00Z"),
                endTime: new Date("2024-12-31T23:59:59Z"),
                tenantId: testTenantId
            });
            
            // Ensure destinationId is a string
            const destinationId = destination._id.toString();

            // Create transaction with string IDs
            const transaction = await broker.call("transaction.create", {
                name: "Test Transaction",
                sourceId: sourceId,                    // Verwende String-ID
                destinationId: destinationId,          // Verwende String-ID
                startTime: new Date("2024-01-01T00:00:00Z"),
                endTime: new Date("2024-01-01T00:15:00Z"),
                energyAmount: 1000,
                tenantId: testTenantId
            });

            // Verify transaction
            expect(transaction).toBeDefined();
            expect(transaction.sourceId).toBe(sourceId);
            expect(transaction.destinationId).toBe(destinationId);
            expect(transaction.status).toBe("provisional");
            expect(transaction.energyAmount).toBe(1000);
            expect(transaction.tenantId).toBe(testTenantId);

            // Test retrieving the transaction
            const retrieved = await broker.call("transaction.get", {
                id: transaction._id.toString(),
                tenantId: testTenantId
            });

            expect(retrieved).toBeDefined();
            expect(retrieved._id.toString()).toBe(transaction._id.toString());

            // Test finalizing the transaction
            const finalized = await broker.call("transaction.finalize", {
                id: transaction._id.toString(),
                tenantId: testTenantId
            });

            expect(finalized.status).toBe("final");
        });
    });
});
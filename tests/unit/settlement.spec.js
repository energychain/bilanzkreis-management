// tests/unit/settlement.spec.js
const { ServiceBroker } = require("moleculer");
const SettlementService = require("../../services/settlement/settlement.service");
const TransactionService = require("../../services/transaction/transaction.service");
const BalanceGroupService = require("../../services/balance-group/balance-group.service");
const ValidationService = require("../../services/validation/validation.service");

describe("Settlement Service Tests", () => {
    let broker;
    let testTenantId;
    let sourceGroupId;
    let destinationGroupId;
    let settlementGroupId;

    beforeAll(async () => {
        broker = new ServiceBroker({
            logger: false,
            validator: true
        });

        broker.createService(SettlementService);
        broker.createService(TransactionService);
        broker.createService(BalanceGroupService);
        broker.createService(ValidationService);

        await broker.start();
        testTenantId = "test-tenant-id";
    });

    beforeEach(async () => {
        // Erstelle Settlement Group (übergeordneter Bilanzkreis)
        const settlementGroup = await broker.call("balance-group.create", {
            name: "Settlement Group",
            startTime: new Date("2024-01-01T00:00:00Z"),
            endTime: new Date("2024-12-31T23:59:59Z"),
            tenantId: testTenantId
        });
        settlementGroupId = settlementGroup._id.toString();

        // Erstelle Source Group mit Settlement Rule
        const sourceGroup = await broker.call("balance-group.create", {
            name: "Source Group",
            startTime: new Date("2024-01-01T00:00:00Z"),
            endTime: new Date("2024-12-31T23:59:59Z"),
            tenantId: testTenantId,
            settlementRule: settlementGroupId
        });
        sourceGroupId = sourceGroup._id.toString();

        // Erstelle Destination Group mit Settlement Rule
        const destGroup = await broker.call("balance-group.create", {
            name: "Destination Group",
            startTime: new Date("2024-01-01T00:00:00Z"),
            endTime: new Date("2024-12-31T23:59:59Z"),
            tenantId: testTenantId,
            settlementRule: settlementGroupId
        });
        destinationGroupId = destGroup._id.toString();
    });

    afterAll(async () => {
        await broker.stop();
    });

    describe("Settlement Creation", () => {
        it("should create settlements for a new transaction", async () => {
            // Erstelle eine Test-Transaktion
            const transaction = await broker.call("transaction.create", {
                name: "Test Transaction",
                sourceId: sourceGroupId,
                destinationId: destinationGroupId,
                startTime: new Date("2024-01-01T00:00:00Z"),
                endTime: new Date("2024-01-01T00:15:00Z"),
                energyAmount: 1000,
                tenantId: testTenantId
            });

            // Berechne Settlements für die Transaktion
            const settlements = await broker.call("settlement.calculateSettlement", {
                transactionId: transaction._id.toString(),
                tenantId: testTenantId
            });

            expect(settlements).toBeDefined();
            expect(Array.isArray(settlements)).toBe(true);
            expect(settlements.length).toBe(2); // Ein Settlement pro Bilanzkreis

            // Prüfe Source Settlement
            const sourceSettlement = settlements.find(s => s.balanceGroupId === sourceGroupId);
            expect(sourceSettlement).toBeDefined();
            expect(sourceSettlement.targetGroupId).toBe(settlementGroupId);
            expect(sourceSettlement.energyAmount).toBe(1000);
            expect(sourceSettlement.status).toBe("provisional");

            // Prüfe Destination Settlement
            const destSettlement = settlements.find(s => s.balanceGroupId === destinationGroupId);
            expect(destSettlement).toBeDefined();
            expect(destSettlement.targetGroupId).toBe(settlementGroupId);
            expect(destSettlement.energyAmount).toBe(-1000);
            expect(destSettlement.status).toBe("provisional");
        });

        it("should handle 15-minute intervals correctly", async () => {
            // Erstelle eine Stunden-Transaktion
            const transaction = await broker.call("transaction.create", {
                name: "Hour Transaction",
                sourceId: sourceGroupId,
                destinationId: destinationGroupId,
                startTime: new Date("2024-01-01T00:00:00Z"),
                endTime: new Date("2024-01-01T01:00:00Z"), // 1 Stunde
                energyAmount: 1000,
                tenantId: testTenantId
            });

            const settlements = await broker.call("settlement.calculateSettlement", {
                transactionId: transaction._id.toString(),
                tenantId: testTenantId
            });

            // Prüfe Intervalle
            const sourceSettlements = settlements.filter(s => s.balanceGroupId === sourceGroupId);
            expect(sourceSettlements.length).toBe(4); // 4 15-Minuten-Intervalle pro Stunde
            expect(sourceSettlements[0].energyAmount).toBe(250); // 1000 / 4 pro Intervall
        });
    });

    describe("Settlement Finalization", () => {
        it("should finalize settlements with transaction", async () => {
            // Erstelle Test-Transaktion
            const transaction = await broker.call("transaction.create", {
                name: "Test Transaction",
                sourceId: sourceGroupId,
                destinationId: destinationGroupId,
                startTime: new Date("2024-01-01T00:00:00Z"),
                endTime: new Date("2024-01-01T00:15:00Z"),
                energyAmount: 1000,
                tenantId: testTenantId
            });
        
            // Berechne Settlements
            await broker.call("settlement.calculateSettlement", {
                transactionId: transaction._id.toString(),
                tenantId: testTenantId
            });
        
            // Finalisiere Settlements
            await broker.call("transaction.finalize", {
                id: transaction._id.toString(),
                tenantId: testTenantId
            });

            // Prüfe Settlement-Status
            const settlements = await broker.call("settlement.findByTransaction", {
                transactionId: transaction._id.toString(),
                tenantId: testTenantId
            });            
            expect(settlements.every(s => s.status === "final")).toBe(true);
        });
    });

    describe("Settlement Balance", () => {
        it("should calculate settlement balance for a period", async () => {
            // Erstelle zwei gegenläufige Transaktionen
            await broker.call("transaction.create", {
                name: "Transaction 1",
                sourceId: sourceGroupId,
                destinationId: destinationGroupId,
                startTime: new Date("2024-01-01T00:00:00Z"),
                endTime: new Date("2024-01-01T00:15:00Z"),
                energyAmount: 1000,
                tenantId: testTenantId
            });

            await broker.call("transaction.create", {
                name: "Transaction 2",
                sourceId: destinationGroupId,
                destinationId: sourceGroupId,
                startTime: new Date("2024-01-01T00:15:00Z"),
                endTime: new Date("2024-01-01T00:30:00Z"),
                energyAmount: 500,
                tenantId: testTenantId
            });

            // Berechne Settlements für beide Transaktionen
            const balance = await broker.call("settlement.getBalance", {
                balanceGroupId: sourceGroupId,
                startTime: new Date("2024-01-01T00:00:00Z"),
                endTime: new Date("2024-01-01T00:30:00Z"),
                tenantId: testTenantId
            });

            expect(balance).toBeDefined();
            expect(balance.totalAmount).toBe(-500); // 1000 outgoing - 500 incoming
            expect(balance.intervals.length).toBe(2); // Zwei 15-Minuten-Intervalle
        });
    });

    describe("Validation Cases", () => {
        it("should prevent settlement calculation for invalid tenant", async () => {
            const transaction = await broker.call("transaction.create", {
                name: "Test Transaction",
                sourceId: sourceGroupId,
                destinationId: destinationGroupId,
                startTime: new Date("2024-01-01T00:00:00Z"),
                endTime: new Date("2024-01-01T00:15:00Z"),
                energyAmount: 1000,
                tenantId: testTenantId
            });

            await expect(broker.call("settlement.calculateSettlement", {
                transactionId: transaction._id.toString(),
                tenantId: "wrong-tenant-id"
            })).rejects.toThrow(/invalid tenant/i);
        });

        it("should prevent settlement calculation for finalized transaction", async () => {
            const transaction = await broker.call("transaction.create", {
                name: "Test Transaction",
                sourceId: sourceGroupId,
                destinationId: destinationGroupId,
                startTime: new Date("2024-01-01T00:00:00Z"),
                endTime: new Date("2024-01-01T00:15:00Z"),
                energyAmount: 1000,
                tenantId: testTenantId
            });

            // Finalisiere die Transaktion
            await broker.call("transaction.finalize", {
                id: transaction._id.toString(),
                tenantId: testTenantId
            });

            await expect(broker.call("settlement.calculateSettlement", {
                transactionId: transaction._id.toString(),
                tenantId: testTenantId
            })).rejects.toThrow(/transaction is already finalized/i);
        });
    });
});
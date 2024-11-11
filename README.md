# Bilanzkreis Management

Eine microservice-basierte Implementierung zur Verwaltung von Bilanzkreisen, Transaktionen und Settlements in der Energiewirtschaft.

## Überblick

Das System basiert auf dem Moleculer Framework und besteht aus drei Hauptkomponenten:

- **Balance Group Service**: Verwaltung von Bilanzkreisen und deren Hierarchien
- **Transaction Service**: Handling von Energiemengen-Transaktionen
- **Settlement Service**: Berechnung und Verwaltung von Ausgleichsbuchungen

## Installation

```bash
# Repository klonen
git clone https://github.com/energychain/bilanzkreis-management.git
cd bilanzkreis-management

# Dependencies installieren
npm install

# Entwicklungsumgebung starten
npm run setup:dev
```

## Voraussetzungen

- Node.js >= 18
- MongoDB
- NATS Server
- Docker & Docker Compose (für lokale Entwicklung)

## Konfiguration

Die Konfiguration erfolgt über Umgebungsvariablen in der `.env`-Datei:

```env
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/bilanzkreis
NATS_URL=nats://localhost:4222
JWT_SECRET=your-secret-key
JWT_EXPIRATION=24h
```

## Services

### Balance Group Service

Verwaltet Bilanzkreise im System:

```javascript
// Beispiel: Erstellen eines Bilanzkreises
await broker.call("balance-group.create", {
    name: "Hauptbilanzkreis",
    startTime: new Date("2024-01-01T00:00:00Z"),
    endTime: new Date("2024-12-31T23:59:59Z"),
    tenantId: "tenant-123",
    settlementRule: "parent-balance-group-id"
});
```

### Transaction Service

Handhabt Energiemengen-Transaktionen zwischen Bilanzkreisen:

```javascript
// Beispiel: Erstellen einer Transaktion
await broker.call("transaction.create", {
    name: "Energielieferung",
    sourceId: "source-balance-group-id",
    destinationId: "destination-balance-group-id",
    startTime: new Date("2024-01-01T00:00:00Z"),
    endTime: new Date("2024-01-01T00:15:00Z"),
    energyAmount: 1000,
    tenantId: "tenant-123"
});
```

### Settlement Service

Berechnet und verwaltet Ausgleichsbuchungen:

```javascript
// Beispiel: Berechnung von Settlements
await broker.call("settlement.calculateSettlement", {
    transactionId: "transaction-id",
    tenantId: "tenant-123"
});
```

## Testing

Das Projekt enthält umfangreiche Test-Suites:

```bash
# Alle Tests ausführen
npm test

# Spezifische Tests ausführen
npm test -- tests/unit/balance-group.spec.js
npm test -- tests/unit/transaction.spec.js
npm test -- tests/unit/settlement.spec.js
```

## Besonderheiten

- Mandantenfähigkeit durch `tenantId`
- 15-Minuten-Intervall-basierte Verarbeitung
- Event-basierte Service-Kommunikation
- Automatische Settlement-Generierung
- Hierarchische Bilanzkreis-Struktur

## API Dokumentation

Die API-Dokumentation ist über Swagger/OpenAPI verfügbar:
```
http://localhost:3000/api/documentation
```

## Entwicklung

```bash
# Entwicklungsserver starten
npm run dev

# Linting durchführen
npm run lint

# Docker-Container starten
npm run dc:up

# Docker-Container stoppen
npm run dc:down
```

## Projektstruktur

```
bilanzkreis-management/
├── services/
│   ├── balance-group/
│   ├── transaction/
│   └── settlement/
├── tests/
│   ├── unit/
│   └── integration/
├── config/
└── docs/
```

## Contributing

Bitte lesen Sie [CONTRIBUTING.md](CONTRIBUTING.md) für Details zu unserem Code of Conduct und dem Prozess für Pull Requests.

## Lizenz

Dieses Projekt ist unter der [MIT-Lizenz](LICENSE) lizenziert.

## Team

- STROMDAO GmbH
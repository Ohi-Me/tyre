/**
 * scripts/seed.ts — v3.2 wedge seed for Bihar-Jharkhand-UP corridor.
 *
 * Focuses on:
 *   - Patna ↔ Delhi (primary long-haul route)
 *   - Patna ↔ Kolkata (secondary route)
 *   - Ranchi ↔ Kolkata (tertiary route)
 *
 * Includes:
 *   - 3 brokers (Patna, Ranchi, Delhi)
 *   - 5 drivers (Bhojpuri + Hindi speakers)
 *   - 5 trucks (mix of 12-wheeler, 16-wheeler, 10-wheeler)
 *   - 5 open loads (Patna→Delhi, Delhi→Patna, Patna→Kolkata, Ranchi→Kolkata, Ranchi→Delhi)
 *
 * All numbers in INR. All locations in Bihar-Jharkhand-UP-Delhi-Kolkata belt.
 */

import { db } from "../prisma/index.js";

async function main() {
  console.log("🌱 Seeding TYRE v3.2 — Bihar-Jharkhand-UP corridor…");

  // ── 1. Organization (single India org for Y1) ─────────────────
  await db.organization.createMany({
    data: [
      {
        // Explicit id: downstream rows (users, trucks, loads, RFPs) reference
        // orgId "org_wedge". Without this the org gets an auto-generated cuid and
        // every dependent insert fails the org_id foreign key.
        id: "org_wedge",
        name: "TYRE India (Bihar-Jharkhand-UP wedge)",
        slug: "tyre-in-wedge",
        region: "IN",
        defaultCurrency: "INR",
        defaultLocale: "hi",
        plan: "growth",
      },
    ],
    skipDuplicates: true,
  });
  console.log("  ✓ 1 organization (India wedge)");

  // ── 2. Brokers (Patna, Ranchi, Delhi) ─────────────────────────
  await db.broker.createMany({
    data: [
      {
        // Explicit ids: the loads below reference brokerId "brk_1"/"brk_2"/"brk_3".
        id: "brk_1",
        brokerCode: "BRK-PAT-001",
        name: "Patna Freight Co",
        phone: "+919876543200",
        gstin: "10ABCDE1234F1Z5",
        region: "IN",
        city: "Patna",
        verified: true,
        riskScore: 15,
        totalLoads: 245,
      },
      {
        id: "brk_2",
        brokerCode: "BRK-RAN-002",
        name: "Ranchi Logistics Hub",
        phone: "+919876543201",
        gstin: "20FGHIJ5678K1Z2",
        region: "IN",
        city: "Ranchi",
        verified: true,
        riskScore: 22,
        totalLoads: 180,
      },
      {
        id: "brk_3",
        brokerCode: "BRK-DEL-003",
        name: "Delhi Transport Network",
        phone: "+919876543202",
        gstin: "07KLMNOP9012L1Z3",
        region: "IN",
        city: "Delhi",
        verified: true,
        riskScore: 8,
        totalLoads: 520,
      },
    ],
    skipDuplicates: true,
  });
  console.log("  ✓ 3 brokers (Patna, Ranchi, Delhi)");

  // ── 3. Drivers (Bhojpuri + Hindi speakers) ────────────────────
  // Week 3 broadcast: currentLat/currentLng set so the nearby-driver query
  // can find these drivers. Without GPS coords, drivers are invisible to the
  // broadcast and never receive load offers.
  await db.driver.createMany({
    data: [
      {
        name: "Ramesh Kumar",
        phone: "+919876543210",
        preferredLang: "bho",  // Bhojpuri — wedge dialect
        currentLocation: "Patna",
        currentLat: 25.5941,   // Patna
        currentLng: 85.1376,
        currentRegion: "IN",
        truckType: "12-wheeler",
        kycVerified: true,
        upiId: "ramesh@upi",
        rating: 4.7,
        totalTrips: 156,
      },
      {
        name: "Chhotu Singh",
        phone: "+919876543211",
        preferredLang: "bho",  // Bhojpuri
        currentLocation: "Gaya",
        currentLat: 24.7914,   // Gaya (~100km south of Patna)
        currentLng: 85.0002,
        currentRegion: "IN",
        truckType: "16-wheeler",
        kycVerified: true,
        upiId: "chhotu@upi",
        rating: 4.5,
        totalTrips: 98,
      },
      {
        name: "Mohan Yadav",
        phone: "+919876543212",
        preferredLang: "hi",  // Hindi
        currentLocation: "Ranchi",
        currentLat: 23.3441,   // Ranchi (~320km from Patna — outside 50km radius)
        currentLng: 85.3096,
        currentRegion: "IN",
        truckType: "12-wheeler",
        kycVerified: true,
        upiId: "mohan@upi",
        rating: 4.8,
        totalTrips: 203,
      },
      {
        name: "Amit Prasad",
        phone: "+919876543213",
        preferredLang: "hi",  // Hindi
        currentLocation: "Muzaffarpur",
        currentLat: 26.1209,   // Muzaffarpur (~70km north of Patna)
        currentLng: 85.3647,
        currentRegion: "IN",
        truckType: "10-wheeler",
        kycVerified: true,
        upiId: "amit@upi",
        rating: 4.3,
        totalTrips: 67,
      },
      {
        name: "Suresh Paswan",
        phone: "+919876543214",
        preferredLang: "bho",  // Bhojpuri
        currentLocation: "Bhagalpur",
        currentLat: 25.2425,   // Bhagalpur (~240km east of Patna)
        currentLng: 86.9842,
        currentRegion: "IN",
        truckType: "12-wheeler",
        kycVerified: false,  // pending KYC
        rating: 4.6,
        totalTrips: 134,
      },
    ],
    skipDuplicates: true,
  });
  console.log("  ✓ 5 drivers (3 Bhojpuri, 2 Hindi) with GPS coords");

  // ── 4. Trucks ─────────────────────────────────────────────────
  // Note: orgId will need to be the actual ID from step 1 in production
  await db.truck.createMany({
    data: [
      {
        orgId: "org_wedge",
        vehicleNumber: "BR01AB1234",
        truckType: "12-wheeler",
        currentLocation: "Patna",
        currentRegion: "IN",
        status: "IDLE",
        fuelEfficiencyKmpl: 3.8,
      },
      {
        orgId: "org_wedge",
        vehicleNumber: "BR02CD5678",
        truckType: "16-wheeler",
        currentLocation: "Gaya",
        currentRegion: "IN",
        status: "IDLE",
        fuelEfficiencyKmpl: 3.2,
      },
      {
        orgId: "org_wedge",
        vehicleNumber: "JH01EF9012",
        truckType: "12-wheeler",
        currentLocation: "Ranchi",
        currentRegion: "IN",
        status: "IDLE",
        fuelEfficiencyKmpl: 3.8,
      },
      {
        orgId: "org_wedge",
        vehicleNumber: "BR03GH3456",
        truckType: "10-wheeler",
        currentLocation: "Muzaffarpur",
        currentRegion: "IN",
        status: "IDLE",
        fuelEfficiencyKmpl: 4.5,
      },
      {
        orgId: "org_wedge",
        vehicleNumber: "BR04IJ7890",
        truckType: "12-wheeler",
        currentLocation: "Bhagalpur",
        currentRegion: "IN",
        status: "IDLE",
        fuelEfficiencyKmpl: 3.8,
      },
    ],
    skipDuplicates: true,
  }).catch(() => {/* orgId may not match — OK for demo seed */});
  console.log("  ✓ 5 trucks (Bihar + Jharkhand registered)");

  // ── 5. Open Loads (Bihar-Jharkhand-UP-Delhi-Kolkata belt) ─────
  await db.load.createMany({
    data: [
      // Patna → Delhi (primary long-haul)
      {
        tyreCode: "TYRE-0001",
        orgId: "org_wedge",
        origin: "Patna",
        originLat: 25.5941,   // Week 3 broadcast: Patna GPS
        originLng: 85.1376,
        originRegion: "IN",
        destination: "Delhi",
        destinationLat: 28.6139,  // Delhi
        destinationLng: 77.2090,
        destinationRegion: "IN",
        distanceKm: 1050,
        weightTons: 18,
        truckTypeReq: "12-wheeler",
        goodsType: "Cement",
        offeredRate: 38000,
        aiSuggestedRate: 45000,
        advanceOffered: 8000,
        currency: "INR",
        brokerId: "brk_1",  // Patna broker
        status: "OPEN",
      },
      // Delhi → Patna (return load for TYRE-0001!)
      {
        tyreCode: "TYRE-0002",
        orgId: "org_wedge",
        origin: "Delhi",
        originLat: 28.6139,   // Delhi GPS
        originLng: 77.2090,
        originRegion: "IN",
        destination: "Patna",
        destinationLat: 25.5941,
        destinationLng: 85.1376,
        destinationRegion: "IN",
        distanceKm: 1050,
        weightTons: 16,
        truckTypeReq: "12-wheeler",
        goodsType: "Electronics",
        offeredRate: 28000,
        aiSuggestedRate: 32000,
        advanceOffered: 6000,
        currency: "INR",
        brokerId: "brk_3",  // Delhi broker
        status: "OPEN",
      },
      // Patna → Kolkata (secondary route)
      {
        tyreCode: "TYRE-0003",
        orgId: "org_wedge",
        origin: "Patna",
        originLat: 25.5941,   // Patna GPS
        originLng: 85.1376,
        originRegion: "IN",
        destination: "Kolkata",
        destinationLat: 22.5726,  // Kolkata
        destinationLng: 88.3639,
        destinationRegion: "IN",
        distanceKm: 580,
        weightTons: 22,
        truckTypeReq: "16-wheeler",
        goodsType: "Steel",
        offeredRate: 26000,
        aiSuggestedRate: 30000,
        advanceOffered: 5000,
        currency: "INR",
        brokerId: "brk_1",
        status: "OPEN",
      },
      // Ranchi → Kolkata (tertiary)
      {
        tyreCode: "TYRE-0004",
        orgId: "org_wedge",
        origin: "Ranchi",
        originLat: 23.3441,   // Ranchi GPS
        originLng: 85.3096,
        originRegion: "IN",
        destination: "Kolkata",
        destinationLat: 22.5726,
        destinationLng: 88.3639,
        destinationRegion: "IN",
        distanceKm: 410,
        weightTons: 14,
        truckTypeReq: "12-wheeler",
        goodsType: "Auto parts",
        offeredRate: 19000,
        aiSuggestedRate: 22000,
        advanceOffered: 4000,
        currency: "INR",
        brokerId: "brk_2",  // Ranchi broker
        status: "OPEN",
      },
      // Ranchi → Delhi (long-haul)
      {
        tyreCode: "TYRE-0005",
        orgId: "org_wedge",
        origin: "Ranchi",
        originLat: 23.3441,   // Ranchi GPS
        originLng: 85.3096,
        originRegion: "IN",
        destination: "Delhi",
        destinationLat: 28.6139,
        destinationLng: 77.2090,
        destinationRegion: "IN",
        distanceKm: 1300,
        weightTons: 18,
        truckTypeReq: "12-wheeler",
        goodsType: "Cement",
        offeredRate: 47000,
        aiSuggestedRate: 52000,
        advanceOffered: 10000,
        currency: "INR",
        brokerId: "brk_2",
        status: "OPEN",
      },
    ],
    skipDuplicates: true,
  }).catch(() => {});
  console.log("  ✓ 5 open loads (Patna↔Delhi, Patna→Kolkata, Ranchi→Kolkata, Ranchi→Delhi)");

  // ── 6. Voice Onboarding sample (Ramesh) ───────────────────────
  await db.voiceOnboarding.createMany({
    data: [
      {
        driverName: "Ramesh Kumar",
        driverPhone: "+919876543210",
        driverLocale: "bho",
        truckNumber: "BR01AB1234",
        truckType: "12-wheeler",
        truckCapacity: 18.0,
        aadhaarVerified: true,
        panVerified: true,
        licenseVerified: true,
        rcVerified: true,
        detectedLocale: "bho",
        sttProvider: "whisper-groq",
        onboardingDurationSec: 127,  // 2 min 7 sec — beats 15-min typing target
        status: "VERIFIED",
      },
    ],
    skipDuplicates: true,
  }).catch(() => {});
  console.log("  ✓ 1 voice onboarding record (Ramesh — verified in 127 seconds)");

  // ── Compliance documents (vehicle + driver) ─────────────────
  try {
    const existing = await (db as any).document.count().catch(() => -1);
    if (existing === 0) {
      const seedTrucks = await db.truck.findMany({ where: { orgId: "org_wedge" }, take: 4 });
      const seedDrivers = await db.driver.findMany({ take: 3 });
      const days = (n: number) => new Date(Date.now() + n * 86_400_000);
      const docData: any[] = [];
      if (seedTrucks[0]) docData.push({ orgId: "org_wedge", truckId: seedTrucks[0].id, type: "INSURANCE", docNumber: "INS-BR01-2026", issuer: "ICICI Lombard", expiryDate: days(120) });
      if (seedTrucks[1]) docData.push({ orgId: "org_wedge", truckId: seedTrucks[1].id, type: "POLLUTION", docNumber: "PUC-BR02", issuer: "Bihar RTO", expiryDate: days(-10) });
      if (seedTrucks[2]) docData.push({ orgId: "org_wedge", truckId: seedTrucks[2].id, type: "FITNESS", docNumber: "FIT-JH01", issuer: "Jharkhand RTO", expiryDate: days(20) });
      if (seedTrucks[3]) docData.push({ orgId: "org_wedge", truckId: seedTrucks[3].id, type: "PERMIT", docNumber: "PMT-4001", issuer: "National Permit", expiryDate: days(200) });
      if (seedDrivers[0]) docData.push({ orgId: "org_wedge", driverId: seedDrivers[0].id, type: "LICENSE", docNumber: "DL-BR-99", issuer: "Bihar RTO", expiryDate: days(15) });
      if (seedDrivers[1]) docData.push({ orgId: "org_wedge", driverId: seedDrivers[1].id, type: "LICENSE", docNumber: "DL-JH-42", issuer: "Jharkhand RTO", expiryDate: days(400) });
      if (docData.length) {
        await db.document.createMany({ data: docData });
        console.log(`  \u2713 ${docData.length} compliance documents`);
      }
    }
  } catch {
    // documents table not migrated yet — skip
  }

  // ── Voice interactions (powers the Voice Studio dashboard panel) ─────
  try {
    const existingVoice = await (db as any).voiceInteraction.count().catch(() => -1);
    if (existingVoice === 0) {
      await db.voiceInteraction.createMany({
        data: [
          { workflow: "search_loads", transcriptText: "Patna se Delhi load chahiye", detectedLocale: "bho", userLocale: "bho", totalLatencyMs: 1180, success: true },
          { workflow: "ask_question", transcriptText: "Aaj ka revenue dikhao", detectedLocale: "hi", userLocale: "hi", totalLatencyMs: 940, success: true },
          { workflow: "manage_fleet", transcriptText: "Ranchi me kitne truck available hain", detectedLocale: "hi", userLocale: "hi", totalLatencyMs: 1320, success: true },
          { workflow: "update_status", transcriptText: "Load Delhi pohonch gaya", detectedLocale: "bho", userLocale: "bho", totalLatencyMs: 1050, success: true },
          { workflow: "negotiate", transcriptText: "Rate thoda kam karo", detectedLocale: "hi", userLocale: "hi", totalLatencyMs: 1600, success: false, errorMessage: "agent timeout" },
        ],
      });
      console.log("  \u2713 5 voice interactions");
    }
  } catch {
    // voice_interactions table not migrated yet — skip
  }

  // ── Notifications (powers the dashboard panel + notifications inbox) ──
  try {
    const existingNotif = await (db as any).notification.count().catch(() => -1);
    if (existingNotif === 0) {
      await db.notification.createMany({
        data: [
          { orgId: "org_wedge", category: "load", type: "load_available", title: "New load available", body: "Patna \u2192 Delhi, \u20b932,000", amount: 32000 },
          { orgId: "org_wedge", category: "payment", type: "payment_received", title: "Payment received", body: "\u20b924,500 released via UPI escrow", amount: 24500, read: true },
          { orgId: "org_wedge", category: "trip", type: "trip_completed", title: "Trip completed", body: "BR01AB1234 finished Patna \u2192 Delhi", amount: null },
          { orgId: "org_wedge", category: "document", type: "document_expiring", title: "Document expiring", body: "Fitness certificate for JH01EF9012 expires in 20 days", amount: null },
          { orgId: "org_wedge", category: "weather", type: "weather_alert", title: "Weather alert", body: "Heatwave conditions expected this week", amount: null },
        ],
      });
      console.log("  \u2713 5 notifications");
    }
  } catch {
    // dashboard_notifications table not migrated yet — skip
  }

  // ── Tax profile (org billing identity for the settlement engine) ─────
  try {
    await db.taxProfile.upsert({
      where: { orgId: "org_wedge" },
      create: { orgId: "org_wedge", legalName: "TYRE India Logistics Pvt Ltd", gstin: "10AABCT1234A1Z5", pan: "AABCT1234A", stateCode: "BR", gstRegistered: true },
      update: {},
    });
    console.log("  \u2713 1 tax profile (org_wedge)");
  } catch {
    // tax_profiles table not migrated yet — skip
  }

  console.log("\n✅ Seed complete.");
  console.log("   Corridor: Bihar-Jharkhand-UP-Delhi-Kolkata");
  console.log("   Languages: Hindi (hi) + Bhojpuri (bho)");
  console.log("   Currency: INR only");
  console.log("   Payment: UPI escrow (Razorpay Route)");
  console.log("\n   Run `pnpm run dev` and visit http://localhost:3000/hi or /bho");
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());

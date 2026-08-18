"use client";

import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/api/auth-fetch";

// ── Types ───────────────────────────────────────────────────────────────────
export interface DashboardData {
  // Top metrics
  activeTripsCount: number;
  openLoadsCount: number;
  todayRevenue: number;
  onTimeRate: number;
  fleetPerformance: number;
  tripsCompletedToday: number;
  utilization: number;
  avgTripTimeMinutes: number;
  totalTrucks: number;
  activeTrucks: number;
  totalLoads: number;
  usedLoads: number;
  truckUtilization: number;
  loadUtilization: number;

  // Dispatch panel
  dispatch: {
    totalLoads: number;
    inTransit: number;
    delivered: number;
    delayed: number;
    avgDispatchTime: string;
    onTimeDispatch: number;
    cancelledLoads: number;
    driverAvailability: number;
    utilization: number;
    recentLoads: {
      id: string;
      tyreCode: string;
      origin: string;
      destination: string;
      truckNumber: string;
      driver: string;
      status: string;
      eta: string;
    }[];
  };

  // Fleet panel
  fleet: {
    totalVehicles: number;
    running: number;
    maintenance: number;
    idle: number;
    offline: number;
    totalCapacityTons: number;
    avgFuelEfficiency: number;
    maintenanceDue: number;
    insuranceExpiring: number;
    trucks: {
      id: string;
      vehicleNumber: string;
      truckType: string;
      driver: string;
      fuelPct: number;
      mileage: number;
      status: string;
      utilization: number;
    }[];
  };

  // Drivers panel
  drivers: {
    totalDrivers: number;
    active: number;
    onTrip: number;
    inactive: number;
    avgRating: number;
    topPerformer: string;
    safetyScore: number;
    documentsExpiring: number;
    list: {
      id: string;
      name: string;
      phone: string;
      trips: number;
      rating: number;
      performance: number;
      status: string;
    }[];
  };

  // Trips panel
  trips: {
    all: number;
    ongoing: number;
    completed: number;
    cancelled: number;
    list: {
      id: string;
      tyreCode: string;
      origin: string;
      destination: string;
      driver: string;
      status: string;
      eta: string | null;
    }[];
  };

  // Load Board panel
  loadBoard: {
    myLoads: number;
    active: number;
    draft: number;
    list: {
      id: string;
      tyreCode: string;
      origin: string;
      destination: string;
      loadType: string;
      amount: number;
      status: string;
    }[];
  };

  // Documents panel
  documents: {
    valid: number;
    expiring: number;
    expired: number;
    summary: { name: string; value: number; color: string }[];
    list: {
      id: string;
      type: string;
      vehicle: string | null;
      driver: string | null;
      expiryDate: string;
      status: string;
    }[];
  };

  // Insights panel
  insights: {
    totalRevenue: number;
    totalTrips: number;
    avgRevenuePerTrip: number;
    onTimeDelivery: number;
    revenuePoints: { date: string; revenue: number; trips: number }[];
    topRoutes: {
      origin: string;
      destination: string;
      revenue: number;
      tripsCount: number;
    }[];
  };

  // Reports panel
  reports: {
    id: string;
    type: string;
    category: string;
    date: string;
    format: string;
  }[];

  // Voice Studio panel
  voiceStudio: {
    conversations: { id: string; text: string; time: string }[];
    commands: { id: string; name: string; description: string; icon: string }[];
    usageThisWeek: number;
    avgResponseTime: string;
    accuracy: number;
  };

  // Active trips + recent trips + notifications + weather
  activeTrips: {
    id: string;
    status: string;
    progress: number;
    origin: string;
    destination: string;
    truckNumber: string;
    driverName: string;
    driverPhone?: string | null;
    rate: number;
    advance: number;
    startedAt: string | null;
    eta: string | null;
  }[];
  recentTrips: {
    id: string;
    tyreCode: string;
    origin: string;
    destination: string;
    driverName: string;
    status: string;
    rate: number;
    paymentStatus: string;
    eta: string | null;
    progress: number;
  }[];
  notifications: {
    id: string;
    type: string;
    title: string;
    body: string;
    amount: number | null;
    read: boolean;
    createdAt: string;
  }[];
  weather: {
    city: string;
    tempC: number;
    condition: string;
    alert: string | null;
  } | null;
}

// ── Hooks ───────────────────────────────────────────────────────────────────
export function useDashboard() {
  return useQuery<DashboardData>({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const res = await authFetch("/api/v1/dashboard");
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const json = await res.json();
      return json.data;
    },
  });
}

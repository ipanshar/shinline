// import { useState } from "react";
import { Head } from "@inertiajs/react";
import AppLayout from "@/layouts/app-layout";
import { type BreadcrumbItem } from "@/types";
// import AddVehicleDialog from "@/components/vehicles/AddVehicleDialog";
// import VehicleSearch from "@/components/vehicles/VehicleSearch";
// import VehicleList from "@/components/vehicles/VehicleList";
// import SecurityCheck from "@/components/check/SecurityCheck";
// import { Vehicle, searchVehicles } from "@/lib/api";
// import axios from "axios";
// import TrucksTable from "@/components/check/TrucksTable";
import SecurityCheckMobile from "@/components/check/SecurityCheckMobile";

const breadcrumbs: BreadcrumbItem[] = [
  {
    title: "КПП",
    href: "/check",
  },
];

export default function Check() {
  return (
    <AppLayout breadcrumbs={breadcrumbs}>
      <Head title="КПП - Охрана" />
      <div className="flex h-full flex-1 flex-col">
        <SecurityCheckMobile />
      </div>
    </AppLayout>
  );
}

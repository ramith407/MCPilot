import type { Metadata } from "next";
import { DoctorClient } from "./doctor-client";
import "./doctor.css";

export const metadata: Metadata = {
  title: "MCP Doctor",
};

export default function DoctorPage() {
  return <DoctorClient />;
}


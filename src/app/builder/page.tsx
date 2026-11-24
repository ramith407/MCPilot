import type { Metadata } from "next";
import { BuilderClient } from "./builder-client";
import "./builder.css";

export const metadata: Metadata = {
  title: "Integration Builder",
};

export default function BuilderPage() {
  return <BuilderClient />;
}

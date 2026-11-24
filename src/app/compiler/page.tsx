import type { Metadata } from "next";
import { CompilerClient } from "./compiler-client";
import "./compiler.css";

export const metadata: Metadata = {
  title: "Config Compiler",
};

export default function CompilerPage() {
  return <CompilerClient />;
}

